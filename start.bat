@echo off
REM One-command start (Windows): Python setup, UI build if needed, everything served on http://localhost:8000
cd /d "%~dp0"
if not exist backend\.venv (
  python -m venv backend\.venv
  backend\.venv\Scripts\python -m pip install -q --upgrade pip
  backend\.venv\Scripts\pip install -q -r backend\requirements.txt
)
if not exist frontend\dist\index.html (
  where npm >nul 2>nul && (cd frontend && call npm install --no-audit --no-fund && call npm run build && cd ..)
)
echo Open http://localhost:8000
cd backend
.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000
