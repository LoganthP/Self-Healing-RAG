"""Question -> SQL plan -> result, for ingested tables. Deterministic (no LLM needed), so numbers are exact."""
import re
from dataclasses import dataclass, field

from . import store
from .linker import TIME_UNITS, norm_words

TOP_WORDS = {"most", "mostly", "highest", "top", "maximum", "max", "largest", "biggest", "leading", "busiest",
             "common", "frequent", "frequently", "often", "worst", "more"}
LOW_WORDS = {"least", "fewest", "lowest", "minimum", "min", "smallest", "rarest", "less"}
SHARE_WORDS = {"share", "percentage", "percent", "proportion", "breakdown", "distribution", "split", "ratio"}
COUNT_WORDS = {"how many", "number of", "count of", "total number", "how much", "count"}
AVG_WORDS = {"average", "mean", "avg", "typical"}
TREND_WORDS = {"trend", "over time", "change", "changed", "grow", "grew", "increase", "increased", "decrease",
               "decreased", "per year", "per month", "each year", "each month", "by year", "by month", "by hour"}
LIST_WORDS = {"show", "list", "display", "give me rows", "examples of", "sample"}
PEOPLE_METRIC_HINT = {"people", "persons", "person", "victims"}

TIME_EXPR = {"hour": "hour(_ts)", "dow": "dayname(_ts)", "month": "strftime(_ts, '%Y-%m')",
             "year": "year(_ts)", "date": "CAST(_ts AS DATE)"}

PLACEHOLDERS = ("unspecified", "unknown", "n/a", "na", "none", "null", "", "nan", "not specified", "other")
NUMBER_WORDS = {"three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "ten": 10, "twenty": 20}

def top_n(q):
    m = re.search(r"\b(?:top|first|the)\s+(\d{1,2}|three|four|five|six|seven|eight|ten|twenty)\b", q.lower())
    if m:
        v = m.group(1)
        return int(v) if v.isdigit() else NUMBER_WORDS[v]
    m = re.search(r"\b(\d{1,2}|three|four|five|six|seven|eight|ten)\s+(most|least|biggest|largest|busiest)", q.lower())
    if m:
        v = m.group(1)
        return int(v) if v.isdigit() else NUMBER_WORDS[v]
    return None

@dataclass
class Plan:
    table: str
    source: str
    intent: str                       # top | share | count | sum | avg | trend | compare | list
    group: str | None = None          # column name or time unit key ("time:hour")
    metric: str | None = None         # numeric column for sum/avg
    filters: list = field(default_factory=list)   # (col, op, value, word)
    years: list = field(default_factory=list)
    order: str = "DESC"
    limit: int = 10
    notes: list = field(default_factory=list)
    top_n: int | None = None
    exclude_placeholders: bool = False
    sql: str = ""
    confidence: float = 0.0

    def describe(self):
        bits = [self.intent]
        if self.group:
            bits.append(f"by {self.group}")
        if self.metric:
            bits.append(f"of {self.metric}")
        if self.filters:
            bits.append("where " + ", ".join(f"{c} {op} {v!r}" for c, op, v, _ in self.filters))
        if self.years:
            bits.append(f"years {self.years}")
        return " ".join(bits)

def _has(q, phrases):
    return any(re.search(rf"\b{re.escape(p)}\b", q) for p in phrases)

def detect_intent(q):
    ql = q.lower()
    if _has(ql, SHARE_WORDS):
        return "share"
    if _has(ql, AVG_WORDS):
        return "avg"
    if _has(ql, TREND_WORDS) or re.search(r"\bfrom (19|20)\d\d to (19|20)\d\d\b", ql):
        return "trend"
    if re.search(r"\b(vs|versus|compare|compared|or)\b", ql) and _has(ql, TOP_WORDS | {"compare", "vs", "versus"}):
        return "compare"
    if _has(ql, TOP_WORDS) or _has(ql, LOW_WORDS) or re.search(r"\b(which|what)\b.*\b(had|has|have|saw|recorded|got)\b", ql):
        return "top"
    if _has(ql, COUNT_WORDS) or ql.startswith("total"):
        return "count"
    if _has(ql, LIST_WORDS):
        return "list"
    return "top" if re.match(r"\s*(which|what)\b", ql) else "count"

def _time_unit(q):
    ql = q.lower()
    for phrase in sorted(TIME_UNITS, key=len, reverse=True):
        if re.search(rf"\b(which|what|by|per|each|busiest|peak|of the|of)\s+(the\s+)?{phrase}\b", ql) or \
           re.search(rf"\b{phrase}\s+of\s+(the\s+)?(day|week)\b", ql) and phrase in {"time", "day"}:
            return TIME_UNITS[phrase]
    if re.search(r"\btime of (the )?day\b", ql):
        return "hour"
    return None

def build_plan(question, link, skip_cols=()):
    """link: one table's result from linker.link()."""
    prof = link["profile"]
    cols = {c["name"]: c for c in prof["columns"]}
    words = norm_words(question)
    intent = detect_intent(question)
    p = Plan(table=link["table"], source=link["source"], intent=intent)
    p.order = "ASC" if _has(question.lower(), LOW_WORDS) else "DESC"
    p.top_n = top_n(question)

    # years
    years = sorted({int(y) for y in re.findall(r"\b(19[5-9]\d|20[0-4]\d)\b", question)})
    p.years = years
    if intent == "trend" and len(years) >= 2:
        p.group = "time:year"

    # filters from matched values; values on the same column as the group become a compare set
    vals = [v for v in link["values"] if v["col"] not in skip_cols]
    # metric = numeric column matched by a word (killed / injured ...); prefer generic persons_* columns
    anchor_pos = next((i for i, w in enumerate(words) if w in {"which", "what", "by", "per", "each"}), None)
    metric_cols = [m for m in link["columns"] if m["role"] == "numeric" and m["col"] not in skip_cols
                   and not (anchor_pos is not None and m["pos"] == anchor_pos + 1 and (cols[m["col"]]["distinct"] or 0) <= 50)]
    if metric_cols:
        people_first = sorted(metric_cols, key=lambda m: (0 if "person" in m["col"] or "total" in m["col"] else 1,
                                                           len(m["col"])))
        # a role word next to the metric (pedestrians killed) picks the specific column
        specific = [m for m in metric_cols if any(w in m["col"] for w in words if len(w) > 4 and w not in m["word"])]
        p.metric = (specific or people_first)[0]["col"]
        if p.intent == "count":
            p.intent = "sum"

    # group column: the column named after which/what/by/per/each, else the first categorical match
    tu = _time_unit(question)
    if tu and "_ts" in cols:
        p.group = f"time:{tu}"
    if not p.group and intent in {"top", "share", "compare", "trend", "avg"}:
        anchor = None
        for i, w in enumerate(words):
            if w in {"which", "what", "by", "per", "each", "across", "in", "every"}:
                anchor = i
                break
        cands = [m for m in link["columns"] if m["col"] not in skip_cols and (m["role"] in {"categorical", "flag"} or
                 (m["role"] == "numeric" and anchor_pos is not None and m["pos"] == anchor_pos + 1
                  and (cols[m["col"]]["distinct"] or 0) <= 50))]
        if cands:
            hits = {}
            for m in link["columns"]:
                hits[m["col"]] = hits.get(m["col"], 0) + 1
            # 'vehicle 1 factor' -> the column matching the most question words; numbered families prefer _1_
            digits = set(re.findall(r"\b\d\b", question))
            def fam_bonus(c):
                d = re.findall(r"_(\d)_", c)
                return 0 if not d else (0 if d[0] in digits or (not digits and d[0] == "1") else 1)
            if anchor is not None:
                cands.sort(key=lambda m: (-hits[m["col"]], fam_bonus(m["col"]), abs(m["pos"] - anchor - 1),
                                          0 if m["how"] == "name" else 1, -_groupability(cols[m["col"]])))
            else:
                cands.sort(key=lambda m: (-hits[m["col"]], fam_bonus(m["col"]), 0 if m["how"] == "name" else 1,
                                          -_groupability(cols[m["col"]])))
            p.group = cands[0]["col"]
        elif intent == "trend" and "_ts" in cols:
            p.group = "time:year"
        elif vals and intent in {"top", "compare", "share"}:
            # "which is more common, EMS or Fire" -> group by the column those values live in
            p.group = vals[0]["col"]
    if p.group == p.metric:
        p.metric = None

    same_col = [v for v in vals if v["col"] == p.group]
    for v in vals:
        if v["col"] == p.group:
            continue
        p.filters.append((v["col"], "=", v["value"], v["word"]))
    if p.intent == "share":
        pass                                   # show every group's share; the named ones are part of it
    elif len(same_col) >= 2 or (same_col and intent == "compare"):
        p.filters.append((p.group, "IN", [v["value"] for v in same_col], ", ".join(v["word"] for v in same_col)))
        p.intent = "compare"
    elif len(same_col) == 1:
        # "how many / which ... drunk" where the only grouping candidate is the filtered column -> a filtered count
        p.filters.append((p.group, "=", same_col[0]["value"], same_col[0]["word"]))
        p.group = None
        if p.intent not in {"sum", "avg", "list"}:
            p.intent = "sum" if p.metric else "count"
    if p.intent in {"top", "compare"} and not p.group and p.filters:
        p.intent = "sum" if p.metric else "count"
    if p.group and not p.group.startswith("time:") and cols.get(p.group, {}).get("role") == "categorical" \
            and p.intent in {"top", "share"}:
        p.exclude_placeholders = True
    if p.intent in {"top", "share", "compare", "avg"} and not p.group:
        p.notes.append("no grouping column found")
    p.confidence = min(1.0, 0.35 + 0.15 * len(link["columns"]) + 0.2 * len(vals) + 0.2 * len(link["table_hits"])
                       - 0.15 * len(link["unmatched"]))
    p.sql = to_sql(p, cols)
    return p

def _groupability(col):
    d = col.get("distinct") or 0
    return 3 if 2 <= d <= 500 else 2 if d <= 20000 else 0

def _col_expr(name):
    if name and name.startswith("time:"):
        return TIME_EXPR[name.split(":")[1]]
    return f'"{name}"'

def _where(p):
    parts, params = [], []
    for col, op, val, _ in p.filters:
        if op == "IN":
            parts.append(f'"{col}" IN ({",".join("?" for _ in val)})')
            params += list(val)
        else:
            parts.append(f'"{col}" = ?')
            params.append(val)
    if p.years:
        if p.intent == "trend" and len(p.years) >= 2:
            parts.append(f"year(_ts) BETWEEN {min(p.years)} AND {max(p.years)}")
        else:
            parts.append(f"year(_ts) IN ({','.join(map(str, p.years))})")
    return (" WHERE " + " AND ".join(parts)) if parts else "", params

def to_sql(p, cols):
    w, _ = _where(p)
    agg = f'SUM("{p.metric}")' if p.metric and p.intent != "avg" else (f'AVG("{p.metric}")' if p.metric else "COUNT(*)")
    t = f'"{p.table}"'
    if p.intent == "list":
        return f"SELECT * FROM {t}{w} LIMIT {p.limit}"
    if p.group and p.intent in {"top", "share", "compare", "trend", "avg"}:
        g = _col_expr(p.group)
        order = "1 ASC" if p.group.startswith("time:") and p.intent == "trend" else f"2 {p.order}"
        nn = f" {'AND' if w else 'WHERE'} {g} IS NOT NULL"
        if p.exclude_placeholders:
            nn += f" AND lower(trim(CAST({g} AS VARCHAR))) NOT IN ({','.join(repr(x) for x in PLACEHOLDERS)})"
        return f"SELECT {g} AS grp, {agg} AS value FROM {t}{w}{nn} GROUP BY 1 ORDER BY {order} LIMIT 50"
    return f"SELECT {agg} AS value FROM {t}{w}"

def run(p):
    _, params = _where(p)
    cols, rows = store.q(p.sql, params)
    return cols, rows

def total(p, with_filters=True):
    w, params = _where(p) if with_filters else ("", [])
    agg = f'SUM("{p.metric}")' if p.metric else "COUNT(*)"
    return store.q(f'SELECT {agg} FROM "{p.table}"{w}', params)[1][0][0] or 0

def recount(p, group_value):
    """Independent re-computation of one group's value (used by the verifier)."""
    w, params = _where(p)
    g = _col_expr(p.group)
    agg = f'SUM("{p.metric}")' if p.metric and p.intent != "avg" else (f'AVG("{p.metric}")' if p.metric else "COUNT(*)")
    cond = f"{g} = ?"
    sql = f'SELECT {agg} FROM "{p.table}"{w} {"AND" if w else "WHERE"} {cond}'
    return store.q(sql, params + [group_value])[1][0][0]

def null_share(p):
    if not p.group:
        return 0.0
    w, params = _where(p)
    g = _col_expr(p.group)
    r = store.q(f'SELECT avg(CASE WHEN {g} IS NULL THEN 1 ELSE 0 END) FROM "{p.table}"{w}', params)[1][0][0]
    return float(r or 0)

def placeholder_rows(p):
    if not p.exclude_placeholders:
        return 0
    w, params = _where(p)
    g = _col_expr(p.group)
    sql = (f'SELECT count(*) FROM "{p.table}"{w} {"AND" if w else "WHERE"} '
           f"lower(trim(CAST({g} AS VARCHAR))) IN ({','.join(repr(x) for x in PLACEHOLDERS)})")
    return store.q(sql, params)[1][0][0]

def top_of(table, col):
    return store.q(f'SELECT "{col}", count(*) FROM "{table}" WHERE "{col}" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1')[1][0]

def ts_range(table):
    try:
        return store.q(f'SELECT min(_ts), max(_ts) FROM "{table}"')[1][0]
    except Exception:
        return None
