#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Start local Postgres when available (Cloud Agent VM). Docker Compose path is used on EC2 separately.
if command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo pg_ctlcluster 16 main start || true
  sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" >/dev/null 2>&1 || true
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='stockkeeper'" | grep -q 1 \
    || sudo -u postgres createdb -O postgres stockkeeper
  export DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://postgres:postgres@localhost:5432/stockkeeper}"
  if [[ -x backend/.venv/bin/python ]]; then
    (cd backend && .venv/bin/python init_db.py) || true
  fi
fi

start_tmux() {
  local name="$1"; shift
  tmux has-session -t "$name" 2>/dev/null && return 0
  tmux new-session -d -s "$name" "$*"
}

if [[ -x backend/.venv/bin/uvicorn ]]; then
  start_tmux backend "cd '$ROOT/backend' && .venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000 2>&1 | tee /tmp/backend.log"
fi
if [[ -d frontend/node_modules ]]; then
  start_tmux frontend "cd '$ROOT/frontend' && npm run dev -- --host 0.0.0.0 --port 5179 2>&1 | tee /tmp/frontend.log"
fi
