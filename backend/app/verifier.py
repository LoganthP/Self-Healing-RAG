"""Independent checks. The verifier never trusts the draft: it re-queries the data or re-reads the passages."""
import re

from . import tabular, linker
from .textrag import terms

def verify_table(question, plan, result, draft, link):
    checks, fail = [], None

    def add(name, ok, detail, kind=None, warn=False):
        nonlocal fail
        checks.append(dict(name=name, ok=ok, warn=warn, detail=detail))
        if not ok and not warn and fail is None:
            fail = kind or name

    blocking, soft = linker.classify_unmatched(question, link.get("unmatched", []))
    add("concepts grounded", not blocking,
        "every requested measure and filter maps to a column or value" if not blocking
        else f"the data has no column or value for: {', '.join(blocking)}", "unsupported_concept")
    if plan.notes and "no grouping column found" in plan.notes:
        add("grouping column", False, "the question asks 'which …' but no matching column was found", "no_group")
    if plan.years:
        rng = tabular.ts_range(plan.table)
        if not rng or rng[0] is None:
            add("date range", False, "this dataset has no usable date column", "no_time")
        else:
            lo, hi = rng[0].year, rng[1].year
            bad = [y for y in plan.years if y < lo or y > hi]
            add("date range", not bad, f"data covers {rng[0]:%b %Y} – {rng[1]:%b %Y}" +
                (f"; {', '.join(map(str, bad))} is outside it" if bad else ""), "out_of_range")
    cols, rows = result
    empty = not rows or all(r[-1] in (None, 0) for r in rows)
    add("non-empty result", not empty, f"{len(rows)} result row(s)", "empty")
    if fail:
        return fail, checks

    claims = draft["claims"]
    if plan.group and rows and "top_group" in claims:
        real = tabular.recount(plan, claims["top_group"])
        same = real is not None and abs(float(real) - float(claims["top_value"])) < 1e-6 * max(1, abs(float(real)))
        add("independent recount", same,
            f"recount for {claims['top_group']} = {_fmt(real)}; draft says {_fmt(claims['top_value'])}", "claim_mismatch")
        if len(rows) > 1 and rows[0][1] == rows[1][1]:
            add("tie check", True, f"{rows[0][0]} and {rows[1][0]} are tied", warn=True)
    if "total" in claims:
        real_total = tabular.total(plan)
        add("total recount", abs(float(real_total) - float(claims["total"])) < 1e-6 * max(1, real_total),
            f"total recomputed = {_fmt(real_total)}", "claim_mismatch")
    ph = tabular.placeholder_rows(plan)
    if ph:
        add("placeholder values", True, f"{_fmt(ph)} rows with values like 'Unspecified'/'Unknown' left out of the ranking",
            warn=True)
    if soft:
        add("wording", True, f"treated as wording, not a filter: {', '.join(soft)}", warn=True)
    if plan.group and not plan.group.startswith("time:"):
        ns = tabular.null_share(plan)
        if ns > 0.05:
            add("missing values", True, f"{ns:.0%} of matching rows have no {plan.group}; they are excluded", warn=True)
    premise = _premise(question, plan, link)
    if premise:
        add("premise check", True, premise, warn=True)
    return fail, checks

def _premise(question, plan, link):
    """'Since X had the most …' -> check X really is the top value of its column."""
    m = re.search(r"\b(since|because|given that|as|now that)\s+(.+?)\s+(had|has|have|was|is|sees|saw)\s+(the\s+)?"
                  r"(most|highest|largest|biggest)", question.lower())
    if not m:
        return None
    claimed = m.group(2).strip()
    v = next((v for v in link["values"] if v["word"] in claimed), None)
    if not v:
        return None
    top_val, top_cnt = tabular.top_of(plan.table, v["col"])
    if str(top_val).lower() == str(v["value"]).lower():
        return f"premise holds: {top_val} is the highest {v['col']} ({_fmt(top_cnt)})"
    return f"the question assumes {v['value']} is highest, but the data says {top_val} ({_fmt(top_cnt)} rows)"

def _fmt(x):
    if x is None:
        return "none"
    return f"{x:,.0f}" if float(x).is_integer() else f"{x:,.2f}"

# ------------------------------------------------------------------ text answers

# light equivalences so "minimum" matches "at least", "required" matches "must", ...
CANON = {"minimum": "min", "least": "min", "min": "min", "maximum": "max", "most": "max", "requir": "must",
         "must": "must", "mandatory": "must", "obligatory": "must", "prohibit": "forbid", "forbid": "forbid",
         "banned": "forbid", "allow": "permit", "allowed": "permit", "permit": "permit", "permitt": "permit",
         "kept": "store", "keep": "store", "store": "store", "saved": "store", "save": "store",
         "phase": "stage", "stage": "stage", "step": "stage", "prefer": "prefer", "recommend": "prefer"}

def _canon(ts):
    return {CANON.get(t, t) for t in ts}

def key_terms(question):
    return [t for t in terms(question) if len(t) > 2]

def coverage(question, text):
    q = _canon(key_terms(question))
    if not q:
        return 1.0
    have = _canon(terms(text))
    return len(q & have) / len(q)

def verify_text(question, parts, draft, passages, threshold):
    checks, fail = [], None
    # 1) every answer sentence must be supported by a cited passage
    unsupported = []
    for s in draft["sentences"]:
        src = next((p for p in passages if p["id"] == s["source_id"]), None)
        exact = src is not None and s["text"] in src["text"]
        if draft.get("llm"):
            ok = exact or (src is not None and coverage(s["text"], src["text"]) >= 0.8)
        else:
            ok = exact                                   # extractive drafts must be verbatim
        # every token that carries a number (3072, AES-256, Argon2id, 30) must exist in the cited passage
        if src is not None:
            src_tokens = set(re.findall(r"[A-Za-z0-9-]*\d[A-Za-z0-9-]*", src["text"]))
            ok = ok and all(t in src_tokens for t in re.findall(r"[A-Za-z0-9-]*\d[A-Za-z0-9-]*", s["text"]))
        if not ok:
            unsupported.append(s["text"][:80])
    checks.append(dict(name="sentence support", ok=not unsupported,
                       detail="every sentence is found in a cited source" if not unsupported
                       else f"{len(unsupported)} sentence(s) not in sources"))
    if unsupported:
        fail = "unsupported_sentence"
    # 2) each part of the question must be addressed
    answer_text = " ".join(s["text"] for s in draft["sentences"])
    for part in parts:
        cov = coverage(part, answer_text)
        checks.append(dict(name=f"covers: {part[:50]}", ok=cov >= threshold, detail=f"term coverage {cov:.0%}"))
        if cov < threshold and fail is None:
            fail = "low_coverage"
    if not draft["sentences"]:
        fail = fail or "no_evidence"
    return fail, checks
