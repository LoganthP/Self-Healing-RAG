"""DuckDB-backed store: one database file holds the tables, the catalog, text chunks and the value index.

DuckDB is used because it loads multi-GB CSVs in parallel in seconds to a couple of minutes and answers
group-by/count questions over millions of rows in milliseconds, which row-by-row embedding never can."""
import json
import threading
import duckdb
from .config import DB_PATH, DUCKDB_MEMORY

_lock = threading.RLock()
_con = None

def con():
    global _con
    with _lock:
        if _con is None:
            _con = duckdb.connect(str(DB_PATH))
            tmp = DB_PATH.parent / "duckdb_tmp"
            tmp.mkdir(exist_ok=True)
            _con.execute(f"SET temp_directory='{tmp.as_posix()}'")   # spill to disk instead of failing on big files
            _con.execute("SET preserve_insertion_order=false")         # faster parallel CSV loads
            if DUCKDB_MEMORY:
                _con.execute(f"SET memory_limit='{DUCKDB_MEMORY}'")
            _init(_con)
        return _con

def cursor():
    """Thread-local cursor on the shared connection (safe for FastAPI worker threads)."""
    return con().cursor()

def _init(c):
    c.execute("""
    CREATE TABLE IF NOT EXISTS catalog(
        table_name VARCHAR PRIMARY KEY, source_file VARCHAR, kind VARCHAR,
        row_count BIGINT, profile JSON, created_at TIMESTAMP DEFAULT now());
    CREATE TABLE IF NOT EXISTS value_index(
        table_name VARCHAR, column_name VARCHAR, value VARCHAR, norm VARCHAR, freq BIGINT);
    CREATE TABLE IF NOT EXISTS chunks(
        chunk_id VARCHAR PRIMARY KEY, source_file VARCHAR, kind VARCHAR, locator VARCHAR,
        text VARCHAR, embedding FLOAT[]);
    """)

def catalog():
    rows = cursor().execute("SELECT table_name, source_file, kind, row_count, profile FROM catalog ORDER BY source_file").fetchall()
    return [dict(table_name=r[0], source_file=r[1], kind=r[2], row_count=r[3], profile=json.loads(r[4])) for r in rows]

def table_for(source_file: str):
    r = cursor().execute("SELECT table_name FROM catalog WHERE source_file=? AND kind='table'", [source_file]).fetchone()
    return r[0] if r else None

def drop_source(source_file: str):
    c = cursor()
    for (t,) in c.execute("SELECT table_name FROM catalog WHERE source_file=?", [source_file]).fetchall():
        c.execute(f'DROP TABLE IF EXISTS "{t}"')
        c.execute("DELETE FROM value_index WHERE table_name=?", [t])
    c.execute("DELETE FROM catalog WHERE source_file=?", [source_file])
    c.execute("DELETE FROM chunks WHERE source_file=?", [source_file])

def q(sql, params=None):
    c = cursor()
    res = c.execute(sql, params or [])
    cols = [d[0] for d in res.description] if res.description else []
    return cols, res.fetchall()
