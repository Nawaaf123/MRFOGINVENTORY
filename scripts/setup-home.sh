#!/usr/bin/env bash
# One-time (and safe to re-run) setup for developing Stock Keeper on a new computer.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required tool: $1"
    echo "Install it, then re-run: ./scripts/setup-home.sh"
    exit 1
  fi
}

echo "==> Checking prerequisites"
need git
need python3
need node
need npm

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is recommended so Postgres and full-stack runs are easy."
  echo "Install Docker Desktop, then re-run this script."
  echo "Continuing with Python/Node dependency install only..."
  HAVE_DOCKER=0
else
  HAVE_DOCKER=1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "==> Created .env from .env.example (edit SECRET_KEY before production deploy)"
fi

echo "==> Backend virtualenv + packages"
cd "$ROOT/backend"
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip >/dev/null
pip install -r requirements.txt

echo "==> Frontend packages"
cd "$ROOT/frontend"
npm install --legacy-peer-deps

cd "$ROOT"
if [[ "$HAVE_DOCKER" -eq 1 ]]; then
  echo "==> Starting Postgres (Docker)"
  docker compose up -d db
  echo "Waiting for Postgres..."
  for _ in $(seq 1 30); do
    if docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  echo "==> Initializing database"
  cd "$ROOT/backend"
  # shellcheck disable=SC1091
  source .venv/bin/activate
  python init_db.py
fi

cat <<'EOF'

Setup complete.

Develop with hot reload (recommended for new features):
  1) Keep Postgres running:  docker compose up -d db
  2) Backend:   cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8000
  3) Frontend:  cd frontend && npm run dev
  4) Open:      http://localhost:5179
     Login:     admin@stockkeeper.com / admin123

Or run the whole stack in Docker:
  docker compose up -d --build
  Open http://localhost

Deploy to production (manual):
  ./scripts/deploy.sh
EOF
