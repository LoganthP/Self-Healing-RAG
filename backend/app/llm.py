"""Optional LLM drafting for prose answers through any OpenAI-compatible API (Ollama, Groq, OpenAI).
Table answers are computed exactly with SQL and never use an LLM. Offline mode drafts by quoting passages."""
import json
import re
import time

import httpx


def chat(cfg, messages, timeout=60, max_tokens=700):
    r = httpx.post(f"{cfg['base_url'].rstrip('/')}/chat/completions", timeout=timeout,
                   headers={"Authorization": f"Bearer {cfg.get('api_key') or 'none'}"},
                   json=dict(model=cfg["model"], temperature=0, max_tokens=max_tokens, messages=messages))
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def answer_with_citations(question, passages, cfg):
    """Returns [{"text", "source_id"}] or None. The verifier still checks every sentence against its passage."""
    ctx = "\n\n".join(f"[P{i}] {p['text'][:1500]}" for i, p in enumerate(passages[:8]))
    prompt = ("Answer the question using ONLY the passages. Reply with JSON only: a list of objects "
              '{"text": one sentence, "passage": index}. Copy wording from the passages where you can; every sentence '
              "must be directly supported by its passage. If the passages don't answer the question, reply [].\n\n"
              f"Passages:\n{ctx}\n\nQuestion: {question}")
    try:
        raw = chat(cfg, [{"role": "user", "content": prompt}])
        m = re.search(r"\[.*\]", raw, re.S)
        items = json.loads(m.group(0) if m else raw)
        out = []
        for i in items:
            k = int(i.get("passage", -1))
            if 0 <= k < len(passages) and str(i.get("text", "")).strip():
                out.append(dict(text=str(i["text"]).strip(), source_id=passages[k]["id"]))
        return out
    except Exception:
        return None


def test(cfg):
    t0 = time.perf_counter()
    try:
        chat(cfg, [{"role": "user", "content": "Reply with the word ok."}], timeout=20, max_tokens=5)
        return dict(ok=True, model=cfg["model"], latency_ms=round((time.perf_counter() - t0) * 1000))
    except httpx.HTTPStatusError as e:
        msg = e.response.text[:300]
        if e.response.status_code == 401:
            msg = "The API key was rejected (401). Check the key in backend/.env, then click Reload .env."
        return dict(ok=False, detail=msg)
    except Exception as e:
        return dict(ok=False, detail=f"Couldn't connect: {e}")
