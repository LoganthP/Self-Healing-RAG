"""Central settings. Every value can be overridden with an environment variable (or a line in backend/.env)."""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = Path(os.getenv("SHRAG_ENV_FILE", str(BACKEND_DIR / ".env")))


def read_env_file(path: Path = ENV_FILE) -> dict:
    """Minimal .env parser (KEY=VALUE, # comments, optional quotes)."""
    out = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


_ENV = read_env_file()


def _env(name, default, cast=str):
    v = os.getenv(name, _ENV.get(name))
    if v is None or v == "":
        return default
    v = v.strip().strip('"').strip("'")
    return cast(v)


VERSION = "2.0.0"
DATA_DIR = Path(_env("SHRAG_DATA_DIR", str(BACKEND_DIR / "data")))
UPLOAD_DIR = DATA_DIR / "uploads"
EXTRACT_DIR = DATA_DIR / "extracted"
DB_PATH = DATA_DIR / "shrag.duckdb"          # tables, chunks, value index
META_PATH = DATA_DIR / "meta.sqlite"         # documents, jobs, sessions, executions, evaluations
RUNTIME_PATH = DATA_DIR / "runtime.json"     # settings saved from the Settings page

# Upload limits
MAX_UPLOAD_MB = _env("SHRAG_MAX_UPLOAD_MB", 8192, int)
MAX_ARCHIVE_MB = _env("SHRAG_MAX_ARCHIVE_MB", 16384, int)
MAX_ARCHIVE_ENTRIES = _env("SHRAG_MAX_ARCHIVE_ENTRIES", 5000, int)

# Tables
MAX_CATEGORICAL_DISTINCT = _env("SHRAG_MAX_CAT", 5000, int)
VALUE_INDEX_PER_COLUMN = _env("SHRAG_VALUES_PER_COL", 3000, int)
ROW_CARDS_PER_TABLE = _env("SHRAG_ROW_CARDS", 3000, int)     # sampled rows kept as searchable text
DEDUPE_MAX_ROWS = _env("SHRAG_DEDUPE_MAX_ROWS", 3_000_000, int)  # exact-duplicate check up to this size
DUCKDB_MEMORY = _env("SHRAG_DUCKDB_MEMORY", "", str)         # e.g. "4GB"; empty = DuckDB default (80% of RAM)

# Prose documents
CHUNK_CHARS = _env("SHRAG_CHUNK_CHARS", 900, int)
CHUNK_OVERLAP = _env("SHRAG_CHUNK_OVERLAP", 150, int)
EMBED_MODEL = _env("SHRAG_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBED_BATCH = _env("SHRAG_EMBED_BATCH", 128, int)
USE_EMBEDDINGS = _env("SHRAG_USE_EMBEDDINGS", "auto")       # auto | on | off

# Healing loop defaults (the Settings page can change them at runtime, within the limits below)
MAX_ATTEMPTS = _env("SHRAG_MAX_ATTEMPTS", 3, int)            # searches per question, including the first
MAX_REGENERATIONS = _env("SHRAG_MAX_REGENERATIONS", 1, int)
TEXT_TOP_K = _env("SHRAG_TOP_K", 8, int)
SUPPORT_THRESHOLD = _env("SHRAG_SUPPORT_THRESHOLD", 0.5, float)
LIMIT_CORRECTIVE_RETRIES = 4
LIMIT_REGENERATIONS = 3
LIMIT_TOP_K = 20
CONTEXT_CHUNKS = 6

# Optional language models (prose answers only; table answers are computed exactly and never need one)
OLLAMA_URL = _env("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = _env("OLLAMA_MODEL", "llama3.1:8b")
GROQ_MODEL = _env("GROQ_MODEL", "llama-3.1-8b-instant")
OPENAI_MODEL = _env("OPENAI_MODEL", "gpt-4o-mini")
DEFAULT_PROVIDER = _env("SHRAG_PROVIDER", "offline")

for d in (DATA_DIR, UPLOAD_DIR, EXTRACT_DIR):
    d.mkdir(parents=True, exist_ok=True)
