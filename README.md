# Self-Healing RAG

Ask questions about your spreadsheets and documents. Every answer is checked against the data before you see it. When a check fails, the system repairs the answer or declines.

- **Frontend:** your React UI (Vite, Tailwind, React Flow, Recharts). It is unchanged apart from the small edits listed below.
- **Backend:** FastAPI with DuckDB for tables, BM25 (plus MiniLM if installed) for text, and SQLite for chats, traces and evaluations.

## Start

You need Python 3.10 or newer. Node 18.18 or newer is only needed if you edit the UI; a built copy is included.

- **Windows:** double-click `start.bat`.
- **macOS/Linux:** run `./start.sh`.

Then open http://localhost:8000. The first run sets up `backend/.venv`, which takes about a minute.

### Development (hot reload)

Terminal 1, backend:
```
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Terminal 2, frontend:
```
cd frontend
npm install
npm run dev                      # http://127.0.0.1:5173; /api is proxied to :8000
```

### Optional extras

- **Semantic search for prose:** `pip install -r requirements-embeddings.txt` adds all-MiniLM-L6-v2. Tables never need it.
- **A language model for prose answers:** copy `backend/.env.example` to `backend/.env`, then add a Groq or OpenAI key or set up Ollama. Choose the provider on the Settings page. Table answers are always computed with SQL.

## What was wrong, and what changed

| Problem | Cause | Fix |
|---|---|---|
| Uploading the zips took over an hour | Every CSV row was embedded one by one | Tables are bulk-loaded into DuckDB in one parallel pass. Both of your zips (1.14M rows) are ready in about 11 s. A 615 MB, 3.3M-row CSV takes 13 s on one CPU core. |
| "Which township had the most calls?" was always withheld | Top-8 passage retrieval can't count 663,522 rows | Counting and ranking questions run as SQL over every row. The critic recounts the numbers independently. |
| Healing retried the same search 3 times | Rewrites appended template words ("…how it works mechanism") | Each repair targets the reason the critic failed the draft: see the table below. |
| "Try a question" and the evaluation set were about a security handbook | The question lists were hard-coded | Questions are generated from your indexed documents, with expected answers computed from the data. |

Cleaning still runs during ingestion: empty rows, exact duplicate rows (on tables up to 3M rows), empty columns, and repeated paragraphs are removed. The Documents page reports what was removed.

How each critic failure is repaired:

| Critic finds | Repair (graph node) |
|---|---|
| A number doesn't match the recount | Rewrite the answer from the recomputed numbers (Verify → Write answer) |
| A sentence isn't in its source | Drop that sentence and rewrite from the same evidence (Verify → Write answer) |
| A term maps to no column ("drunk") | Map it to a real value such as `ALCOHOL INVOLVEMENT`, and add a note (Rewrite search) |
| A filter matches no rows | Relax the narrowest filter, and add a note (Rewrite search) |
| Part of a prose question isn't covered | Reformulate the search with the documents' own vocabulary (Rewrite search) |
| The dates asked about are outside the data, or the measure doesn't exist | Withhold, showing the real date range and the available columns |

## Frontend edits (all small)

- `src/lib/api.ts`: added `api.suggestions()`.
- `src/pages/Chat.tsx`: "Try a question" now uses generated suggestions; the old handbook list is kept as a fallback.
- `src/lib/format.ts`: added labels for two new healing reasons.
- `src/pages/KnowledgeBase.tsx` and `src/pages/Evaluation.tsx`: wording only, to match how the system now works.

## Measured (sandbox, 1 vCPU)

| What | Result |
|---|---|
| Upload and index both of your zips, plus the handbook | About 11 s |
| Answer time | 30–400 ms |
| Evaluation on 23 questions generated from your data (self-healing) | 100% keyword recall, 0% unsupported answers, 100% correct refusals |
| Same evaluation, baseline RAG | 50% keyword recall, 61% unsupported answers, 0% correct refusals |

## Layout

```
backend/app/main.py            API (/api/v1, matches frontend/src/lib/api.ts); also serves frontend/dist
backend/app/ingest.py          single-pass table load, cleaning, profiling, value index; text chunking
backend/app/jobs.py            background indexing queue with live stage and progress
backend/app/healer.py          the self-healing loop (nodes match the UI graph)
backend/app/linker.py          question words → tables, columns, real values
backend/app/tabular.py         SQL planning: top, top-N, share, count, sum, average, trend, compare
backend/app/verifier.py        independent recounts, date-range, premise and grounding checks
backend/app/textrag.py         BM25 + optional MiniLM, reciprocal rank fusion
backend/app/questions.py       suggestions and evaluation questions with ground truth
backend/app/settings_store.py  providers (Offline, Ollama, Groq, OpenAI) and runtime settings
backend/app/meta.py            SQLite: documents, sessions, executions, evaluations
frontend/                      your UI
```

Tests: `cd backend && python -m pytest -q tests`

## Limits

- Questions that need joins across files, nested conditions ("A and not B"), or ratios between two columns are declined rather than guessed.
- With no language model configured, prose answers quote the documents exactly.
