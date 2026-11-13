"""The self-healing loop.

validate_input -> retrieve -> grade_relevance -> generate -> critique -> finalize
                     ^                              ^            |
                     |                              +-- rewrite -+   (same evidence, regenerate)
                     +------------ rewrite_query <---------------+   (targeted repair, new search)
                                                                 +-> abstain

Two evidence paths share the loop:
* table questions ("which / how many / top / share / trend") become SQL over every row of the table, so the
  numbers are exact; the critic recounts them independently.
* prose questions use hybrid BM25 + MiniLM search; every answer sentence must be found in a cited passage.

Each repair is chosen from the *reason* the critic failed the draft (wrong number, unknown term, empty filter,
missing part, unsupported sentence), so retries actually change something."""
import json
import re
import time
from dataclasses import dataclass

from . import linker, llm, store, tabular, textrag, verifier
from .config import MAX_ATTEMPTS, MAX_REGENERATIONS, SUPPORT_THRESHOLD, TEXT_TOP_K


@dataclass
class Policy:
    max_attempts: int = MAX_ATTEMPTS          # searches/queries per question, including the first
    max_regenerations: int = MAX_REGENERATIONS
    top_k: int = TEXT_TOP_K
    llm: dict | None = None                   # {"base_url","model","api_key"} or None for offline


class Run:
    """Collects steps (in the UI's node vocabulary), retrievals and healing facts for one question."""

    def __init__(self, question, policy: Policy, on_step=None):
        self.question, self.policy, self.on_step = question, policy, on_step
        self.steps, self.retrievals, self.reasons = [], [], []
        self.t0 = self._last = time.perf_counter()
        self.searches = 0
        self.regenerations = 0
        self.final_query = None
        self.missing = []

    def step(self, node, title, outcome="ok", **detail):
        now = time.perf_counter()
        s = dict(step_number=len(self.steps) + 1, node=node, title=title, outcome=outcome,
                 duration_ms=max(1, round((now - self._last) * 1000)), detail=_clean(detail), decision="")
        self._last = now
        self.steps.append(s)
        if self.on_step:
            self.on_step(s)
        return s

    @property
    def ms(self):
        return round((time.perf_counter() - self.t0) * 1000)


def _clean(d):
    return {k: v for k, v in d.items() if v not in (None, "", [], {})}

# ====================================================================================== entry point


def answer(question, sources=None, mode="self_healing", inject_false_claim=False, policy: Policy | None = None,
           on_step=None):
    """sources: list of catalog source names in scope (None = all)."""
    policy = policy or Policy()
    run = Run(question.strip(), policy, on_step)
    q = run.question
    cat = [c for c in store.catalog() if not sources or c["source_file"] in sources]
    if not q:
        run.step("validate_input", "Empty question", "fail", reason="Type a question first.")
        run.step("abstain", "Nothing to answer", "fail")
        return _final(run, "withheld", "Type a question to get started.", reason="no_relevant_evidence")
    if not cat:
        run.step("validate_input", "No documents in scope", "fail", reason="Index a document first.")
        run.step("abstain", "Answer withheld", "fail")
        return _final(run, "withheld", "No documents are selected or indexed yet. Upload files on the Documents page.",
                      reason="no_documents")
    if mode == "baseline":
        return _baseline(run, [c["source_file"] for c in cat])

    tables = [c for c in cat if c["kind"] == "table"]
    texts = [c["source_file"] for c in cat if c["kind"] == "text"]
    links = linker.link(q, tables) if tables else []
    route = _route(q, links, texts)
    run.step("validate_input", "Question accepted",
             reason=("Counting/ranking question: answered with SQL over every row of the best-matching table"
                     if route == "table" else "Lookup question: answered from document passages"),
             query=_route_detail(links) if route == "table" else None)
    if route == "table":
        res = _answer_table(run, links, inject_false_claim, defer_abstain=bool(texts))
        if res["status"] != "withheld" or not texts:
            return res
        if res["reason"] == "out_of_range":       # a definite answer about the data: no point searching prose
            run.step("abstain", "Answer withheld", "fail", reason=res["missing_information"][-1] if res["missing_information"] else None)
            return dict(res, steps=run.steps, latency_ms=run.ms)
        run.step("rewrite_query", "Trying the prose documents instead", "warn",
                 reason="No table could answer this reliably", new_query=q)
        txt = _answer_text(run, texts, inject_false_claim, kinds=("text",), resumed=True)
        return txt if txt["status"] != "withheld" else dict(res, steps=run.steps, latency_ms=run.ms,
                                                            searches=run.searches, healed=True)
    return _answer_text(run, texts or [c["source_file"] for c in cat], inject_false_claim,
                        kinds=("text",) if texts else ("row", "profile"))


def _route(question, links, texts):
    if not links:
        return "text"
    best = links[0]
    analytical = tabular.detect_intent(question) in {"top", "share", "count", "sum", "avg", "trend", "compare"}
    has_ts = any(c["name"] == "_ts" for c in best["profile"]["columns"])
    strong = bool(best["columns"] or best["values"] or best["table_hits"] or (tabular._time_unit(question) and has_ts))
    if texts:
        top_txt = textrag.search(question, k=1, sources=texts)
        txt_cov = verifier.coverage(question, top_txt[0]["text"]) if top_txt else 0
        if txt_cov >= 0.75 and not best["values"] and best["score"] < 3:
            return "text"
    return "table" if (strong and analytical) or best["score"] >= 3 else "text"


def _route_detail(links):
    b = links[0]
    bits = [f"{b['source']}"]
    if b["columns"]:
        bits.append("columns " + ", ".join(sorted({m["col"] for m in b["columns"]})))
    if b["values"]:
        bits.append("values " + ", ".join(sorted({str(v["value"]) for v in b["values"]})))
    return "; ".join(bits)

# ====================================================================================== tables


def _answer_table(run, links, inject, defer_abstain=False):
    candidates = [l for l in links if l["score"] > links[0]["score"] - 1.0 and (l["columns"] or l["values"])
                  and not l["table_hits"]]
    exact = [v for v in links[0]["values"] if v["how"] == "exact"]
    if len(candidates) > 1 and not exact and not links[0]["table_hits"]:
        results = [_table_loop(run, l, inject, quiet=True, defer_abstain=True) for l in candidates]
        good = [r for r in results if r["status"] in {"verified", "corrected"}]
        if len(good) == 1:
            run.step("finalize", "Verified answer delivered", reason=f"Only {good[0]['sources'][0]['source']} could answer it")
            return dict(good[0], steps=run.steps, latency_ms=run.ms)
        if good:
            parts, srcs = [], []
            for r in good:
                n = len(srcs) + 1
                parts.append(r["answer"].replace("[S1]", f"[S{n}]"))
                srcs.append(dict(r["sources"][0], id=f"S{n}"))
            text = "This question matches more than one dataset, so here is the verified answer for each:\n\n" + \
                   "\n\n".join(parts)
            run.step("finalize", "Verified answer delivered", reason=f"{len(good)} datasets answered")
            return _final(run, "corrected", text, sources=srcs, route="table",
                          checks=[c for r in good for c in r["checks"]], evidence=[r["evidence"] for r in good])
        if not defer_abstain:
            run.step("abstain", "Answer withheld", "fail", reason=results[0]["missing_information"][-1]
                     if results[0]["missing_information"] else None)
        return dict(results[0], steps=run.steps, latency_ms=run.ms)
    return _table_loop(run, links[0], inject, others=links[1:], defer_abstain=defer_abstain)


def _table_loop(run, link, inject, others=(), quiet=False, defer_abstain=False):
    q, pol = run.question, run.policy
    link = dict(link, columns=list(link["columns"]), values=list(link["values"]), unmatched=list(link["unmatched"]))
    skip, healed, checks, notes = set(), False, [], list(link.get("notes", []))
    attempt, regens, plan, result = 0, 0, None, None
    reuse = False
    while True:
        if not reuse:
            attempt += 1
            run.searches += 1
            plan = tabular.build_plan(q, link, skip_cols=skip)
            run.final_query = plan.describe()
            try:
                result = tabular.run(plan)
            except Exception as ex:
                run.step("retrieve", f"Query attempt {attempt} failed", "fail", query=plan.describe(), error=str(ex)[:300])
                skip.add(plan.group or "")
                healed = True
                run.reasons.append("irrelevant_evidence")
                if attempt >= pol.max_attempts:
                    break
                run.step("rewrite_query", "Trying another column", "warn", reason="The query failed")
                continue
            cols_, rows_ = result
            run.step("retrieve", f"Query attempt {attempt}: SQL over all {link['rows']:,} rows",
                     query=f"{link['source']}: {plan.describe()}", sql=plan.sql, retrieved=len(rows_),
                     top=[dict(score=float(r[-1]) if isinstance(r[-1], (int, float)) else 0) for r in rows_[:5]])
            for i, r in enumerate(rows_[:10]):
                run.retrievals.append(dict(attempt=attempt, query=plan.describe(),
                                           chunk_id=f"{link['table']}: " + " | ".join(str(x) for x in r),
                                           document=link["source"], rank=i + 1,
                                           score=float(r[-1]) if isinstance(r[-1], (int, float)) else None, relevant=True))
            nonempty = bool(rows_) and not all(r[-1] in (None, 0) for r in rows_)
            run.step("grade_relevance", f"Result checked: {len(rows_)} row(s)" + ("" if nonempty else " — empty"),
                     "ok" if nonempty else "warn", retrieved=len(rows_), relevant=len(rows_) if nonempty else 0)
            gm = next((m for m in link["columns"] if m["col"] == plan.group and m["how"] != "name"), None)
            if gm and f"read '{gm['word']}'" not in " ".join(notes):
                notes.append(f"read '{gm['word']}' as {_label(link, plan.group)}")
        draft = _draft_table(q, plan, result, link, inject and attempt == 1 and regens == 0)
        run.step("generate", "Answer rewritten from recomputed numbers" if reuse else "Draft answer written",
                 draft=draft["text"], regeneration=reuse or None, fault_injected=draft.get("injected"))
        reuse = False
        fail, checks = verifier.verify_table(q, plan, result, draft, link)
        if not fail:
            run.step("critique", "Verifier passed", feedback="; ".join(c["detail"] for c in checks if c["ok"])[:400])
            text = draft["text"] + " [S1]"
            warns = [c["detail"] for c in checks if c.get("warn")]
            if notes or warns:
                text += "\n\n" + "\n".join(f"- Note: {n}" for n in notes + warns)
            if not quiet:
                run.step("finalize", "Verified answer delivered")
            return _final(run, "corrected" if healed else "verified", text, route="table", checks=checks,
                          sources=[_table_source(plan, result, link)], evidence=_evidence(plan, result))
        detail = next((c["detail"] for c in checks if not c["ok"] and not c.get("warn")), "")
        reason_key = {"claim_mismatch": "unsupported_claims", "unsupported_concept": "missing_column",
                      "out_of_range": "out_of_range", "no_time": "out_of_range", "empty": "empty_retrieval",
                      "no_group": "irrelevant_evidence"}.get(fail, "no_relevant_evidence")
        run.reasons.append(reason_key)
        claims = [dict(claim=draft["text"][:200], reason=detail)] if fail == "claim_mismatch" else None
        if fail == "claim_mismatch" and regens < max(pol.max_regenerations, 0):
            run.step("critique", "Critic rejected the draft — a number didn't match the recount", "warn",
                     feedback=detail, unsupported_claims=claims)
            regens += 1
            run.regenerations += 1
            healed, inject, reuse = True, False, True
            continue
        last = attempt >= pol.max_attempts
        final_fail = last or fail in {"out_of_range", "no_time"}
        run.step("critique", f"Critic rejected the draft — {_fail_text(fail)}" + (" — no budget left" if last else ""),
                 "fail" if final_fail else "warn", feedback=detail, unsupported_claims=claims,
                 missing_information=[detail] if fail in {"unsupported_concept", "out_of_range", "no_group"} else None)
        if final_fail:
            if last and reason_key != "out_of_range":
                run.reasons.append("retry_budget_exhausted")
            break
        healed = True
        fixed = _repair_table(run, link, fail, notes, skip, others)
        if fixed == "switch":
            alt = next((o for o in others if o["score"] > 0), None)
            return (_table_loop(run, alt, inject, others=[], quiet=quiet, defer_abstain=defer_abstain) if alt
                    else _withhold_table(run, link, checks, defer_abstain))
        if not fixed:
            break
    return _withhold_table(run, link, checks, defer_abstain)


def _fail_text(fail):
    return {"claim_mismatch": "a number didn't match the recount", "unsupported_concept": "a term isn't in the data",
            "out_of_range": "the dates are outside the data", "no_time": "the data has no dates",
            "empty": "no rows matched", "no_group": "no matching column"}.get(fail, fail.replace("_", " "))


def _repair_table(run, link, fail, notes, skip, others):
    q = run.question
    if fail == "unsupported_concept":
        blocking, _ = linker.classify_unmatched(q, link["unmatched"])
        changed = []
        for w in blocking:
            w = w.split()[0]
            if w not in link["unmatched"]:
                continue
            fv = linker.fuzzy_values(w, link["table"])
            if fv:
                v = fv[0]
                link["values"].append(dict(v, pos=-1, n=1))
                link["unmatched"].remove(w)
                notes.append(f"'{w}' isn't a value in the data; matched it to {v['col']} = '{v['value']}' ({v['how']})")
                changed.append(f"{w} → {v['col']} = {v['value']}")
                continue
            fc = linker.fuzzy_columns(w, link["profile"])
            if fc:
                link["columns"].append(dict(col=fc["name"], role=fc["role"], pos=-1, word=w, how="fuzzy"))
                link["unmatched"].remove(w)
                notes.append(f"read '{w}' as column '{fc['label']}'")
                changed.append(f"{w} → column {fc['name']}")
        if changed:
            run.step("rewrite_query", "Mapped unknown terms to real data", "warn", new_query="; ".join(changed),
                     reason="The critic found terms with no matching column or value")
            return True
        alt = next((o for o in others if not (set(blocking) & set(o["unmatched"])) and o["score"] > 0), None)
        if alt:
            run.step("rewrite_query", f"Switching dataset to {alt['source']}", "warn",
                     reason="It covers the missing terms", new_query=alt["source"])
            return "switch"
        return False
    if fail == "no_group":
        m = re.search(r"\b(?:which|what|by|per|each)\s+([a-z]+)", q.lower())
        noun = m.group(1) if m else None
        fc = linker.fuzzy_columns(noun, link["profile"]) if noun else None
        if fc and fc["name"] not in skip:
            link["columns"].append(dict(col=fc["name"], role="categorical", pos=-1, word=noun, how="fuzzy"))
            run.step("rewrite_query", f"Grouping by {fc['label']}", "warn", new_query=f"group by {fc['name']}",
                     reason=f"Closest column to '{noun}'")
            return True
        if any(o["score"] > 0 for o in others):
            alt = next(o for o in others if o["score"] > 0)
            run.step("rewrite_query", f"Switching dataset to {alt['source']}", "warn", new_query=alt["source"])
            return "switch"
        return False
    if fail == "empty" and link["values"]:
        dropped = link["values"].pop()
        notes.append(f"no rows matched {dropped['col']} = '{dropped['value']}', so that filter was relaxed")
        run.step("rewrite_query", "Relaxing the narrowest filter", "warn",
                 new_query=f"without {dropped['col']} = {dropped['value']}", reason="No rows matched")
        return True
    return False


def _withhold_table(run, link, checks, quiet):
    reason = next((c["detail"] for c in checks if not c["ok"] and not c.get("warn")), "the answer couldn't be verified")
    run.missing.append(reason)
    if not quiet:
        run.step("abstain", "Answer withheld", "fail", reason=reason)
    prof = link["profile"]
    usable = [c["label"] for c in prof["columns"] if c["role"] in {"categorical", "numeric", "datetime", "flag"}
              and not c["name"].startswith("_") and (c.get("distinct") or 0) > 1][:16]
    rng = tabular.ts_range(link["table"]) if any(c["name"] == "_ts" for c in prof["columns"]) else None
    span = f" It covers {rng[0]:%b %Y} – {rng[1]:%b %Y}." if rng and rng[0] else ""
    text = (f"I can't answer this reliably from **{link['source']}**: {reason}.\n\n"
            f"This dataset can answer questions about {', '.join(usable)}.{span}")
    return _final(run, "withheld", text, route="table", checks=checks)


def _noun(question, link=None):
    for w in ("calls", "accidents", "collisions", "crashes", "incidents", "trips", "orders", "sales", "cases"):
        if w in question.lower() or w[:-1] in question.lower():
            return w
    if link:
        return link["profile"].get("row_noun") or "records"
    return "records"


def _label(link, col):
    if not col:
        return ""
    if col.startswith("time:"):
        return {"hour": "hour of day", "dow": "day of week", "month": "month", "year": "year", "date": "date"}[col[5:]]
    for c in link["profile"]["columns"]:
        if c["name"] == col:
            return c["label"]
    return col


def _gfmt(group, v):
    if group == "time:hour" and v is not None:
        return f"{int(v):02d}:00–{(int(v) + 1) % 24:02d}:00"
    return str(v)


def _draft_table(question, plan, result, link, inject):
    cols, rows = result
    f = verifier._fmt
    noun = _noun(question, link)
    what = f"{_label(link, plan.metric).lower()}" if plan.metric else noun
    flt = ""
    if plan.filters or plan.years:
        parts = [f"{_label(link, c)} = {', '.join(v) if isinstance(v, list) else v}" for c, _, v, _ in plan.filters]
        if plan.years:
            yrs = (f"{min(plan.years)}–{max(plan.years)}" if plan.intent == "trend"
                   else ", ".join(map(str, plan.years)))
            parts.append(f"year {yrs}")
        flt = " (" + "; ".join(parts) + ")"
    src = f"**{plan.source}**"
    claims = {}
    if plan.intent == "list":
        return dict(text=f"Here are {len(rows)} matching rows from {src}{flt}.", claims={})
    if plan.group and rows:
        tot = tabular.total(plan)
        top_g, top_v = rows[0][0], rows[0][1]
        claims = dict(top_group=top_g, top_value=float(top_v), total=float(tot))
        shown_v = round(float(top_v) * 1.37) if inject else top_v
        if inject:
            claims["top_value"] = float(shown_v)
        gl = _label(link, plan.group)
        pct = f" ({top_v / tot:.1%} of {f(tot)})" if tot and plan.intent != "avg" else ""
        if plan.intent == "trend":
            first, last = rows[0], rows[-1]
            chg = (last[1] - first[1]) / first[1] if first[1] else 0
            lines = ", ".join(f"{_gfmt(plan.group, g)}: {f(v)}" for g, v in rows[:24])
            text = (f"{what.capitalize()} by {gl} in {src}{flt}: {lines}. From {_gfmt(plan.group, first[0])} to "
                    f"{_gfmt(plan.group, last[0])} the count went from {f(first[1])} to {f(last[1])} ({chg:+.1%}).")
            claims = dict(top_group=first[0], top_value=float(first[1]))
        elif plan.intent == "share":
            lines = "\n".join(f"- {_gfmt(plan.group, g)}: {v / tot:.1%} ({f(v)})" for g, v in rows[:10])
            text = f"Breakdown of {what} by {gl} in {src}{flt}, out of {f(tot)}:\n{lines}"
        elif plan.intent == "avg":
            lines = ", ".join(f"{_gfmt(plan.group, g)}: {f(v)}" for g, v in rows[:6])
            text = f"Average {_label(link, plan.metric)} by {gl} in {src}{flt}: {lines}."
            claims.pop("total", None)
        elif plan.intent == "compare":
            lines = ", ".join(f"**{_gfmt(plan.group, g)}** {f(v)}" for g, v in rows)
            text = f"{what.capitalize()} in {src}{flt}: {lines}. **{_gfmt(plan.group, top_g)}** is higher."
        else:
            word = "fewest" if plan.order == "ASC" else "most"
            if plan.top_n and plan.top_n > 1:
                lines = "\n".join(
                    f"{i + 1}. **{_gfmt(plan.group, g)}**: {f(round(float(v) * 1.37) if inject and i == 0 else v)}"
                    f" ({v / tot:.1%})" for i, (g, v) in enumerate(rows[:plan.top_n]))
                return dict(text=f"Top {plan.top_n} {gl} by {what} in {src}{flt}, out of {f(tot)}:\n{lines}",
                            claims=claims, injected=inject or None)
            nxt = ", ".join(f"{_gfmt(plan.group, g)} ({f(v)})" for g, v in rows[1:5])
            text = (f"**{_gfmt(plan.group, top_g)}** had the {word} {what} in {src}{flt}: **{f(shown_v)}**{pct}."
                    + (f" Next: {nxt}." if nxt else ""))
    elif rows:
        v = rows[0][0]
        claims = dict(total=float(v or 0))
        if inject:
            claims["total"] = float(round(float(v or 0) * 1.37))
        verb = "Average" if plan.intent == "avg" else "Total"
        text = f"{verb} {what} in {src}{flt}: **{f(claims['total'])}**."
    else:
        text = "No matching rows."
    return dict(text=text, claims=claims, injected=inject or None)


def _table_source(plan, result, link):
    cols, rows = result
    header = " | ".join("group" if c == "grp" else c for c in cols)
    preview = "\n".join(" | ".join(_fmt_cell(x) for x in r) for r in rows[:15])
    return dict(id="S1", source=plan.source, kind="sql", locator=json.dumps(dict(section="SQL over the full table")),
                score=None, chunk_id=f"{link['table']}#sql",
                text=f"Query on {plan.source} ({link['rows']:,} rows):\n{plan.sql}\n\n{header}\n{preview}")


def _fmt_cell(x):
    if isinstance(x, float):
        return f"{x:,.2f}"
    if isinstance(x, int):
        return f"{x:,}"
    return str(x)


def _evidence(plan, result):
    cols, rows = result
    return dict(table=plan.table, source=plan.source, sql=plan.sql, columns=cols,
                rows=[[x if isinstance(x, (int, float, str, bool)) or x is None else str(x) for x in r] for r in rows[:50]])

# ====================================================================================== prose


def _split_parts(q):
    ql = q.strip().rstrip("?")
    m = re.match(r"(?i)what is the difference between (.+?) and (.+)$", ql)
    if m:
        return [f"What is {m.group(1)}?", f"What is {m.group(2)}?"]
    m = re.match(r"(?i)(.+?) and (what|how|why|which|when|where|who) (.+)$", ql)
    if m:
        return [m.group(1) + "?", f"{m.group(2)} {m.group(3)}?"]
    return [q]


def _answer_text(run, sources, inject, kinds=("text",), resumed=False):
    q, pol = run.question, run.policy
    parts = _split_parts(q)
    queries = list(parts)
    passages, graded, checks, healed = [], [], [], resumed
    attempt, regens = 0, 0
    reuse = False
    draft = None
    while True:
        if not reuse:
            attempt += 1
            run.searches += 1
            run.final_query = " | ".join(queries)
            seen, passages = set(), []
            for qx in queries:
                for h in textrag.search(qx, k=pol.top_k, sources=sources, kinds=kinds):
                    if h["id"] not in seen:
                        seen.add(h["id"])
                        passages.append(h)
            run.step("retrieve", f"Search attempt {attempt}", "ok" if passages else "warn",
                     query=" | ".join(queries), retrieved=len(passages),
                     top=[dict(score=p["score"]) for p in passages[:5]])
            graded = [p for p in passages if verifier.coverage(_best_part(p, parts), p["text"]) >= 0.4]
            gids = {p["id"] for p in graded}
            for i, p in enumerate(passages):
                run.retrievals.append(dict(attempt=attempt, query=" | ".join(queries), chunk_id=p["id"], document=p["source"],
                                           rank=i + 1, score=p["score"], relevant=p["id"] in gids))
            run.step("grade_relevance", f"{len(graded)} of {len(passages)} passages relevant",
                     "ok" if graded else "warn", retrieved=len(passages), relevant=len(graded))
            if not passages:
                run.reasons.append("empty_retrieval")
        draft = _draft_text(q, parts, graded or passages[:2], inject and attempt == 1 and regens == 0, run.policy.llm,
                            drop=draft.get("rejected") if (reuse and draft) else None)
        run.step("generate", "Answer rewritten from the same evidence" if reuse else "Draft answer written",
                 draft=_render_text(draft), regeneration=reuse or None, fault_injected=draft.get("injected"))
        reuse = False
        fail, checks = verifier.verify_text(q, parts, draft, passages, SUPPORT_THRESHOLD)
        if not fail:
            run.step("critique", "Verifier passed", feedback="Every sentence is found in a cited passage")
            run.step("finalize", "Verified answer delivered")
            return _final(run, "corrected" if healed else "verified", _render_text(draft), route="text",
                          sources=_cite(draft, passages), checks=checks)
        bad = [c for c in checks if not c["ok"]]
        unsupported = [dict(claim=s, reason="Not found in the cited passage") for s in draft.get("rejected", [])]
        missing = [c["name"].replace("covers: ", "") for c in bad if c["name"].startswith("covers:")]
        run.missing = missing
        if (fail == "unsupported_sentence" and regens < max(pol.max_regenerations, 0)
                and len(draft["sentences"]) > len(unsupported)):
            run.step("critique", "Critic rejected unsupported claims — rewriting", "warn", unsupported_claims=unsupported,
                     feedback="Some sentences aren't in the sources")
            run.reasons.append("unsupported_claims")
            regens += 1
            run.regenerations += 1
            healed, inject, reuse = True, False, True
            continue
        last = attempt >= pol.max_attempts
        run.reasons.append({"unsupported_sentence": "unsupported_claims", "low_coverage": "missing_information",
                            "no_evidence": "no_relevant_evidence"}.get(fail, "no_relevant_evidence"))
        run.step("critique", "Critic rejected the draft" + (" — no budget left" if last else " — searching again"),
                 "fail" if last else "warn", unsupported_claims=unsupported or None, missing_information=missing or None,
                 feedback="; ".join(c["detail"] for c in bad)[:400])
        if last:
            run.reasons.append("retry_budget_exhausted")
            break
        healed, inject = True, False
        new_q = []
        for qx in parts:
            extra = textrag.related_terms(qx, [p for p in passages if verifier.coverage(qx, p["text"]) > 0.3])
            fixes = []
            for w in verifier.key_terms(qx):
                if w not in textrag.INDEX.text_vocab:
                    fixes += textrag.vocab_suggest(w, 1)
            extra = [e for e in extra if not re.search(r"\d", e) and e not in " ".join(queries)]
            new_q.append(" ".join(verifier.key_terms(qx) + fixes + extra[:3]))
        if new_q == queries:
            run.reasons.append("repeated_query")
            break
        run.step("rewrite_query", "Search reformulated", "warn", new_query=" | ".join(new_q),
                 missing=missing or None, reason="Uses the documents' own vocabulary for the parts that weren't covered")
        queries = new_q
    run.step("abstain", "Insufficient evidence — answer withheld", "fail")
    if set(kinds) <= {"row", "profile"}:
        tables = [c for c in store.catalog() if c["kind"] == "table" and c["source_file"] in sources]
        caps = "\n".join(f"- **{t['source_file']}** ({t['row_count']:,} rows): " + ", ".join(
            c["label"] for c in t["profile"]["columns"] if c["role"] in {"categorical", "numeric", "datetime"}
            and not c["name"].startswith("_") and (c.get("distinct") or 0) > 1)[:300] for t in tables)
        return _final(run, "withheld", "I couldn't match this question to the columns of your data, so I'm not guessing.\n\n"
                      f"Your datasets contain:\n{caps}\n\nTry asking about one of these fields, for example "
                      "\"Which <field> had the most records?\" or \"How many records were there in <year>?\"",
                      route="text", checks=checks)
    text = "I couldn't find this in the selected documents, so I'm not answering rather than guessing."
    if missing:
        text += "\n\nNot covered by the documents: " + "; ".join(missing)
    return _final(run, "withheld", text, route="text", checks=checks)


def _best_part(passage, parts):
    return max(parts, key=lambda p: verifier.coverage(p, passage["text"]))


def _sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if len(s.strip()) > 20]


def _draft_text(question, parts, passages, inject, llm_cfg, drop=None):
    drop = set(drop or [])
    chosen, res = None, None
    if llm_cfg and passages:
        out = llm.answer_with_citations(question, passages, llm_cfg)
        if out:
            chosen = [s for s in out if s["text"] not in drop]
            res = dict(sentences=chosen, llm=True)
    if chosen is None:
        chosen = []
        for part in parts:
            scored = []
            for p in passages:
                for s in _sentences(p["text"]):
                    scored.append((verifier.coverage(part, s), -len(s), s, p["id"]))
            scored.sort(reverse=True)
            taken = 0
            for cov, _, s, pid in scored:
                if cov < 0.34 or s in drop or any(s == c["text"] for c in chosen):
                    continue
                chosen.append(dict(text=s, source_id=pid))
                taken += 1
                if taken >= (2 if len(parts) > 1 else 3):
                    break
        res = dict(sentences=chosen)
    if inject and chosen:
        fake = "This rule was approved by the board in 1998 and applies to every contractor worldwide."
        chosen.append(dict(text=fake, source_id=chosen[0]["source_id"]))
        res["injected"] = True
    # remember which sentences the verifier will reject, so a rewrite drops exactly those
    by_id = {p["id"]: p for p in passages}
    rejected = []
    for s in chosen:
        src = by_id.get(s["source_id"])
        ok = src is not None and (s["text"] in src["text"]
                                  or (res.get("llm") and verifier.coverage(s["text"], src["text"]) >= 0.8))
        if not ok:
            rejected.append(s["text"])
    res["rejected"] = rejected
    return res


def _render_text(draft):
    ids, out = {}, []
    for s in draft["sentences"]:
        ids.setdefault(s["source_id"], f"S{len(ids) + 1}")
        out.append(f"{s['text']} [{ids[s['source_id']]}]")
    return " ".join(out)


def _cite(draft, passages):
    ids, out = {}, []
    by_id = {p["id"]: p for p in passages}
    for s in draft["sentences"]:
        if s["source_id"] not in ids and s["source_id"] in by_id:
            ids[s["source_id"]] = f"S{len(ids) + 1}"
            p = by_id[s["source_id"]]
            out.append(dict(id=ids[s["source_id"]], source=p["source"], locator=p["locator"], kind=p["kind"],
                            text=p["text"], score=p["score"], chunk_id=p["id"]))
    return out

# ====================================================================================== baseline


def _baseline(run, sources):
    """Plain RAG: one search, extractive answer, no grading or verification (for comparison)."""
    q = run.question
    run.searches = 1
    hits = textrag.search(q, k=run.policy.top_k, sources=sources, kinds=("text", "row", "profile"))
    for i, h in enumerate(hits):
        run.retrievals.append(dict(attempt=1, query=q, chunk_id=h["id"], document=h["source"], rank=i + 1,
                                   score=h["score"], relevant=None))
    if not hits:
        return _final(run, "unverified", "No passages matched the question.", route="baseline")
    sents = []
    for h in hits[:3]:
        best = sorted(_sentences(h["text"]) or [h["text"][:300]], key=lambda s: -verifier.coverage(q, s))[:1]
        sents += [dict(text=s, source_id=h["id"]) for s in best]
    draft = dict(sentences=sents)
    if run.policy.llm:
        out = llm.answer_with_citations(q, hits[:6], run.policy.llm)
        if out:
            draft = dict(sentences=out)
    return _final(run, "unverified", _render_text(draft), route="baseline", sources=_cite(draft, hits))

# ====================================================================================== result


def _final(run, status, text, route="none", sources=None, checks=None, evidence=None, reason=None):
    reasons = [r for r in run.reasons if r]
    if reason:
        main = reason
    elif status == "withheld":
        main = reasons[-1] if reasons else "no_relevant_evidence"
    else:
        main = reasons[0] if reasons else None
    return dict(question=run.question, answer=text, status=status, route=route, sources=sources or [],
                checks=checks or [], evidence=evidence, steps=run.steps, retrievals=run.retrievals,
                searches=run.searches, regenerations=run.regenerations, reason=main,
                final_query=run.final_query, missing_information=run.missing, latency_ms=run.ms,
                healed=status == "corrected" or run.regenerations > 0 or run.searches > 1)
