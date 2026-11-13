"""Text retrieval: heading-aware chunking, BM25 + optional MiniLM embeddings, fused with reciprocal rank fusion."""
import math
import re
import threading
from collections import Counter

from . import store
from .config import CHUNK_CHARS, CHUNK_OVERLAP, EMBED_MODEL, EMBED_BATCH, USE_EMBEDDINGS

STOP = set("""a an the of to in on for and or is are was were be been being by with as at from that this these those it its
which what who whom whose when where why how do does did can could should would will shall may might must not no
than then there their they them we you your i me my our about into over under per vs versus between""".split())

def tokens(text):
    return [t for t in re.findall(r"[a-z0-9]+(?:[-'][a-z0-9]+)*", text.lower()) if t not in STOP]

def stem(t):
    for suf in ("ies", "es", "s", "ing", "ed"):
        if len(t) > len(suf) + 2 and t.endswith(suf):
            return t[: -len(suf)] + ("y" if suf == "ies" else "")
    return t

def terms(text):
    return [stem(t) for t in tokens(text)]

# ------------------------------------------------------------ chunking

HEADING = re.compile(r"^\s*(#{1,6}\s+.+|\d+(\.\d+)*\s+[A-Z].{2,80}|[A-Z][A-Z0-9 ,&/-]{3,80})\s*$")

def chunk_text(text):
    """Yields (heading, chunk). Splits on paragraphs, never mid-sentence, carries an overlap tail."""
    heading, buf, out = "", "", []
    paras = re.split(r"\n\s*\n", text.replace("\r", ""))
    for para in paras:
        para = para.strip()
        if not para:
            continue
        first = para.split("\n", 1)[0]
        if HEADING.match(first) and len(first) < 90:
            if buf.strip():
                out.append((heading, buf.strip()))
                buf = ""
            heading = first.lstrip("# ").strip()
            para = para[len(first):].strip()
            if not para:
                continue
        if len(buf) + len(para) + 1 <= CHUNK_CHARS:
            buf += ("\n" if buf else "") + para
            continue
        if buf:
            out.append((heading, buf.strip()))
            tail = " ".join(re.split(r"(?<=[.!?])\s+", buf)[-2:])
            buf = tail[-CHUNK_OVERLAP:] + "\n" if CHUNK_OVERLAP else ""
        while len(para) > CHUNK_CHARS:
            cut = para.rfind(". ", 0, CHUNK_CHARS)
            cut = cut + 1 if cut > CHUNK_CHARS // 2 else CHUNK_CHARS
            out.append((heading, (buf + para[:cut]).strip()))
            buf, para = "", para[cut:].strip()
        buf += para
    if buf.strip():
        out.append((heading, buf.strip()))
    return out

def headings(pages):
    hs = []
    for _, text in pages:
        for line in text.splitlines():
            if HEADING.match(line) and 3 < len(line.strip()) < 90:
                hs.append(line.lstrip("# ").strip())
    return hs[:60]

# ------------------------------------------------------------ embeddings

_model, _model_lock, _model_failed = None, threading.Lock(), False

def embedder():
    global _model, _model_failed
    if USE_EMBEDDINGS == "off" or _model_failed:
        return None
    with _model_lock:
        if _model is None:
            try:
                from sentence_transformers import SentenceTransformer
                _model = SentenceTransformer(EMBED_MODEL, device="cpu")
            except Exception:
                _model_failed = True
                if USE_EMBEDDINGS == "on":
                    raise
                return None
    return _model

def embed(texts):
    m = embedder()
    if m is None:
        return None
    return m.encode(texts, batch_size=EMBED_BATCH, normalize_embeddings=True, show_progress_bar=False).tolist()

def embeddings_name():
    return EMBED_MODEL.split("/")[-1] if embedder() is not None else "BM25 only"

# ------------------------------------------------------------ index

class _Index:
    def __init__(self):
        self.lock = threading.Lock()
        self.dirty = True

    def build(self):
        rows = store.cursor().execute("SELECT chunk_id, source_file, kind, locator, text, embedding FROM chunks").fetchall()
        self.docs = rows
        self.tf = [Counter(terms(r[4])) for r in rows]
        self.len = [sum(t.values()) for t in self.tf]
        self.avg = (sum(self.len) / len(self.len)) if self.len else 1
        df = Counter()
        for t in self.tf:
            df.update(t.keys())
        n = len(rows)
        self.idf = {w: math.log(1 + (n - d + 0.5) / (d + 0.5)) for w, d in df.items()}
        self.vocab = df
        tv = Counter()
        for r, t in zip(rows, self.tf):
            if r[2] == "text":
                tv.update(t.keys())
        self.text_vocab = tv
        import numpy as np
        self.emb_ids = [i for i, r in enumerate(rows) if r[5] is not None]
        self.emb = np.array([rows[i][5] for i in self.emb_ids], dtype="float32") if self.emb_ids else None
        self.dirty = False

    def ensure(self):
        with self.lock:
            if self.dirty:
                self.build()

INDEX = _Index()

def add_chunks(recs, embed=True):
    """recs: (chunk_id, source_file, kind, locator, text)."""
    if not recs:
        return
    vecs = None
    if embed:
        vecs = []
        for i in range(0, len(recs), 2048):
            part = globals()["embed"]([r[4] for r in recs[i:i + 2048]])
            if part is None:
                vecs = None
                break
            vecs += part
    import pandas as pd
    df = pd.DataFrame(recs, columns=["chunk_id", "source_file", "kind", "locator", "text"])
    df["embedding"] = vecs if vecs else None
    df = df.drop_duplicates("chunk_id", keep="last")
    c = store.cursor()
    c.register("_new_chunks", df)
    c.execute("DELETE FROM chunks WHERE chunk_id IN (SELECT chunk_id FROM _new_chunks)")
    c.execute("INSERT INTO chunks SELECT chunk_id, source_file, kind, locator, text, "
              "CAST(embedding AS FLOAT[]) FROM _new_chunks")
    c.unregister("_new_chunks")
    INDEX.dirty = True

def search(query, k=8, sources=None, kinds=("text",)):
    INDEX.ensure()
    q = terms(query)
    if not q or not INDEX.docs:
        return []
    k1, b = 1.4, 0.75
    allowed = [i for i, d in enumerate(INDEX.docs)
               if (not sources or d[1] in sources) and (not kinds or d[2] in kinds)]
    bm = []
    for i in allowed:
        tf, s = INDEX.tf[i], 0.0
        for w in q:
            f = tf.get(w)
            if f:
                s += INDEX.idf.get(w, 0) * f * (k1 + 1) / (f + k1 * (1 - b + b * INDEX.len[i] / INDEX.avg))
        if s > 0:
            bm.append((s, i))
    bm.sort(reverse=True)
    ranks = {i: r for r, (_, i) in enumerate(bm[:100])}
    fused = {i: 1 / (60 + r) for i, r in ranks.items()}
    qv = embed([query])
    if qv and INDEX.emb is not None:
        import numpy as np
        allowed_set = set(allowed)
        scores = INDEX.emb @ np.array(qv[0], dtype="float32")
        sims = sorted(((float(s), INDEX.emb_ids[j]) for j, s in enumerate(scores)
                       if INDEX.emb_ids[j] in allowed_set), reverse=True)
        for r, (_, i) in enumerate(sims[:100]):
            fused[i] = fused.get(i, 0) + 1 / (60 + r)
    best = sorted(fused.items(), key=lambda x: -x[1])[:k]
    out = []
    for i, score in best:
        d = INDEX.docs[i]
        out.append(dict(id=d[0], source=d[1], kind=d[2], locator=d[3], text=d[4], score=round(score, 4),
                        bm25=round(next((s for s, j in bm if j == i), 0), 3)))
    return out

def related_terms(query, passages, n=4):
    """Pseudo-relevance feedback: distinctive corpus terms from the best passages (real vocabulary, not templates)."""
    INDEX.ensure()
    qset = set(terms(query))
    cnt = Counter()
    for p in [p for p in passages if p.get("kind") == "text"][:4]:
        for w in set(terms(p["text"])):
            if w not in qset and len(w) > 3 and not w.isdigit():
                cnt[w] += INDEX.idf.get(w, 0)
    return [w for w, _ in cnt.most_common(n)]

def vocab_suggest(word, n=3):
    """Closest corpus words to an unmatched query word (spelling/variant repair)."""
    import difflib
    INDEX.ensure()
    return difflib.get_close_matches(stem(word), list(INDEX.text_vocab.keys()), n=n, cutoff=0.8)
