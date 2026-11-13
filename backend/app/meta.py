"""App metadata in SQLite: documents, ingestion jobs, chat sessions, executions (traces) and evaluations.
(Data itself lives in DuckDB; see store.py.)"""
import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone

from .config import META_PATH

_lock = threading.RLock()
_db = sqlite3.connect(str(META_PATH), check_same_thread=False, isolation_level=None)
_db.row_factory = sqlite3.Row
_db.execute("PRAGMA journal_mode=WAL")
_db.executescript("""
CREATE TABLE IF NOT EXISTS documents(
  id TEXT PRIMARY KEY, name TEXT, store_name TEXT, extension TEXT, size_bytes INTEGER, sha256 TEXT, path TEXT,
  status TEXT, kind TEXT, pages INTEGER DEFAULT 0, chunk_count INTEGER DEFAULT 0, rows INTEGER DEFAULT 0,
  error TEXT, embedding_model TEXT, index_version TEXT, cleaning TEXT, job TEXT, created_at TEXT, indexed_at TEXT);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, title TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, created_at TEXT,
  execution_id TEXT);
CREATE TABLE IF NOT EXISTS executions(id TEXT PRIMARY KEY, session_id TEXT, origin TEXT, mode TEXT, status TEXT,
  question TEXT, answer TEXT, data TEXT, steps TEXT, retrievals TEXT, latency_ms INTEGER, provider TEXT, model TEXT,
  reason TEXT, healed INTEGER, searches INTEGER, feedback INTEGER, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_exec_created ON executions(created_at);
CREATE TABLE IF NOT EXISTS evaluations(id TEXT PRIMARY KEY, name TEXT, status TEXT, progress INTEGER, total INTEGER,
  config TEXT, summary TEXT, error TEXT, document_ids TEXT, results TEXT, created_at TEXT, finished_at TEXT);
""")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def new_id():
    return uuid.uuid4().hex


def q(sql, params=()):
    with _lock:
        return [dict(r) for r in _db.execute(sql, params).fetchall()]


def one(sql, params=()):
    r = q(sql, params)
    return r[0] if r else None


def run(sql, params=()):
    with _lock:
        _db.execute(sql, params)


def insert(table, row: dict):
    cols = ",".join(row)
    run(f"INSERT INTO {table}({cols}) VALUES ({','.join('?' for _ in row)})",
        tuple(json.dumps(v, default=str) if isinstance(v, (dict, list)) else v for v in row.values()))


def update(table, id_, **fields):
    if not fields:
        return
    sets = ",".join(f"{k}=?" for k in fields)
    run(f"UPDATE {table} SET {sets} WHERE id=?",
        tuple(json.dumps(v, default=str) if isinstance(v, (dict, list)) else v for v in fields.values()) + (id_,))


def loads(v, default=None):
    if v is None:
        return default
    try:
        return json.loads(v)
    except Exception:
        return default
