#!/usr/bin/env bash
# One-command start (macOS/Linux): Python setup, UI build if needed, everything served on http://localhost:8000
set -e
cd "$(dirname "$0")"
if [ ! -d backend/.venv ]; then
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q --upgrade pip
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi
if [ ! -f frontend/dist/index.html ] && command -v npm >/dev/null; then
  (cd frontend && npm install --no-audit --no-fund && npm run build)
fi
echo "Open http://localhost:8000"
cd backend && exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
