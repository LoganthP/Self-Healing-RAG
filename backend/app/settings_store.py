"""Runtime settings (saved from the Settings page) and model-provider discovery."""
import json
import os
import threading

import httpx

from . import config, textrag
from .config import RUNTIME_PATH

_lock = threading.Lock()
_env = config.read_env_file()
_ollama_cache = {"t": 0, "models": None}

DEFAULT = dict(provider=config.DEFAULT_PROVIDER, ollama_model=config.OLLAMA_MODEL, groq_model=config.GROQ_MODEL,
               openai_model=config.OPENAI_MODEL, top_k=config.TEXT_TOP_K,
               max_corrective_retries=max(config.MAX_ATTEMPTS - 1, 0), max_regenerations=config.MAX_REGENERATIONS)


def runtime():
    with _lock:
        data = dict(DEFAULT)
        if RUNTIME_PATH.exists():
            try:
                data.update(json.loads(RUNTIME_PATH.read_text()))
            except Exception:
                pass
        return data


def update(body: dict):
    cur = runtime()
    for k, v in body.items():
        if k in DEFAULT and v is not None:
            cur[k] = v
    cur["top_k"] = max(1, min(int(cur["top_k"]), config.LIMIT_TOP_K))
    cur["max_corrective_retries"] = max(0, min(int(cur["max_corrective_retries"]), config.LIMIT_CORRECTIVE_RETRIES))
    cur["max_regenerations"] = max(0, min(int(cur["max_regenerations"]), config.LIMIT_REGENERATIONS))
    with _lock:
        RUNTIME_PATH.write_text(json.dumps(cur, indent=2))
    return cur


def reload_env():
    global _env
    _env = config.read_env_file()
    _ollama_cache["t"] = 0


def _key(name):
    raw_file = _env.get(name)
    raw_env = os.environ.get(name)
    raw = raw_env if raw_env else raw_file
    val = (raw or "").strip().strip('"').strip("'")
    return val, raw, raw_file, raw_env


def key_info(name, prefix):
    val, raw, raw_file, raw_env = _key(name)
    return dict(set=bool(val), in_env_file=raw_file is not None, looks_valid=bool(val) and val.startswith(prefix),
                has_whitespace_or_quotes=bool(raw) and (raw != raw.strip() or any(c in raw for c in "\"' ")),
                env_var_override=raw_env is not None and raw_file is not None and raw_env != raw_file)


def ollama_models():
    import time
    if time.time() - _ollama_cache["t"] < 30:
        return _ollama_cache["models"]
    try:
        r = httpx.get(f"{config.OLLAMA_URL.rstrip('/')}/api/tags", timeout=0.8)
        models = [m["name"] for m in r.json().get("models", [])]
    except Exception:
        models = None
    _ollama_cache.update(t=time.time(), models=models)
    return models


def providers():
    rt = runtime()
    om = ollama_models()
    groq, openai = _key("GROQ_API_KEY")[0], _key("OPENAI_API_KEY")[0]
    return [
        dict(id="offline", label="Offline", available=True, local=True, model="extractive", models=[],
             note="No model needed. Table answers are computed with SQL; prose answers quote the passages exactly."),
        dict(id="ollama", label="Ollama", available=bool(om), local=True, model=rt["ollama_model"],
             models=om or [rt["ollama_model"]],
             note="Runs a model on this computer." if om else "Not running. Install Ollama and pull a model."),
        dict(id="groq", label="Groq", available=bool(groq), local=False, model=rt["groq_model"], models=[],
             note="Hosted and fast. Needs GROQ_API_KEY in backend/.env."),
        dict(id="openai", label="OpenAI", available=bool(openai), local=False, model=rt["openai_model"], models=[],
             note="Hosted. Needs OPENAI_API_KEY in backend/.env."),
    ]


def llm_config(provider=None):
    """OpenAI-compatible connection for the chosen provider, or None for offline."""
    rt = runtime()
    p = provider or rt["provider"]
    if p == "ollama":
        return dict(base_url=f"{config.OLLAMA_URL.rstrip('/')}/v1", model=rt["ollama_model"], api_key="ollama")
    if p == "groq" and _key("GROQ_API_KEY")[0]:
        return dict(base_url="https://api.groq.com/openai/v1", model=rt["groq_model"], api_key=_key("GROQ_API_KEY")[0])
    if p == "openai" and _key("OPENAI_API_KEY")[0]:
        return dict(base_url="https://api.openai.com/v1", model=rt["openai_model"], api_key=_key("OPENAI_API_KEY")[0])
    return None


def active():
    rt = runtime()
    cfg = llm_config()
    return ("offline", "extractive") if cfg is None else (rt["provider"], cfg["model"])


def embedding_info():
    if textrag.embedder() is not None:
        return dict(name="all-MiniLM-L6-v2", backend="sentence-transformers", dim=384,
                    note="Semantic search for prose, fused with BM25 keyword search.")
    return dict(name="BM25 keyword search", backend="bm25", dim=0,
                note="Install sentence-transformers (requirements-embeddings.txt) to add semantic search for prose. "
                     "Tables don't need it.")


def payload():
    rt = runtime()
    prov, model = active()
    return dict(
        runtime=rt, active_model=model, providers=providers(), processing_is_local=prov in {"offline", "ollama"},
        diagnostics=dict(env_file=str(config.ENV_FILE), env_file_exists=config.ENV_FILE.exists(),
                         keys=dict(groq=key_info("GROQ_API_KEY", "gsk_"), openai=key_info("OPENAI_API_KEY", "sk-"))),
        embedding=embedding_info(),
        limits=dict(max_corrective_retries=config.LIMIT_CORRECTIVE_RETRIES, max_regenerations=config.LIMIT_REGENERATIONS,
                    max_top_k=config.LIMIT_TOP_K, context_chunks=config.CONTEXT_CHUNKS,
                    chunk_size_tokens=config.CHUNK_CHARS // 4, chunk_overlap_tokens=config.CHUNK_OVERLAP // 4,
                    max_upload_mb=config.MAX_UPLOAD_MB, max_archive_mb=config.MAX_ARCHIVE_MB,
                    max_archive_entries=config.MAX_ARCHIVE_ENTRIES, max_table_rows=0,
                    max_embed_rows=config.ROW_CARDS_PER_TABLE))
