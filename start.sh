#!/usr/bin/env bash
# AquaTrace — one-command launcher (macOS / Linux)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
PY="$VENV/bin/python"

echo "AquaTrace launcher"
echo "Workspace: $ROOT"

if [ ! -x "$PY" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$VENV"
fi

echo "Installing backend dependencies..."
"$PY" -m pip install --quiet --upgrade pip
"$PY" -m pip install --quiet -r "$BACKEND/requirements.txt"

if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "Installing frontend dependencies..."
  (cd "$FRONTEND" && npm install --no-audit --no-fund)
fi

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting backend on http://localhost:8000 ..."
(cd "$BACKEND" && "$PY" -m uvicorn app.main:app --host 0.0.0.0 --port 8000) &
API_PID=$!

echo "Starting frontend on http://localhost:5173 ..."
(cd "$FRONTEND" && npm run dev -- --host) &
WEB_PID=$!

echo ""
echo "AquaTrace is starting:"
echo "  Dashboard : http://localhost:5173"
echo "  API docs  : http://localhost:8000/docs"
echo ""
wait
