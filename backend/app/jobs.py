"""Background ingestion: one worker thread processes queued documents in order, reporting stage and progress."""
import queue
import threading
import time
import traceback
from pathlib import Path

from . import ingest, meta, settings_store, textrag

_q: "queue.Queue[str]" = queue.Queue()
_started = False


def enqueue(doc_id: str):
    job = dict(id=meta.new_id(), status="queued", stage="Waiting in the queue", progress=0.0, error=None)
    meta.update("documents", doc_id, status="queued", error=None, job=job)
    _q.put(doc_id)
    start()
    return job["id"]


def start():
    global _started
    if not _started:
        _started = True
        threading.Thread(target=_worker, daemon=True, name="ingest-worker").start()
        # documents left 'queued'/'processing' by a previous run get picked up again
        for d in meta.q("SELECT id FROM documents WHERE status IN ('queued','processing')"):
            _q.put(d["id"])


def _worker():
    while True:
        doc_id = _q.get()
        try:
            _process(doc_id)
        except Exception:
            traceback.print_exc()


def _process(doc_id):
    d = meta.one("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not d or d["status"] not in ("queued", "processing"):
        return
    job = meta.loads(d["job"], {}) or dict(id=meta.new_id())
    job.update(status="running", stage="Starting", progress=0.01, error=None)
    meta.update("documents", doc_id, status="processing", job=job)
    last = [0.0]

    def progress(stage, frac):
        t = time.time()
        if t - last[0] < 0.4 and frac < 1:
            return
        last[0] = t
        job.update(stage=stage, progress=round(max(0.01, min(frac, 1.0)), 3))
        meta.update("documents", doc_id, job=job)

    t0 = time.time()
    try:
        info = ingest.ingest_file(Path(d["path"]), d["store_name"], progress)
        cleaning = {k: v for k, v in (info.get("cleaning") or {}).items() if k != "null_cells_dropped"}
        emb = ("DuckDB (SQL over every row)" if info["kind"] == "table"
               else settings_store.embedding_info()["name"])
        job.update(status="done", stage=f"Indexed in {time.time() - t0:.1f} s", progress=1.0)
        meta.update("documents", doc_id, status="ready", kind=info["kind"], pages=info.get("pages") or 1,
                    chunk_count=info.get("chunks", 0), rows=info.get("rows", 0), cleaning=cleaning,
                    embedding_model=emb, index_version="v2", indexed_at=meta.now(), job=job, error=None)
    except Exception as ex:
        msg = str(ex) if isinstance(ex, ingest.IngestError) else f"Indexing failed: {ex}"
        job.update(status="failed", stage="Failed", error=msg)
        meta.update("documents", doc_id, status="failed", error=msg[:500], job=job)
    finally:
        textrag.INDEX.dirty = True
