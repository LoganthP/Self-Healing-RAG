"""Schema linking: maps the words of a question to tables, columns and real cell values.
Everything here is derived from the ingested data (column names, profiled values), so it adapts to any CSV."""
import re
from difflib import get_close_matches

from . import store
from .textrag import stem, STOP

# concept word -> words that may appear in column names
SYNONYMS = {
    "city": ["city", "twp", "township", "town", "borough", "municipality"],
    "town": ["city", "twp", "township", "town"],
    "township": ["twp", "township"],
    "borough": ["borough"],
    "place": ["city", "twp", "borough", "county"],
    "area": ["city", "twp", "borough", "county", "zone", "region"],
    "location": ["city", "twp", "borough", "county"],
    "region": ["region", "state", "county"],
    "state": ["state"],
    "county": ["county"],
    "street": ["street", "addr", "road"],
    "road": ["street", "addr", "road"],
    "address": ["addr", "address", "street"],
    "type": ["category", "type", "title"],
    "kind": ["category", "type"],
    "category": ["category", "type"],
    "reason": ["factor", "cause", "detail", "description", "reason"],
    "cause": ["factor", "cause", "detail", "reason"],
    "factor": ["factor"],
    "emergency": ["category", "title"],
    "vehicle": ["vehicle"],
    "car": ["vehicle"],
    "severity": ["severity"],
    "weather": ["weather_condition", "weather"],
    "death": ["killed", "fatal", "death"], "dead": ["killed"], "kill": ["killed"], "fatality": ["killed", "fatal"],
    "died": ["killed"], "die": ["killed"],
    "injury": ["injured", "injury"], "injure": ["injured"], "hurt": ["injured"],
    "pedestrian": ["pedestrians", "pedestrian"], "cyclist": ["cyclists"], "bike": ["cyclists"], "bicycle": ["cyclists"],
    "motorist": ["motorists"], "driver": ["motorists"],
    "temperature": ["temperature"], "visibility": ["visibility"], "distance": ["distance"],
}
# synonyms for cell values (word in question -> phrase that may appear inside a value)
VALUE_SYNONYMS = {"ambulance": ["ems"], "medical": ["ems"], "drunk": ["alcohol"], "alcohol": ["alcohol"],
                  "phone": ["cell phone"], "speeding": ["unsafe speed"], "distracted": ["inattention"],
                  "sleepy": ["fatigued", "drowsy"], "tired": ["fatigued"], "taxi": ["taxi"], "suv": ["sport utility"]}
TIME_UNITS = {"hour": "hour", "hours": "hour", "time of day": "hour", "weekday": "dow", "day of week": "dow",
              "day of the week": "dow", "month": "month", "months": "month", "year": "year", "years": "year",
              "yearly": "year", "monthly": "month", "daily": "date", "date": "date", "day": "date", "days": "date"}
GENERIC = set("""much many number count total overall most mostly highest lowest least fewest more less top which what
data dataset datasets record records row rows file table occur occurred occurs occurring happen happened happens
case cases incident incidents event events report reports reported call calls people person persons times time
mostly common frequent average mean sum share percent percentage proportion breakdown distribution compare compared
show list give tell find get each per every all any had has have get got year years month months hour hours day days
recorded logged value values see documents document between from since during across volume change changed trend
collision collisions crash crashes accident accidents call calls emergency emergencies worst best contributing
caused causes involved involving driving overall common frequent busiest peak there were was happened top five ten
three four two one first last biggest largest lowest smallest""".split())
# words that describe a requested measure; if they can't be grounded the question is unanswerable
MEASURE_HEADS = {"time", "rate", "duration", "speed", "cost", "price", "delay", "length", "age", "income", "salary",
                 "score", "amount", "revenue", "wait", "distance", "temperature"}
QUALIFIER_LEADS = {"by", "with", "involving", "caused", "due", "from", "for", "where", "about", "during", "under"}
GENERIC_VALUES = {"day", "night", "time", "total", "other", "none", "unknown", "unspecified", "yes", "no", "true",
                  "false", "na", "n/a", "null", "city", "state", "most", "all", "data", "type", "call", "calls"}

def _ngrams(words, n_max=4):
    for n in range(n_max, 0, -1):
        for i in range(len(words) - n + 1):
            yield i, n, " ".join(words[i:i + n])

def norm_words(q):
    return re.findall(r"[a-z0-9]+(?:[-'/][a-z0-9]+)*", q.lower())

NOUN_GROUPS = [{"accident", "collision", "crash", "wreck"}, {"call", "dispatch"}, {"order", "purchase", "sale"},
               {"trip", "ride", "journey"}, {"ticket", "complaint", "case"}]

def row_noun(t):
    """What one row of the table is ('calls', 'collisions', ...), guessed from names, columns and values."""
    prof = t["profile"]
    if "columns" not in prof:
        return "passages"
    if prof.get("row_noun"):
        return prof["row_noun"]
    name = (t["table_name"] + " " + t["source_file"]).lower()
    noun = None
    for w in ("accident", "collision", "crash", "order", "sale", "trip", "call", "transaction", "claim", "ticket"):
        if w in name:
            noun = w + "s"
            break
    cols = " ".join(c["name"] for c in prof["columns"])
    if not noun and "vehicle" in cols and ("killed" in cols or "injured" in cols):
        noun = "collisions"
    if not noun and store.cursor().execute("SELECT 1 FROM value_index WHERE table_name=? AND "
                                           "regexp_matches(norm, '\\bcalls?\\b') LIMIT 1", [t["table_name"]]).fetchone():
        noun = "calls"
    prof["row_noun"] = noun or "records"
    return prof["row_noun"]

def _noun_tokens(t):
    toks = set()
    rn = stem(row_noun(t))
    toks.add(rn)
    for g in NOUN_GROUPS:
        if rn in g:
            toks |= g
    for a in t["profile"].get("aliases", []):
        toks |= {stem(x) for x in re.findall(r"[a-z0-9]+", a.lower())}
    return toks - {"record"}

def link(question, tables):
    """tables: catalog entries (kind == 'table'). Returns a ranked list of per-table link results."""
    words = norm_words(question)
    stems = [stem(w) for w in words]
    results = []
    for t in tables:
        prof = t["profile"]
        name_tokens = set(stem(x) for x in re.split(r"[_\W]+", t["table_name"] + " " + t["source_file"].lower()) if x)
        name_tokens |= _noun_tokens(t)
        res = dict(table=t["table_name"], source=t["source_file"], rows=t["row_count"], profile=prof,
                   columns=[], values=[], table_hits=[], score=0.0, used=set())
        # table name / file name hits ("911 calls", "accidents")
        for i, s in enumerate(stems):
            if s in name_tokens and s not in {"csv", "data", "database", "t"} and s not in STOP:
                res["table_hits"].append(words[i])
                res["used"].add(i)
                res["score"] += 2.5
        # column hits (each question word scores once, so vehicle_1..5_type don't inflate the score)
        best_for_word = {}
        for col in prof["columns"]:
            if col["role"] in {"identifier", "other"} and col["name"] not in {"zip", "zip_code", "zipcode"}:
                continue
            ctoks = set(stem(x) for x in re.split(r"[_\W]+", col["name"] + " " + col["label"].lower()) if x)
            for i, s in enumerate(stems):
                if words[i] in STOP or len(words[i]) < 3:
                    continue
                direct = s in ctoks and words[i] not in GENERIC
                syn = any(any(stem(k) in ctoks or k in col["name"] for k in SYNONYMS.get(x, []))
                          for x in {words[i], s, s + "e"})
                if direct or syn:
                    res["columns"].append(dict(col=col["name"], role=col["role"], pos=i, word=words[i],
                                               how="name" if direct else "synonym"))
                    res["used"].add(i)
                    weak = s in WEAK_COLUMN_WORDS
                    best_for_word[i] = max(best_for_word.get(i, 0), 1.0 if (weak or not direct) else 1.5)
        res["score"] += sum(best_for_word.values())
        results.append(res)
    _link_values(words, results)
    _row_noun_values(words, results)
    for r in results:
        r["unmatched"] = [w for i, w in enumerate(words) if i not in r["used"] and w not in STOP
                          and w not in GENERIC and stem(w) not in GENERIC and not w.isdigit()
                          and w not in TIME_UNITS and len(w) > 2]
        r["score"] -= 0.4 * len(r["unmatched"])
    results.sort(key=lambda r: -r["score"])
    return results

def _link_values(words, results):
    by_table = {r["table"]: r for r in results}
    if not by_table:
        return
    c = store.cursor()
    taken = set()
    for i, n, gram in _ngrams(words):
        if any(j in taken for j in range(i, i + n)):
            continue
        if gram in GENERIC_VALUES or gram in STOP or (n == 1 and (len(gram) < 3 or gram.isdigit())):
            continue
        hits = c.execute("SELECT table_name, column_name, value, freq FROM value_index WHERE norm = ? "
                         "OR norm = ? ORDER BY freq DESC", [gram, gram.rstrip("s")]).fetchall()
        seen, kept = set(), []
        for h in hits:
            if h[0] in by_table and h[0] not in seen:
                seen.add(h[0])
                kept.append(h)
        if not kept:
            continue
        for tname, col, val, freq in kept:
            r = by_table[tname]
            r["values"].append(dict(col=col, value=val, freq=freq, pos=i, n=n, word=gram, how="exact"))
            r["used"].update(range(i, i + n))
            r["score"] += 3.0
        taken.update(range(i, i + n))

ROW_NOUNS = {"accident": "accident", "accidents": "accident", "collision": "collision", "collisions": "collision",
             "crash": "crash", "crashes": "crash", "fire": "fire", "fires": "fire"}

WEAK_COLUMN_WORDS = {"type", "name", "date", "time", "number", "code", "status", "category", "kind", "id", "value"}
AFFINITY_NOUNS = {"call", "calls", "incident", "incidents", "trip", "trips", "order", "orders", "complaint",
                  "complaints", "ticket", "tickets", "claim", "claims", "booking", "bookings"}

def _row_noun_values(words, results):
    """'accidents' in a 911-calls table means the VEHICLE ACCIDENT call type; in an accidents table it means every row."""
    c = store.cursor()
    for i, w in enumerate(words):
        if w in AFFINITY_NOUNS:      # "calls" -> the table whose values talk about calls (no filter applied)
            probe = w.rstrip("s")
            for r in results:
                if c.execute("SELECT 1 FROM value_index WHERE table_name=? AND regexp_matches(norm, ?) LIMIT 1",
                             [r["table"], rf"\b{probe}s?\b"]).fetchone():
                    r["score"] += 1.0
            continue
        if w not in ROW_NOUNS:
            continue
        for r in results:
            if i in r["used"] or any(ROW_NOUNS[w] in x for x in [r["table"], r["source"].lower()]):
                continue
            hit = c.execute("SELECT column_name, value, freq FROM value_index WHERE table_name=? AND norm LIKE ? "
                            "ORDER BY freq DESC LIMIT 1", [r["table"], f"%{ROW_NOUNS[w]}%"]).fetchone()
            if hit and hit[2] >= 0.05 * max(r["rows"], 1):
                r["values"].append(dict(col=hit[0], value=hit[1], freq=hit[2], pos=i, n=1, word=w, how="contains"))
                r["used"].add(i)
                r["score"] += 0.5
                r.setdefault("notes", []).append(f"read '{w}' as {hit[0]} = '{hit[1]}'")

def classify_unmatched(question, words_unmatched):
    """Split unmatched words into 'blocking' (a measure or qualifier we cannot ground) and 'soft' (wording)."""
    ws = norm_words(question)
    blocking, soft = [], []
    for w in words_unmatched:
        i = ws.index(w) if w in ws else -1
        prev = ws[i - 1] if i > 0 else ""
        nxt = ws[i + 1] if 0 <= i < len(ws) - 1 else ""
        if nxt in MEASURE_HEADS or w in MEASURE_HEADS or prev in {"average", "mean", "median", "total", "sum", "of"} \
                or prev in QUALIFIER_LEADS or (prev in {"in", "on", "at"} and w[:1].isalpha()):
            blocking.append(f"{w} {nxt}" if nxt in MEASURE_HEADS and nxt != w else w)
        else:
            soft.append(w)
    return blocking, soft

def fuzzy_values(word, table):
    """Healing helper: values that *contain* a word or its synonym (e.g. 'drunk' -> 'ALCOHOL INVOLVEMENT')."""
    c = store.cursor()
    out = []
    for probe in [word] + VALUE_SYNONYMS.get(word, []) + VALUE_SYNONYMS.get(stem(word), []):
        rows = c.execute("SELECT column_name, value, freq FROM value_index WHERE table_name=? AND norm LIKE ? "
                         "ORDER BY freq DESC LIMIT 5", [table, f"%{probe}%"]).fetchall()
        out += [dict(col=r[0], value=r[1], freq=r[2], word=word, how=f"contains '{probe}'") for r in rows]
        if out:
            break
    return out

def fuzzy_columns(word, profile):
    names = {col["name"]: col for col in profile["columns"]}
    pool = list(names) + [col["label"].lower() for col in profile["columns"]]
    m = get_close_matches(word, pool, n=1, cutoff=0.75)
    if not m:
        return None
    return next((c for c in profile["columns"] if c["name"] == m[0] or c["label"].lower() == m[0]), None)
