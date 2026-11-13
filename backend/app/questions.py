"""Questions generated FROM the ingested data, with ground truth computed by SQL.
Used for the 'Try a question' chips and as the Evaluation lab question set, so both always match what was uploaded."""
import random
import re

from . import store
from .tabular import PLACEHOLDERS

PRETTY = {"twp": "township", "addr": "address", "desc": "description", "qty": "quantity", "amt": "amount",
          "dept": "department", "num": "number", "cnt": "count", "zip": "ZIP code"}

def pretty(col):
    if col.get("derived") and col["name"].endswith("_category"):
        base = col["name"][: -len("_category")]
        return f"{PRETTY.get(base, base)} category"
    if col.get("derived") and col["name"].endswith("_detail"):
        base = col["name"][: -len("_detail")]
        return f"{PRETTY.get(base, base)} type"
    lab = col["label"].strip()
    return PRETTY.get(lab.lower(), lab.lower() if lab.isupper() or "_" in col["name"] else lab)

from .linker import row_noun  # noqa: E402

def _placeholder_sql(c):
    return f"lower(trim(CAST(\"{c}\" AS VARCHAR))) NOT IN ({','.join(repr(x) for x in PLACEHOLDERS)})"

def _family(name):
    return re.sub(r"_\d+_", "_N_", name)

def table_questions(t):
    prof, tn, noun = t["profile"], t["table_name"], row_noun(t)
    c = store.cursor()
    cols = prof["columns"]
    qs, fams = [], set()
    cats = []
    for col in cols:
        if col["role"] != "categorical" or not (2 <= (col["distinct"] or 0) <= 20000) or col["name"] in {"date", "time"}:
            continue
        if col["null_frac"] > 0.6 or _family(col["name"]) in fams:
            continue
        fams.add(_family(col["name"]))
        cats.append(col)
    cats.sort(key=lambda x: (0 if 3 <= x["distinct"] <= 300 else 1, x["null_frac"]))
    has_ts = any(x["name"] == "_ts" for x in cols)
    src = t["source_file"]

    for col in cats[:3]:
        top = c.execute(f'SELECT "{col["name"]}", count(*) n FROM "{tn}" WHERE "{col["name"]}" IS NOT NULL AND '
                        f'{_placeholder_sql(col["name"])} GROUP BY 1 ORDER BY n DESC LIMIT 1').fetchone()
        if top:
            qs.append(dict(q=f"Which {pretty(col)} had the most {noun}?", expect=str(top[0]), kind="aggregate", source=src))
    small = [x for x in cats if 2 <= x["distinct"] <= 12]
    if small:
        col = small[0]
        top = c.execute(f'SELECT "{col["name"]}" FROM "{tn}" WHERE "{col["name"]}" IS NOT NULL GROUP BY 1 '
                        f'ORDER BY count(*) DESC LIMIT 1').fetchone()
        qs.append(dict(q=f"What share of {noun} falls in each {pretty(col)}?", expect=str(top[0]), kind="breakdown", source=src))
    if len(cats) >= 2:
        a, b = cats[0], (small[0] if small and small[0] is not cats[0] else cats[1])
        val = c.execute(f'SELECT "{b["name"]}" FROM "{tn}" WHERE {_placeholder_sql(b["name"])} AND "{b["name"]}" IS NOT NULL '
                        f'GROUP BY 1 ORDER BY count(*) DESC LIMIT 1 OFFSET 1').fetchone()
        if val:
            v = str(val[0])
            top = c.execute(f'SELECT "{a["name"]}" FROM "{tn}" WHERE "{b["name"]}" = ? AND "{a["name"]}" IS NOT NULL AND '
                            f'{_placeholder_sql(a["name"])} GROUP BY 1 ORDER BY count(*) DESC LIMIT 1', [v]).fetchone()
            if top:
                qs.append(dict(q=f"Which {pretty(a)} had the most {v.title() if v.isupper() else v} {noun}?",
                               expect=str(top[0]), kind="filtered aggregate", source=src))
            n = c.execute(f'SELECT count(*) FROM "{tn}" WHERE "{b["name"]}" = ?', [v]).fetchone()[0]
            qs.append(dict(q=f"How many {v.title() if v.isupper() else v} {noun} were there?", expect=f"{n:,}",
                           kind="count", source=src))
    metrics = [x for x in cols if x["role"] == "numeric" and (x["distinct"] or 0) > 1 and x["null_frac"] < 0.5]
    metrics.sort(key=lambda x: (0 if any(k in x["name"] for k in ("killed", "injured", "amount", "sales", "revenue",
                                                                 "quantity", "count", "price")) else 1))
    for m in metrics[:2]:
        if any(k in m["name"] for k in ("killed", "injured", "amount", "sales", "revenue", "quantity", "count")):
            s = c.execute(f'SELECT sum("{m["name"]}") FROM "{tn}"').fetchone()[0]
            qs.append(dict(q=f"How many {pretty(m)} in total?" if "killed" in m["name"] or "injured" in m["name"]
                           else f"What is the total {pretty(m)}?", expect=_num(s), kind="total", source=src))
    if has_ts:
        y = c.execute(f'SELECT year(_ts), count(*) n FROM "{tn}" WHERE _ts IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 1').fetchone()
        if y:
            qs.append(dict(q=f"Which year had the most {noun}?", expect=str(y[0]), kind="time", source=src))
        hrs = c.execute(f'SELECT count(DISTINCT hour(_ts)) FROM "{tn}"').fetchone()[0]
        if hrs and hrs > 6:
            h = c.execute(f'SELECT hour(_ts), count(*) n FROM "{tn}" GROUP BY 1 ORDER BY n DESC LIMIT 1').fetchone()
            qs.append(dict(q=f"Which hour of the day has the most {noun}?", expect=f"{int(h[0]):02d}:00", kind="time", source=src))
        mx = c.execute(f'SELECT max(year(_ts)) FROM "{tn}"').fetchone()[0]
        qs.append(dict(q=f"How many {noun} were there in {mx + 3}?", expect=None, kind="unanswerable", source=src))
    missing = next((m for m in ("response time", "customer age", "ticket price", "repair cost")
                    if not any(m.split()[0] in x["name"] for x in cols)), None)
    if missing:
        qs.append(dict(q=f"What was the average {missing} for these {noun}?", expect=None, kind="unanswerable", source=src))
    return qs

def _num(x):
    return f"{x:,.0f}" if x is not None and float(x).is_integer() else f"{x:,.2f}"

MUST = re.compile(r"^([A-Z][^.]{3,60}?)\s+(must|shall|should)\s+(not\s+)?(be\s+)?([a-z]+)\b(.*)$")

def text_questions(doc_source):
    rows = store.cursor().execute("SELECT chunk_id, locator, text FROM chunks WHERE source_file=? AND kind='text'",
                                  [doc_source]).fetchall()
    qs = []
    for cid, loc, text in rows:
        for sent in re.split(r"(?<=[.!?])\s+", text):
            sent = sent.strip()
            m = MUST.match(sent)
            if m and len(qs) < 8:
                subj = m.group(1).strip()
                subj = subj[0].lower() + subj[1:] if not subj[:2].isupper() else subj
                verb = m.group(5)
                key = re.findall(r"[A-Za-z0-9-]*\d[A-Za-z0-9-]*|[A-Z][A-Za-z0-9-]{2,}", m.group(6))
                if verb in {"stored", "encrypted", "reported", "kept", "used", "reviewed"}:
                    q = f"How must {subj} be {verb}?"
                elif verb == "at" or "least" in m.group(6)[:12]:
                    q = f"What is the minimum requirement for {subj}?"
                else:
                    q = f"What does the policy say {subj} {m.group(2)} do?"
                qs.append(dict(q=q, expect=(key[0] if key else m.group(5)), kind="document", source=doc_source))
            elif re.search(r"\bhas (\w+) (phases|steps|stages)\b", sent) and len(qs) < 8:
                subj = sent.split(" has ")[0]
                qs.append(dict(q=f"What are the phases of {subj[0].lower() + subj[1:]}?",
                               expect=sent.split(":")[-1].split(",")[0].strip(), kind="document", source=doc_source))
    qs.append(dict(q="What is the annual budget mentioned for next year?", expect=None, kind="unanswerable", source=doc_source))
    return qs

def generate(sources=None, per_source=6, seed=7):
    out = []
    for t in store.catalog():
        if sources and t["source_file"] not in sources:
            continue
        qs = table_questions(t) if t["kind"] == "table" else text_questions(t["source_file"])
        answerable = _diverse([q for q in qs if q["kind"] != "unanswerable"], per_source)
        out += answerable + [q for q in qs if q["kind"] == "unanswerable"][:2]
    return out

def _diverse(qs, n):
    """Round-robin over question kinds so the set exercises different query shapes."""
    by_kind = {}
    for q in qs:
        by_kind.setdefault(q["kind"], []).append(q)
    out = []
    while len(out) < n and any(by_kind.values()):
        for k in list(by_kind):
            if by_kind[k] and len(out) < n:
                out.append(by_kind[k].pop(0))
    return out

def suggestions(sources=None, n=4):
    qs = generate(sources, per_source=3)
    rnd = random.Random(len(qs))
    picks = [q for q in qs if q["kind"] != "unanswerable"]
    rnd.shuffle(picks)
    picks = picks[: n - 1] + [q for q in qs if q["kind"] == "unanswerable"][:1]
    return [dict(question=q["q"], source=q["source"], answerable=q["kind"] != "unanswerable") for q in picks]
