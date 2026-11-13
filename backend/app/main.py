"""Self-Healing RAG API (the contract used by the React frontend).

Run:  uvicorn app.main:app --port 8000      (from the backend folder)"""
import asyncio
import hashlib
import json
import re
import shutil
import statistics
import threading
import time
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, healer, ingest, jobs, llm, meta, questions, settings_store, store, textrag, verifier
from .config import MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_MB, MAX_UPLOAD_MB, UPLOAD_DIR

app = FastAPI(title="Self-Healing RAG", version=config.VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                                                  "http://localhost:4173", "http://127.0.0.1:4173"],
                   allow_methods=["*"], allow_headers=["*"])
API = "/api/v1"
SAMPLE = Path(__file__).parent / "sample_data" / "security_handbook.md"
SYSTEM_FILES = re.compile(r"(^|/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini|\._)", re.I)


@app.on_event("startup")
def _startup():
    store.con()
    jobs.start()

    def warm():
        textrag.embedder()
        textrag.INDEX.ensure()
    threading.Thread(target=warm, daemon=True).start()

# =============================================================================== health / settings


@app.get(f"{API}/health")
def health():
    prov, model = settings_store.active()
    return dict(status="ok", version=config.VERSION, provider=prov, model=model,
                embedding=settings_store.embedding_info(), vector_store="DuckDB + BM25")


@app.get(f"{API}/settings")
def get_settings():
    return settings_store.payload()


@app.put(f"{API}/settings")
async def put_settings(request: Request):
    settings_store.update(await request.json())
    return settings_store.payload()


@app.post(f"{API}/settings/reload")
def reload_settings():
    settings_store.reload_env()
    return settings_store.payload()


class ProviderTest(BaseModel):
    provider: str


@app.post(f"{API}/settings/test")
def test_provider(body: ProviderTest):
    if body.provider == "offline":
        return dict(ok=True, model="extractive", latency_ms=0)
    cfg = settings_store.llm_config(body.provider)
    if not cfg:
        return dict(ok=False, detail="This provider isn't set up. Add its API key to backend/.env and click Reload .env.")
    return llm.test(cfg)

# =============================================================================== documents


def _doc_out(d):
    return dict(id=d["id"], name=d["name"], extension=d["extension"], size_bytes=d["size_bytes"] or 0,
                status=d["status"], pages=d["pages"] or 0, chunk_count=d["chunk_count"] or 0, error=d["error"],
                embedding_model=d["embedding_model"], index_version=d["index_version"],
                cleaning=meta.loads(d["cleaning"]), created_at=d["created_at"], indexed_at=d["indexed_at"],
                job=meta.loads(d["job"]) if d["status"] in ("queued", "processing", "failed") else None)


def _unique_store_name(name):
    taken = {r["store_name"] for r in meta.q("SELECT store_name FROM documents")}
    if name not in taken:
        return name
    stem, ext = Path(name).stem, Path(name).suffix
    i = 2
    while f"{stem} ({i}){ext}" in taken:
        i += 1
    return f"{stem} ({i}){ext}"


def _find_duplicate(sha):
    return meta.one("SELECT * FROM documents WHERE sha256=? AND status IN ('ready','queued','processing') "
                    "ORDER BY created_at LIMIT 1", (sha,))


def _register(path: Path, name: str, sha: str, size: int, queue=True):
    doc_id = meta.new_id()
    meta.insert("documents", dict(id=doc_id, name=name, store_name=_unique_store_name(name),
                                  extension=Path(name).suffix.lower().lstrip("."), size_bytes=size, sha256=sha,
                                  path=str(path), status="queued", created_at=meta.now()))
    job_id = jobs.enqueue(doc_id) if queue else None
    return meta.one("SELECT * FROM documents WHERE id=?", (doc_id,)), job_id


@app.get(f"{API}/documents")
def list_documents():
    return [_doc_out(d) for d in meta.q("SELECT * FROM documents ORDER BY created_at DESC")]


@app.get(f"{API}/documents/{{doc_id}}")
def get_document(doc_id: str):
    d = meta.one("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not d:
        raise HTTPException(404, "Document not found.")
    return _doc_out(d)


@app.post(f"{API}/documents/stream")
async def upload_stream(request: Request, filename: str):
    """Raw-body upload (no multipart parsing): streamed to disk once while hashing."""
    name = Path(filename).name or "upload"
    ext = Path(name).suffix.lower()
    is_zip = ext == ".zip"
    if not is_zip and ext not in ingest.SUPPORTED:
        raise HTTPException(415, f"{ext or 'This file type'} isn't supported. Use PDF, Word, Excel, CSV, TSV, JSON, "
                                 "HTML, text, Markdown or a ZIP of them.")
    limit = (MAX_ARCHIVE_MB if is_zip else MAX_UPLOAD_MB) * 1024 * 1024
    folder = UPLOAD_DIR / meta.new_id()
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / name
    h, size = hashlib.sha256(), 0
    try:
        with open(dest, "wb") as out:
            async for chunk in request.stream():
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"The file is larger than the {limit // 1024 // 1024} MB limit.")
                h.update(chunk)
                await asyncio.to_thread(out.write, chunk)
    except HTTPException:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    if size == 0:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(400, "The file is empty.")
    sha = h.hexdigest()
    if is_zip:
        return await asyncio.to_thread(_unpack_archive, dest, name, folder)
    dup = _find_duplicate(sha)
    if dup:
        shutil.rmtree(folder, ignore_errors=True)
        return dict(document=_doc_out(dup), job_id=None, duplicate=True)
    doc, job_id = _register(dest, name, sha, size)
    return dict(document=_doc_out(doc), job_id=job_id, duplicate=False)


def _unpack_archive(zpath: Path, zname: str, folder: Path):
    report = dict(archive=zname, summary=dict(files_found=0, queued=0, duplicates=0, skipped=0, system_files_ignored=0),
                  duplicates=[], skipped=[])
    seen = set()
    try:
        _walk_zip(zpath, folder, report, seen, depth=0)
    except zipfile.BadZipFile:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(400, "This ZIP file is damaged or isn't a ZIP archive.")
    zpath.unlink(missing_ok=True)
    return report


def _walk_zip(zpath, folder, report, seen, depth):
    s = report["summary"]
    with zipfile.ZipFile(zpath) as z:
        members = [m for m in z.infolist() if not m.is_dir()]
        for m in members:
            if SYSTEM_FILES.search(m.filename):
                s["system_files_ignored"] += 1
                continue
            s["files_found"] += 1
            if s["files_found"] > MAX_ARCHIVE_ENTRIES:
                report["skipped"].append(dict(name=m.filename, reason=f"over the {MAX_ARCHIVE_ENTRIES}-file limit"))
                s["skipped"] += 1
                continue
            name = Path(m.filename).name
            ext = Path(name).suffix.lower()
            if ext == ".zip" and depth < 2:
                inner = folder / f"_{meta.new_id()}.zip"
                with z.open(m) as src, open(inner, "wb") as dst:
                    shutil.copyfileobj(src, dst, 16 * 1024 * 1024)
                s["files_found"] -= 1
                try:
                    _walk_zip(inner, folder, report, seen, depth + 1)
                finally:
                    inner.unlink(missing_ok=True)
                continue
            if ext not in ingest.SUPPORTED:
                report["skipped"].append(dict(name=m.filename, reason=f"{ext or 'no extension'} isn't a supported type"))
                s["skipped"] += 1
                continue
            if m.file_size == 0:
                report["skipped"].append(dict(name=m.filename, reason="empty file"))
                s["skipped"] += 1
                continue
            sub = folder / meta.new_id()
            sub.mkdir()
            target = sub / name
            h = hashlib.sha256()
            with z.open(m) as src, open(target, "wb") as dst:
                while True:
                    buf = src.read(16 * 1024 * 1024)
                    if not buf:
                        break
                    h.update(buf)
                    dst.write(buf)
            sha = h.hexdigest()
            dup = _find_duplicate(sha)
            if sha in seen or dup:
                report["duplicates"].append(dict(name=m.filename, reason=f"same content as {dup['name']}" if dup
                                                 else "appears twice in the archive"))
                s["duplicates"] += 1
                shutil.rmtree(sub, ignore_errors=True)
                continue
            seen.add(sha)
            _register(target, name, sha, m.file_size)
            s["queued"] += 1


@app.post(f"{API}/documents/sample")
def load_sample():
    data = SAMPLE.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    dup = _find_duplicate(sha)
    if dup:
        return dict(document=_doc_out(dup), job_id=None, duplicate=True)
    folder = UPLOAD_DIR / meta.new_id()
    folder.mkdir(parents=True)
    dest = folder / SAMPLE.name
    dest.write_bytes(data)
    doc, job_id = _register(dest, SAMPLE.name, sha, len(data))
    return dict(document=_doc_out(doc), job_id=job_id, duplicate=False)


@app.delete(f"{API}/documents/{{doc_id}}")
def delete_document(doc_id: str):
    d = meta.one("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not d:
        raise HTTPException(404, "Document not found.")
    if d["status"] == "processing":
        raise HTTPException(409, "This document is being indexed. Delete it when indexing finishes.")
    store.drop_source(d["store_name"])
    textrag.INDEX.dirty = True
    if d["path"]:
        shutil.rmtree(Path(d["path"]).parent, ignore_errors=True)
    meta.run("DELETE FROM documents WHERE id=?", (doc_id,))
    return dict(deleted=doc_id)


@app.post(f"{API}/documents/{{doc_id}}/reindex")
def reindex(doc_id: str):
    d = meta.one("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not d:
        raise HTTPException(404, "Document not found.")
    if not d["path"] or not Path(d["path"]).exists():
        raise HTTPException(410, "The original file is no longer on disk. Upload it again.")
    jobs.enqueue(doc_id)
    return dict(document=_doc_out(meta.one("SELECT * FROM documents WHERE id=?", (doc_id,))))


def _loc(locator):
    try:
        v = json.loads(locator)
        return v.get("page"), v.get("section") or ""
    except Exception:
        return None, locator or ""


@app.get(f"{API}/documents/{{doc_id}}/chunks")
def chunks(doc_id: str, limit: int = 30, offset: int = 0):
    d = meta.one("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not d:
        raise HTTPException(404, "Document not found.")
    c = store.cursor()
    total = c.execute("SELECT count(*) FROM chunks WHERE source_file=?", [d["store_name"]]).fetchone()[0]
    rows = c.execute("SELECT chunk_id, text, locator, kind FROM chunks WHERE source_file=? "
                     "ORDER BY CASE kind WHEN 'profile' THEN 0 ELSE 1 END, rowid LIMIT ? OFFSET ?",
                     [d["store_name"], int(limit), int(offset)]).fetchall()
    out = []
    for i, (cid, text, loc, kind) in enumerate(rows):
        page, section = _loc(loc)
        if kind == "row":
            section = f"Sample {loc}"
        out.append(dict(chunk_id=cid, text=text, page_start=page, page_end=page, section=section, rank=offset + i))
    return dict(total=total, chunks=out)


@app.get(f"{API}/suggestions")
def suggestions(document_ids: str | None = None, n: int = 4):
    names = _scope(document_ids.split(",") if document_ids else None)
    return questions.suggestions(names, n=n) if names is None or names else []

# =============================================================================== asking


class QueryIn(BaseModel):
    question: str
    session_id: str | None = None
    document_ids: list[str] | None = None
    mode: str = "self_healing"
    fault_injection: bool = False
    max_retries: int | None = None


def _scope(ids):
    """document ids -> store names of ready documents (None = everything)."""
    if not ids:
        return None
    rows = meta.q(f"SELECT store_name FROM documents WHERE status='ready' AND id IN ({','.join('?' for _ in ids)})",
                  tuple(ids))
    return [r["store_name"] for r in rows]


def _policy(max_retries=None):
    rt = settings_store.runtime()
    retries = rt["max_corrective_retries"] if max_retries is None else max(0, min(max_retries, config.LIMIT_CORRECTIVE_RETRIES))
    return healer.Policy(max_attempts=retries + 1, max_regenerations=rt["max_regenerations"], top_k=rt["top_k"],
                         llm=settings_store.llm_config())


STATUS = {"verified": "accepted", "corrected": "accepted", "withheld": "abstained", "unverified": "answered"}


def _doc_maps():
    rows = meta.q("SELECT id, name, store_name FROM documents")
    return {r["store_name"]: r for r in rows}


def _sources_out(res, maps):
    out = []
    for s in res["sources"]:
        page, section = _loc(s.get("locator"))
        d = maps.get(s["source"], {})
        out.append(dict(label=s["id"], chunk_id=s.get("chunk_id") or s["id"], document_id=d.get("id", ""),
                        filename=d.get("name", s["source"]), page_start=page, page_end=page,
                        section=section if s.get("kind") != "row" else "Sample row",
                        score=s.get("score"), text=s["text"]))
    return out


def _evaluation(res, sources, mode):
    labels = set(re.findall(r"\[(S\d+)\]", res["answer"]))
    valid = labels <= {s["label"] for s in sources} if labels else (None if res["status"] == "withheld" else False)
    if mode == "baseline":
        g = _lexical_groundedness(res["answer"], sources)
        return dict(grounded=None, complete=None, citations_valid=valid, lexical_groundedness=g, critic_verdict=None)
    ok = res["status"] in ("verified", "corrected")
    return dict(grounded=ok if res["status"] != "withheld" else None, complete=ok if res["status"] != "withheld" else None,
                citations_valid=valid, lexical_groundedness=1.0 if ok else None,
                critic_verdict="pass" if ok else "abstain")


def _lexical_groundedness(answer, sources):
    sents = [s.strip() for s in re.split(r"\s*\[S\d+\]\s*", answer) if len(s.strip()) > 15]
    if not sents:
        return None
    blob = " ".join(s["text"] for s in sources)
    return round(sum(1 for s in sents if s in blob or verifier.coverage(s, blob) >= 0.8) / len(sents), 3)


def _execution(res, exec_id, session_id, mode, provider, model, origin="chat"):
    maps = _doc_maps()
    sources = _sources_out(res, maps)
    status = STATUS.get(res["status"], "error")
    healing = dict(triggered=bool(mode == "self_healing" and res["healed"]), retrieval_attempts=res["searches"],
                   regeneration_attempts=res["regenerations"],
                   reason=res["reason"] if (res["healed"] or status == "abstained") else None,
                   final_query=res["final_query"])
    ex = dict(execution_id=exec_id, session_id=session_id, mode=mode, status=status, question=res["question"],
              answer=res["answer"], sources=sources, healing=healing, evaluation=_evaluation(res, sources, mode),
              missing_information=res.get("missing_information") or [],
              path=[s["node"] for s in res["steps"]], latency_ms=res["latency_ms"], provider=provider, model=model,
              created_at=meta.now())
    retrievals = []
    for r in res["retrievals"]:
        d = maps.get(r["document"], {})
        retrievals.append(dict(attempt=r["attempt"], query=r["query"], chunk_id=r["chunk_id"], document_id=d.get("id", ""),
                               rank=r["rank"], score=r["score"], relevant=r["relevant"]))
    meta.insert("executions", dict(id=exec_id, session_id=session_id, origin=origin, mode=mode, status=status,
                                   question=res["question"], answer=res["answer"], data=ex, steps=res["steps"],
                                   retrievals=retrievals, latency_ms=res["latency_ms"], provider=provider, model=model,
                                   reason=healing["reason"], healed=int(healing["triggered"]), searches=res["searches"],
                                   created_at=ex["created_at"]))
    return ex


def _ensure_session(session_id, question):
    if session_id and meta.one("SELECT id FROM sessions WHERE id=?", (session_id,)):
        return session_id
    sid = meta.new_id()
    title = question.strip().replace("\n", " ")
    meta.insert("sessions", dict(id=sid, title=title[:60] + ("…" if len(title) > 60 else ""), created_at=meta.now(),
                                 updated_at=meta.now()))
    return sid


def _answer(body: QueryIn, on_step=None, session_id=None):
    names = _scope(body.document_ids)
    if names == []:
        names = ["__none__"]
    pol = _policy(body.max_retries)
    prov, model = settings_store.active()
    res = healer.answer(body.question, sources=names, mode=body.mode,
                        inject_false_claim=body.fault_injection and body.mode == "self_healing",
                        policy=pol, on_step=on_step if body.mode == "self_healing" else None)
    return res, pol, prov, model


@app.post(f"{API}/chat/query")
def chat_query(body: QueryIn):
    sid = _ensure_session(body.session_id, body.question)
    meta.insert("messages", dict(id=meta.new_id(), session_id=sid, role="user", content=body.question, created_at=meta.now()))
    res, pol, prov, model = _answer(body)
    ex = _execution(res, meta.new_id(), sid, body.mode, prov, model)
    meta.insert("messages", dict(id=meta.new_id(), session_id=sid, role="assistant", content=ex["answer"],
                                 created_at=meta.now(), execution_id=ex["execution_id"]))
    meta.update("sessions", sid, updated_at=meta.now())
    return ex


@app.post(f"{API}/chat/stream")
async def chat_stream(body: QueryIn):
    if not body.question.strip():
        raise HTTPException(400, "Type a question first.")
    sid = _ensure_session(body.session_id, body.question)
    meta.insert("messages", dict(id=meta.new_id(), session_id=sid, role="user", content=body.question, created_at=meta.now()))
    loop = asyncio.get_running_loop()
    q: asyncio.Queue = asyncio.Queue()
    pol = _policy(body.max_retries)
    prov, model = settings_store.active()
    in_scope = len(_scope(body.document_ids) or []) if body.document_ids else \
        len(meta.q("SELECT id FROM documents WHERE status='ready'"))

    def work():
        try:
            res, _, _, _ = _answer(body, on_step=lambda s: loop.call_soon_threadsafe(q.put_nowait, ("step", s)))
            ex = _execution(res, meta.new_id(), sid, body.mode, prov, model)
            meta.insert("messages", dict(id=meta.new_id(), session_id=sid, role="assistant", content=ex["answer"],
                                         created_at=meta.now(), execution_id=ex["execution_id"]))
            meta.update("sessions", sid, updated_at=meta.now())
            loop.call_soon_threadsafe(q.put_nowait, ("result", ex))
        except Exception as e:  # never leave the UI hanging
            import traceback
            traceback.print_exc()
            loop.call_soon_threadsafe(q.put_nowait, ("error", dict(detail=f"The pipeline failed: {e}")))

    threading.Thread(target=work, daemon=True).start()

    async def gen():
        start = dict(session_id=sid, provider=prov, model=model, documents_in_scope=in_scope,
                     max_retrieval_attempts=pol.max_attempts, max_regenerations=pol.max_regenerations, mode=body.mode)
        yield f"event: start\ndata: {json.dumps(start)}\n\n"
        while True:
            kind, data = await q.get()
            yield f"event: {kind}\ndata: {json.dumps(data, default=str)}\n\n"
            if kind in ("result", "error"):
                break
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# =============================================================================== sessions / executions


@app.get(f"{API}/sessions")
def sessions():
    return meta.q("SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 200")


@app.get(f"{API}/sessions/{{sid}}")
def session(sid: str):
    s = meta.one("SELECT * FROM sessions WHERE id=?", (sid,))
    if not s:
        raise HTTPException(404, "Conversation not found.")
    msgs = []
    for m in meta.q("SELECT * FROM messages WHERE session_id=? ORDER BY created_at, rowid", (sid,)):
        ex = None
        if m["execution_id"]:
            e = meta.one("SELECT data FROM executions WHERE id=?", (m["execution_id"],))
            ex = meta.loads(e["data"]) if e else None
        msgs.append(dict(id=m["id"], role=m["role"], content=m["content"], created_at=m["created_at"], execution=ex))
    return dict(id=sid, title=s["title"], messages=msgs)


@app.delete(f"{API}/sessions/{{sid}}")
def delete_session(sid: str):
    meta.run("DELETE FROM messages WHERE session_id=?", (sid,))
    meta.run("DELETE FROM sessions WHERE id=?", (sid,))
    return dict(deleted=sid)


@app.get(f"{API}/executions")
def executions(limit: int = 50, status: str | None = None, mode: str | None = None, q: str | None = None):
    sql, params = "SELECT data FROM executions WHERE origin='chat'", []
    if status:
        sql += " AND status=?"
        params.append(status)
    if mode:
        sql += " AND mode=?"
        params.append(mode)
    if q:
        sql += " AND question LIKE ?"
        params.append(f"%{q}%")
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(min(limit, 500))
    return [meta.loads(r["data"]) for r in meta.q(sql, tuple(params))]


@app.get(f"{API}/executions/{{eid}}")
def execution(eid: str):
    r = meta.one("SELECT * FROM executions WHERE id=?", (eid,))
    if not r:
        raise HTTPException(404, "Run not found.")
    return dict(meta.loads(r["data"]), steps=meta.loads(r["steps"], []), retrievals=meta.loads(r["retrievals"], []),
                critiques=[])


class Feedback(BaseModel):
    rating: int


@app.post(f"{API}/executions/{{eid}}/feedback")
def feedback(eid: str, body: Feedback):
    meta.update("executions", eid, feedback=1 if body.rating > 0 else -1)
    return dict(ok=True)


def _pct(xs, p):
    if not xs:
        return 0
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p * (len(xs) - 1))))]


@app.get(f"{API}/analytics/summary")
def analytics():
    docs = meta.q("SELECT status, chunk_count FROM documents")
    ex = meta.q("SELECT status, healed, reason, latency_ms, searches, created_at, data FROM executions "
                "WHERE origin='chat' AND mode='self_healing'")
    n = len(ex)
    counts = {}
    for e in ex:
        counts[e["status"]] = counts.get(e["status"], 0) + 1
    healed = [e for e in ex if e["healed"]]
    reasons = {}
    for e in ex:
        if e["reason"] and (e["healed"] or e["status"] == "abstained"):
            reasons[e["reason"]] = reasons.get(e["reason"], 0) + 1
    today = datetime.now(timezone.utc).date()
    daily = []
    for i in range(13, -1, -1):
        day = (today - timedelta(days=i)).isoformat()
        row = dict(date=day, accepted=0, abstained=0, error=0)
        for e in ex:
            if (e["created_at"] or "").startswith(day) and e["status"] in row:
                row[e["status"]] += 1
        daily.append(row)
    lat = [e["latency_ms"] or 0 for e in ex]
    recent = [meta.loads(r["data"]) for r in meta.q(
        "SELECT data FROM executions WHERE origin='chat' ORDER BY created_at DESC LIMIT 8")]
    return dict(
        documents=dict(total=len(docs), ready=sum(d["status"] == "ready" for d in docs),
                       failed=sum(d["status"] == "failed" for d in docs),
                       chunks=sum(d["chunk_count"] or 0 for d in docs if d["status"] == "ready")),
        queries=n, accepted_rate=counts.get("accepted", 0) / n if n else 0,
        abstention_rate=counts.get("abstained", 0) / n if n else 0, error_rate=counts.get("error", 0) / n if n else 0,
        healing_rate=len(healed) / n if n else 0,
        healing_success_rate=(sum(e["status"] == "accepted" for e in healed) / len(healed)) if healed else 0,
        avg_retrieval_attempts=(sum(e["searches"] or 0 for e in ex) / n) if n else 0,
        latency_p50_ms=_pct(lat, 0.5), latency_p95_ms=_pct(lat, 0.95), status_counts=counts,
        healing_reasons=sorted([dict(reason=k, count=v) for k, v in reasons.items()], key=lambda x: -x["count"]),
        daily=daily, recent=recent)

# =============================================================================== evaluation


class EvalIn(BaseModel):
    name: str | None = None
    document_ids: list[str] | None = None
    use_sample_dataset: bool = True


def _eval_out(r, results=True):
    out = dict(id=r["id"], name=r["name"], status=r["status"], progress=r["progress"], total=r["total"],
               config=meta.loads(r["config"], {}), summary=meta.loads(r["summary"], {}), error=r["error"],
               document_ids=meta.loads(r["document_ids"], []), created_at=r["created_at"], finished_at=r["finished_at"])
    if results:
        out["results"] = meta.loads(r["results"], [])
    return out


@app.get(f"{API}/evaluations")
def evaluations():
    return [_eval_out(r, False) for r in meta.q("SELECT * FROM evaluations ORDER BY created_at DESC LIMIT 50")]


@app.get(f"{API}/evaluations/{{rid}}")
def evaluation(rid: str):
    r = meta.one("SELECT * FROM evaluations WHERE id=?", (rid,))
    if not r:
        raise HTTPException(404, "Evaluation not found.")
    return _eval_out(r)


@app.get(f"{API}/evaluations/{{rid}}/export")
def export(rid: str):
    r = meta.one("SELECT * FROM evaluations WHERE id=?", (rid,))
    if not r:
        raise HTTPException(404, "Evaluation not found.")
    return JSONResponse(_eval_out(r), headers={"Content-Disposition": f'attachment; filename="evaluation-{rid[:8]}.json"'})


@app.post(f"{API}/evaluations/run")
def run_evaluation(body: EvalIn):
    if meta.one("SELECT id FROM evaluations WHERE status IN ('queued','running')"):
        raise HTTPException(409, "An evaluation is already running.")
    ready = meta.q("SELECT id FROM documents WHERE status='ready'")
    if not ready:
        raise HTTPException(400, "Index at least one document first. The question set is generated from your documents.")
    names = _scope(body.document_ids) if body.document_ids else None
    qs = questions.generate(names)
    if not qs:
        raise HTTPException(400, "Couldn't generate questions from these documents.")
    prov, model = settings_store.active()
    rid = meta.new_id()
    meta.insert("evaluations", dict(id=rid, name=body.name or f"Run {meta.now()}", status="running", progress=0,
                                    total=len(qs), config=dict(provider=prov, model=model, questions=len(qs),
                                                               question_source="generated from your documents"),
                                    summary={}, document_ids=body.document_ids or [], results=[], created_at=meta.now()))
    threading.Thread(target=_run_eval, args=(rid, qs, names, prov, model), daemon=True).start()
    return evaluation(rid)


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _score(qitem, ex):
    st = ex["status"]
    answered = st in ("accepted", "answered")
    kw = None
    if qitem["expect"] is not None:
        kw = 1.0 if answered and _norm(qitem["expect"]) in _norm(ex["answer"]) else 0.0
    g = ex["evaluation"].get("lexical_groundedness")
    return dict(answered=answered, abstained=st == "abstained", error=st == "error",
                citations_valid=ex["evaluation"].get("citations_valid"), groundedness=g if answered else None,
                fully_grounded=(g == 1.0) if answered and g is not None else None, keyword_recall=kw, status=st,
                answer=ex["answer"], latency_ms=ex["latency_ms"], retrieval_attempts=ex["healing"]["retrieval_attempts"],
                execution_id=ex["execution_id"], healing_triggered=ex["healing"]["triggered"], path=ex["path"])


def _run_eval(rid, qs, names, prov, model):
    results = []
    try:
        pol = _policy()
        for i, qi in enumerate(qs):
            row = dict(question=qi["q"], answerable=qi["expect"] is not None, category=qi["kind"],
                       expected_keywords=[qi["expect"]] if qi["expect"] else [])
            for mode in ("baseline", "self_healing"):
                res = healer.answer(qi["q"], sources=names, mode=mode, policy=pol)
                ex = _execution(res, meta.new_id(), None, mode, prov, model, origin="eval")
                row[mode] = _score(qi, ex)
            results.append(row)
            meta.update("evaluations", rid, progress=i + 1, results=results)
        meta.update("evaluations", rid, status="completed", summary=_summarize(results), finished_at=meta.now(),
                    results=results)
    except Exception as e:
        import traceback
        traceback.print_exc()
        meta.update("evaluations", rid, status="failed", error=str(e), finished_at=meta.now(), results=results)


def _summarize(results):
    out = {}
    for mode in ("baseline", "self_healing"):
        rs = [r[mode] for r in results]
        n = len(rs) or 1
        answered = [r for r in rs if r["answered"]]
        unans = [r for r, row in zip(rs, results) if not row["answerable"]]
        ans_q = [r for r, row in zip(rs, results) if row["answerable"]]
        cits = [r["citations_valid"] for r in answered if r["citations_valid"] is not None]
        gr = [r["groundedness"] for r in answered if r["groundedness"] is not None]
        unsupported = [r for r, row in zip(rs, results) if r["answered"] and (not row["answerable"] or r["keyword_recall"] == 0)]
        kws = [r["keyword_recall"] for r in ans_q if r["keyword_recall"] is not None]
        lat = [r["latency_ms"] for r in rs]
        block = dict(
            answered_rate=len(answered) / n, abstention_rate=sum(r["abstained"] for r in rs) / n,
            error_rate=sum(r["error"] for r in rs) / n,
            citation_validity=sum(cits) / len(cits) if cits else None,
            groundedness=sum(gr) / len(gr) if gr else None,
            unsupported_answer_rate=len(unsupported) / len(answered) if answered else None,
            correct_abstention_rate=sum(r["abstained"] for r in unans) / len(unans) if unans else None,
            false_abstention_rate=sum(r["abstained"] for r in ans_q) / len(ans_q) if ans_q else None,
            keyword_recall=sum(kws) / len(kws) if kws else None,
            avg_retrieval_attempts=sum(r["retrieval_attempts"] for r in rs) / n,
            latency_p50_ms=_pct(lat, 0.5), latency_p95_ms=_pct(lat, 0.95))
        if mode == "self_healing":
            healed = [r for r in rs if r["healing_triggered"]]
            block["healing_rate"] = len(healed) / n
            block["healing_success_rate"] = (sum(r["status"] == "accepted" for r in healed) / len(healed)) if healed else None
        out[mode] = block
    return out

# =============================================================================== built frontend (one-command mode)


DIST = config.BACKEND_DIR.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
