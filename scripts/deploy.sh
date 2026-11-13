#!/usr/bin/env bash
# Manually deploy the latest main branch to your EC2 box over SSH.
# Required env vars (or pass as flags):
#   EC2_HOST   public IP or domain
#   EC2_KEY    path to your .pem private key
# Optional:
#   EC2_USER   default: ubuntu
#   APP_DIR    default: ~/stock-keeper
set -euo pipefail

EC2_HOST="${EC2_HOST:-}"
EC2_KEY="${EC2_KEY:-}"
EC2_USER="${EC2_USER:-ubuntu}"
APP_DIR="${APP_DIR:-~/stock-keeper}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) EC2_HOST="$2"; shift 2 ;;
    --key) EC2_KEY="$2"; shift 2 ;;
    --user) EC2_USER="$2"; shift 2 ;;
    --dir) APP_DIR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: EC2_HOST=... EC2_KEY=~/.ssh/key.pem ./scripts/deploy.sh"
      echo "   or: ./scripts/deploy.sh --host IP --key ~/.ssh/key.pem"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$EC2_HOST" || -z "$EC2_KEY" ]]; then
  echo "Set EC2_HOST and EC2_KEY before deploying."
  echo "Example:"
  echo "  export EC2_HOST=1.2.3.4"
  echo "  export EC2_KEY=~/.ssh/stockkeeper.pem"
  echo "  ./scripts/deploy.sh"
  exit 1
fi

# Expand ~
EC2_KEY="${EC2_KEY/#\~/$HOME}"

if [[ ! -f "$EC2_KEY" ]]; then
  echo "SSH key not found: $EC2_KEY"
  echo "Copy the .pem from your office machine first."
  exit 1
fi

chmod 400 "$EC2_KEY" 2>/dev/null || true

echo "==> Connecting to ${EC2_USER}@${EC2_HOST}"
echo "==> Pulling main and rebuilding containers in ${APP_DIR}"

ssh -i "$EC2_KEY" -o StrictHostKeyChecking=accept-new "${EC2_USER}@${EC2_HOST}" bash -s <<EOF
set -euo pipefail
cd ${APP_DIR}
git fetch origin
git checkout main
git pull origin main
docker compose up -d --build
docker compose ps
echo "Deploy finished."
EOF
