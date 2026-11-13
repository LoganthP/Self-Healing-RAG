"""Evaluation lab: the generated, data-grounded question set through baseline RAG and Self-Healing RAG."""
import re
import threading
import time
import uuid

from . import healer, questions

RUNS: dict[str, dict] = {}

def _norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())

def score(q, r):
    answered = r["status"] in {"verified", "corrected", "unverified"}
    if q["expect"] is None:
        return dict(correct=not answered, outcome="correct refusal" if not answered else "hallucinated")
    if not answered:
        return dict(correct=False, outcome="missed (withheld)")
    hit = _norm(q["expect"]) in _norm(r["answer"])
    return dict(correct=hit, outcome="correct" if hit else "wrong answer")

def start(sources=None, per_source=6):
    run_id = uuid.uuid4().hex[:10]
    qs = questions.generate(sources, per_source=per_source)
    RUNS[run_id] = dict(id=run_id, status="running", total=len(qs), done=0, items=[], summary=None)
    threading.Thread(target=_run, args=(run_id, qs, sources), daemon=True).start()
    return run_id

def _run(run_id, qs, sources):
    run = RUNS[run_id]
    for q in qs:
        item = dict(question=q["q"], kind=q["kind"], source=q["source"], expected=q["expect"])
        for mode in ("baseline", "self_healing"):
            t0 = time.perf_counter()
            r = healer.answer(q["q"], sources=sources, mode=mode)
            s = score(q, r)
            item[mode] = dict(status=r["status"], healed=r["healed"], answer=r["answer"][:600],
                              ms=round((time.perf_counter() - t0) * 1000), **s)
        run["items"].append(item)
        run["done"] += 1
    run["summary"] = summarize(run["items"])
    run["status"] = "done"

def summarize(items):
    out = {}
    for mode in ("baseline", "self_healing"):
        rs = [i[mode] for i in items]
        n = len(rs) or 1
        unans = [i for i in items if i["expected"] is None]
        out[mode] = dict(
            accuracy=round(sum(r["correct"] for r in rs) / n, 3),
            hallucination_rate=round(sum(r["outcome"] in {"hallucinated", "wrong answer"} for r in rs) / n, 3),
            correct_refusals=f"{sum(i[mode]['correct'] for i in unans)}/{len(unans)}",
            healed=sum(r["healed"] for r in rs),
            avg_ms=round(sum(r["ms"] for r in rs) / n))
    return out
