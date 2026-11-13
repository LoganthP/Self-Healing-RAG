"""Fast ingestion.

Tables (CSV/TSV/XLSX/JSON records/Parquet) are bulk-loaded into DuckDB in ONE parallel pass, cleaned
(empty rows, exact duplicates, empty columns), profiled in one scan and value-indexed. They are NOT embedded
row by row: that is what made a multi-GB CSV take over an hour, and chunk retrieval can't answer
"which X had the most Y" anyway, because that answer is spread over millions of rows.

Prose (PDF/DOCX/TXT/MD/HTML/JSON) is split on headings and paragraphs, de-duplicated, and embedded in batches
(MiniLM when sentence-transformers is installed, BM25 always)."""
import csv
import json
import re
import threading
import time
import zipfile
from pathlib import Path
from typing import Callable

from . import store, textrag
from .config import DEDUPE_MAX_ROWS, ROW_CARDS_PER_TABLE, VALUE_INDEX_PER_COLUMN

TABLE_EXT = {".csv", ".tsv", ".xlsx", ".xls", ".parquet", ".jsonl", ".ndjson"}
TEXT_EXT = {".pdf", ".txt", ".md", ".markdown", ".docx", ".html", ".htm", ".json"}
SUPPORTED = TABLE_EXT | TEXT_EXT

Progress = Callable[[str, float], None]


class IngestError(Exception):
    pass


def ingest_file(path: Path, source_name: str, progress: Progress = lambda s, f: None) -> dict:
    """Index one file under `source_name` (unique display name). Returns stats for the Documents page."""
    ext = path.suffix.lower()
    store.drop_source(source_name)
    textrag.INDEX.dirty = True
    if ext in {".csv", ".tsv"} or (ext == ".txt" and _looks_tabular(path)):
        return _ingest_table(path, source_name, progress)
    if ext in {".xlsx", ".xls"}:
        return _ingest_excel(path, source_name, progress)
    if ext in {".parquet", ".jsonl", ".ndjson"}:
        return _ingest_table(path, source_name, progress)
    if ext == ".json" and _json_is_records(path):
        return _ingest_table(path, source_name, progress)
    if ext in TEXT_EXT:
        return _ingest_text(path, source_name, progress)
    raise IngestError(f"Unsupported file type: {ext or 'no extension'}")


def _looks_tabular(path):
    with open(path, "r", errors="ignore") as fh:
        head = [fh.readline() for _ in range(5)]
    seps = [l.count(",") for l in head if l.strip()]
    return len(seps) >= 3 and min(seps) >= 2 and len(set(seps)) == 1


def _json_is_records(path):
    with open(path, "r", errors="ignore") as fh:
        return fh.read(4096).lstrip()[:1] == "["

# =============================================================== tables


def _safe_name(stem, existing):
    base = re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_") or "table"
    if base[0].isdigit():
        base = "t_" + base
    base = base[:48]
    name, i = base, 2
    while name in existing:
        name, i = f"{base}_{i}", i + 1
    return name


def _existing_tables():
    return {r[0] for r in store.cursor().execute("SELECT table_name FROM information_schema.tables").fetchall()}


def _original_headers(path):
    if path.suffix.lower() not in {".csv", ".tsv", ".txt"}:
        return None
    with open(path, "r", errors="ignore", newline="") as fh:
        line = fh.readline()
    delim = "\t" if path.suffix.lower() == ".tsv" else ","
    try:
        return next(csv.reader([line], delimiter=delim))
    except Exception:
        return None


def _ingest_excel(path, source_name, progress):
    import pandas as pd
    progress("Reading workbook", 0.05)
    sheets = pd.read_excel(path, sheet_name=None)
    sheets = {k: v for k, v in sheets.items() if not v.dropna(how="all").empty}
    if not sheets:
        raise IngestError("The workbook has no non-empty sheets.")
    infos = []
    for i, (sheet, df) in enumerate(sheets.items()):
        df.columns = [str(c) for c in df.columns]
        tmp = path.with_name(f"{path.stem}__{re.sub(r'[^A-Za-z0-9]+', '_', sheet)}.parquet")
        df.to_parquet(tmp)
        name = source_name if len(sheets) == 1 else f"{source_name} [{sheet}]"
        frac = lambda s, f, i=i: progress(f"{sheet}: {s}", (i + f) / len(sheets))
        infos.append(_ingest_table(tmp, name, frac, labels=list(df.columns), catalog_source=source_name))
        tmp.unlink(missing_ok=True)
    return dict(kind="table", tables=[t for i in infos for t in i["tables"]], rows=sum(i["rows"] for i in infos),
                chunks=sum(i["chunks"] for i in infos), pages=len(infos),
                cleaning=_merge_cleaning([i["cleaning"] for i in infos]))


def _merge_cleaning(cs):
    out = {}
    for c in cs:
        for k, v in c.items():
            out[k] = out.get(k, 0) + v if isinstance(v, (int, float)) else v
    return out


def _reader(path, sample=False):
    p = str(path).replace("'", "''")
    ext = path.suffix.lower()
    if ext == ".parquet":
        return f"read_parquet('{p}')"
    if ext in {".json", ".jsonl", ".ndjson"}:
        return f"read_json_auto('{p}')"
    return (f"read_csv('{p}', header=true, auto_detect=true, sample_size={20000 if sample else 100000}, "
            f"normalize_names=true, ignore_errors=true)")


def _run_with_progress(c, sql, progress, label, lo, hi):
    """Runs a long statement while a watcher thread reports DuckDB's own query progress."""
    done = threading.Event()

    def watch():
        while not done.wait(0.7):
            try:
                pct = c.query_progress()
                if pct is not None and pct >= 0:
                    progress(label, lo + (hi - lo) * min(pct, 100) / 100)
            except Exception:
                return
    threading.Thread(target=watch, daemon=True).start()
    try:
        c.execute(sql)
    finally:
        done.set()


def _ingest_table(path, source_name, progress, labels=None, catalog_source=None):
    c = store.cursor()
    tname = _safe_name(Path(source_name).stem, _existing_tables())
    ext = path.suffix.lower()
    if ext not in {".parquet", ".json", ".jsonl", ".ndjson"}:
        labels = labels or _original_headers(path)

    # 1) look at a sample first, so derived columns can be added in the single full load
    progress("Reading a sample", 0.03)
    smp = f"{tname}__sample"
    try:
        c.execute(f'CREATE OR REPLACE TEMP TABLE "{smp}" AS SELECT * FROM {_reader(path, True)} LIMIT 20000')
        reader = _reader(path)
    except Exception:
        # ragged rows / quoted newlines: tolerant (single-threaded) reader
        reader = _reader(path)[:-1] + ", null_padding=true, parallel=false, strict_mode=false)"
        c.execute(f'CREATE OR REPLACE TEMP TABLE "{smp}" AS SELECT * FROM {reader} LIMIT 20000')
    cols = c.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='{smp}' "
                     f"ORDER BY ordinal_position").fetchall()
    if not cols:
        raise IngestError("No columns were found in this file.")
    extra_sql, derived = _derived_columns(c, smp, cols)
    c.execute(f'DROP TABLE IF EXISTS "{smp}"')

    # 2) one parallel pass: file -> table (with derived date/category columns)
    progress("Loading rows", 0.08)
    try:
        _run_with_progress(c, f'CREATE OR REPLACE TABLE "{tname}" AS SELECT *{extra_sql} FROM {reader}',
                           progress, "Loading rows", 0.08, 0.6)
    except Exception:
        reader = _reader(path)[:-1] + ", null_padding=true, parallel=false, strict_mode=false)"
        _run_with_progress(c, f'CREATE OR REPLACE TABLE "{tname}" AS SELECT *{extra_sql} FROM {reader}',
                           progress, "Loading rows (tolerant mode)", 0.08, 0.6)
    rows_in = c.execute(f'SELECT count(*) FROM "{tname}"').fetchone()[0]
    if rows_in == 0:
        c.execute(f'DROP TABLE "{tname}"')
        raise IngestError("The file has a header but no rows.")

    # 3) cleaning
    progress("Cleaning", 0.62)
    cleaning = dict(rows_in=rows_in)
    base_cols = [n for n, _ in cols]
    all_null = " AND ".join(f'"{n}" IS NULL' for n in base_cols)
    cleaning["empty_rows_dropped"] = c.execute(f'DELETE FROM "{tname}" WHERE {all_null}').fetchone()[0]
    rows = rows_in - cleaning["empty_rows_dropped"]
    if rows <= DEDUPE_MAX_ROWS:
        c.execute(f'CREATE OR REPLACE TABLE "{tname}__d" AS SELECT DISTINCT * FROM "{tname}"')
        kept = c.execute(f'SELECT count(*) FROM "{tname}__d"').fetchone()[0]
        if kept < rows:
            c.execute(f'DROP TABLE "{tname}"')
            c.execute(f'ALTER TABLE "{tname}__d" RENAME TO "{tname}"')
        else:
            c.execute(f'DROP TABLE "{tname}__d"')
        cleaning["duplicate_rows_dropped"] = rows - kept
        rows = kept
    else:
        cleaning["duplicate_check_skipped"] = 1
    cleaning["rows_kept"] = rows

    # 4) profile in one scan; drop columns that are entirely empty
    progress("Profiling columns", 0.7)
    profile = _profile(c, tname, labels, derived)
    empty = [col["name"] for col in profile["columns"] if col.get("all_null")]
    for n in empty:
        c.execute(f'ALTER TABLE "{tname}" DROP COLUMN "{n}"')
    profile["columns"] = [col for col in profile["columns"] if not col.get("all_null")]
    cleaning["empty_columns_dropped"] = len(empty)
    nulls = sum(int(col["null_frac"] * rows) for col in profile["columns"] if col["name"] in base_cols)
    cleaning["null_cells_dropped"] = nulls

    # 5) value index (lets questions mention real values: "Brooklyn", "EMS", "Lower Merion")
    progress("Indexing values", 0.8)
    for col in profile["columns"]:
        if col["role"] == "categorical" and col["type"] == "VARCHAR":
            c.execute(f"""INSERT INTO value_index
                SELECT '{tname}', '{col["name"]}', v, lower(trim(v)), n FROM (
                  SELECT CAST("{col["name"]}" AS VARCHAR) v, count(*) n FROM "{tname}"
                  WHERE "{col["name"]}" IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT {VALUE_INDEX_PER_COLUMN})""")
            col["top"] = [list(r) for r in c.execute(
                "SELECT value, freq FROM value_index WHERE table_name=? AND column_name=? ORDER BY freq DESC LIMIT 8",
                [tname, col["name"]]).fetchall()]
    c.execute("INSERT INTO catalog(table_name, source_file, kind, row_count, profile) VALUES (?,?,?,?,?)",
              [tname, catalog_source or source_name, "table", rows, json.dumps(profile, default=str)])

    # 6) a profile passage + sampled rows as searchable text (for previews, row lookups and the baseline)
    progress("Preparing searchable rows", 0.9)
    n_cards = _row_cards(c, tname, catalog_source or source_name, profile)
    textrag.add_chunks([(f"{tname}#profile", catalog_source or source_name, "profile", "Column profile",
                         profile_text(profile, rows, catalog_source or source_name))], embed=False)
    cleaning["rows_embedded"] = n_cards
    progress("Done", 1.0)
    return dict(kind="table", tables=[tname], rows=rows, chunks=n_cards + 1, pages=1, cleaning=cleaning)


DATE_FORMATS = ["%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%m/%d/%Y %H:%M", "%m/%d/%Y %H:%M:%S",
                "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y %H:%M"]


def _derived_columns(c, smp, cols):
    """_ts = best timestamp of each row; <col>_category/_detail for 'EMS: BACK PAINS' style columns."""
    extra, derived = [], {}
    names = {n: t for n, t in cols}
    best = None
    for n, t in cols:
        if t.startswith("TIMESTAMP") or t == "DATE":
            score = 1.0 if any(k in n for k in ("start", "time", "date", "created", "reported")) else 0.9
            if not best or score > best[0]:
                best = (score, f'CAST("{n}" AS TIMESTAMP)', n)
        elif t == "VARCHAR" and any(k in n for k in ("date", "time", "day", "created", "reported", "timestamp")):
            for fmt in DATE_FORMATS:
                ok = c.execute(f"SELECT avg(CASE WHEN try_strptime(trim(\"{n}\"), '{fmt}') IS NOT NULL THEN 1 ELSE 0 END) "
                               f"FROM \"{smp}\" WHERE \"{n}\" IS NOT NULL").fetchone()[0] or 0
                if ok > 0.95:
                    if not best or 0.8 > best[0]:
                        best = (0.8, f"try_strptime(trim(\"{n}\"), '{fmt}')", n)
                    break
    if best:
        expr, base = best[1], best[2]
        time_col = next((n for n, t in cols if n != base and re.fullmatch(r"(crash_)?time", n)), None)
        combined = False
        if time_col and "%H" not in expr and "TIMESTAMP" not in names.get(base, ""):
            tt = names[time_col]
            texpr = (f'CAST("{time_col}" AS TIME)' if tt == "TIME"
                     else f"try_strptime(trim(\"{time_col}\"), '%H:%M')::TIME")
            expr = f"COALESCE(CAST({expr} AS DATE) + {texpr}, CAST({expr} AS TIMESTAMP))"
            combined = True
        extra.append(f"CAST({expr} AS TIMESTAMP) AS _ts")
        derived["_ts"] = f"timestamp from {base}" + (f" + {time_col}" if combined else "")
    for n, t in cols:
        if t != "VARCHAR":
            continue
        r = c.execute(f"""SELECT avg(CASE WHEN "{n}" LIKE '%: %' THEN 1 ELSE 0 END),
                                 approx_count_distinct(split_part("{n}", ':', 1))
                          FROM "{smp}" WHERE "{n}" IS NOT NULL""").fetchone()
        if r[0] and r[0] > 0.9 and r[1] <= 40:
            extra.append(f"trim(split_part(\"{n}\", ':', 1)) AS \"{n}_category\"")
            extra.append(f"rtrim(trim(substr(\"{n}\", strpos(\"{n}\", ':') + 1)), ' -') AS \"{n}_detail\"")
            derived[f"{n}_category"] = f"part of {n} before ':'"
            derived[f"{n}_detail"] = f"part of {n} after ':'"
    return ("," + ",".join(extra)) if extra else "", derived


GEO_NAMES = {"lat", "lng", "lon", "long", "latitude", "longitude", "start_lat", "start_lng", "end_lat", "end_lng"}
NUMERIC = {"BIGINT", "INTEGER", "DOUBLE", "FLOAT", "SMALLINT", "TINYINT", "HUGEINT", "UBIGINT", "UINTEGER", "REAL",
           "USMALLINT", "UTINYINT"}


def _profile(c, t, labels, derived):
    """One full-table scan for every column statistic."""
    cols = c.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='{t}' "
                     f"ORDER BY ordinal_position").fetchall()
    exprs = ["count(*)"]
    for name, typ in cols:
        q = f'"{name}"'
        exprs += [f"approx_count_distinct({q})", f"count({q})"]
        if typ in NUMERIC or typ.startswith("DECIMAL"):
            exprs += [f"min({q})", f"max({q})", f"sum({q})"]
        elif typ.startswith("TIMESTAMP") or typ == "DATE":
            exprs += [f"CAST(min({q}) AS VARCHAR)", f"CAST(max({q}) AS VARCHAR)"]
        elif typ == "VARCHAR":
            exprs += [f"avg(length({q}))"]
    stats = list(c.execute(f'SELECT {",".join(exprs)} FROM "{t}"').fetchone())
    n, k, out = stats[0], 1, []
    for i, (name, typ) in enumerate(cols):
        distinct, nonnull = stats[k], stats[k + 1]
        k += 2
        label = labels[i] if labels and i < len(labels) and name not in derived else name.replace("_", " ").strip()
        col = dict(name=name, label=label, type=typ, distinct=distinct, null_frac=round(1 - nonnull / n, 3) if n else 0)
        if nonnull == 0:
            col["all_null"] = True
        if name in derived:
            col["derived"] = derived[name]
        numeric = typ in NUMERIC or typ.startswith("DECIMAL")
        mn = mx = sm = None
        avg_len = 0
        if numeric:
            mn, mx, sm = stats[k:k + 3]
            k += 3
        elif typ.startswith("TIMESTAMP") or typ == "DATE":
            mn, mx = stats[k:k + 2]
            k += 2
        elif typ == "VARCHAR":
            avg_len = stats[k] or 0
            k += 1
        if name == "_ts" or typ.startswith("TIMESTAMP") or typ == "DATE":
            col.update(role="datetime", min=mn, max=mx)
        elif name in GEO_NAMES or "zip" in name or name in {"id", "unique_key"} or name.endswith("_id"):
            col["role"] = "identifier"
        elif numeric:
            col.update(role="numeric", min=mn, max=mx, sum=sm)
            if distinct <= 50:
                col["small_range"] = True
        elif typ == "BOOLEAN":
            col["role"] = "flag"
        elif typ == "VARCHAR" and avg_len <= 45 and (distinct <= 50 or distinct / max(n, 1) < 0.2):
            col["role"] = "categorical"
        elif typ == "VARCHAR":
            col["role"] = "text"
        else:
            col["role"] = "categorical" if distinct <= 50 else "other"
        if (col["role"] == "flag" or (col["role"] == "categorical" and typ != "VARCHAR")) and nonnull:
            col["top"] = [[str(v), cnt] for v, cnt in c.execute(
                f'SELECT "{name}", count(*) k FROM "{t}" WHERE "{name}" IS NOT NULL GROUP BY 1 ORDER BY k DESC LIMIT 8').fetchall()]
        out.append(col)
    return dict(table=t, row_count=n, columns=out, derived=derived)


def profile_text(profile, rows, source):
    lines = [f"{source}: {rows:,} rows, {len(profile['columns'])} columns."]
    for col in profile["columns"]:
        if col["name"] == "_ts":
            lines.append(f"- Dates covered: {str(col.get('min'))[:10]} to {str(col.get('max'))[:10]}")
            continue
        bit = f"- {col['label']} ({col['role']}, {col['distinct']:,} distinct"
        if col.get("null_frac"):
            bit += f", {col['null_frac']:.0%} empty"
        bit += ")"
        if col.get("top"):
            bit += ": " + ", ".join(f"{v} ({n:,})" for v, n in col["top"][:5])
        elif col["role"] == "numeric" and col.get("min") is not None:
            bit += f": {col['min']} to {col['max']}"
        lines.append(bit)
    return "\n".join(lines)


def _row_cards(c, t, src, profile):
    keep = [col["name"] for col in profile["columns"] if col["role"] != "identifier" and col["name"] != "_ts"][:25]
    if not keep:
        return 0
    sel = ",".join(f'"{k}"' for k in keep)
    rows = c.execute(f'SELECT rowid, {sel} FROM "{t}" USING SAMPLE {ROW_CARDS_PER_TABLE} ROWS').fetchall()
    labels = {col["name"]: col["label"] for col in profile["columns"]}
    recs = []
    for r in rows:
        parts = [f"{labels[k]}: {v}" for k, v in zip(keep, r[1:]) if v not in (None, "", False)]
        recs.append((f"{t}#{r[0]}", src, "row", f"row {r[0]}", "; ".join(parts)))
    textrag.add_chunks(recs, embed=False)
    return len(recs)

# =============================================================== prose


def _read_text(path):
    ext = path.suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader
        return [(i + 1, p.extract_text() or "") for i, p in enumerate(PdfReader(str(path)).pages)]
    if ext == ".docx":
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml").decode("utf8", "ignore")
        xml = re.sub(r"</w:p>", "\n\n", xml)
        xml = re.sub(r"<w:tab/>", "\t", xml)
        return [(None, re.sub(r"<[^>]+>", "", xml))]
    if ext in {".html", ".htm"}:
        import html as _html
        raw = path.read_text(errors="ignore")
        raw = re.sub(r"(?is)<(script|style|nav|footer).*?</\1>", " ", raw)
        raw = re.sub(r"(?i)</(p|div|h[1-6]|li|tr|br)>", "\n\n", raw)
        return [(None, _html.unescape(re.sub(r"<[^>]+>", " ", raw)))]
    if ext == ".json":
        return [(None, json.dumps(json.loads(path.read_text(errors="ignore")), indent=1))]
    return [(None, path.read_text(errors="ignore"))]


def _ingest_text(path, source_name, progress):
    progress("Reading text", 0.05)
    pages = _read_text(path)
    if not any(t.strip() for _, t in pages):
        raise IngestError("No text could be extracted. If this is a scanned PDF, run OCR on it first.")
    progress("Splitting into passages", 0.25)
    seen, recs, dup = set(), [], 0
    for page, text in pages:
        for j, (heading, chunk) in enumerate(textrag.chunk_text(text)):
            key = re.sub(r"\s+", " ", chunk.strip().lower())
            if key in seen:
                dup += 1
                continue
            seen.add(key)
            loc = json.dumps(dict(page=page, section=heading))
            recs.append((f"{source_name}#{page or 0}#{j}", source_name, "text", loc, chunk))
    progress(f"Embedding {len(recs)} passages", 0.45)
    textrag.add_chunks(recs, embed=True)
    store.cursor().execute("INSERT INTO catalog(table_name, source_file, kind, row_count, profile) VALUES (?,?,?,?,?)",
                           [f"doc:{source_name}", source_name, "text", len(recs),
                            json.dumps(dict(chunks=len(recs), headings=textrag.headings(pages)))])
    progress("Done", 1.0)
    return dict(kind="text", tables=[], rows=0, chunks=len(recs), pages=len(pages) if pages[0][0] else 1,
                cleaning=dict(duplicate_paragraphs_dropped=dup))
