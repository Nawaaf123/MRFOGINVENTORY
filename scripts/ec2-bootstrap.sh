#!/usr/bin/env bash
# Run on a fresh Ubuntu 24.04 EC2 instance as ubuntu user.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Nawaaf123/MRFOGINVENTORY.git}"
APP_DIR="${APP_DIR:-$HOME/MRFOGINVENTORY}"

echo "==> Installing Docker"
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"

echo "==> Installing Docker Compose plugin"
sudo apt-get update
sudo apt-get install -y docker-compose-plugin git

echo "==> Cloning repo"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout main
  git -C "$APP_DIR" pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
  git -C "$APP_DIR" checkout main
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  SECRET="$(openssl rand -hex 32)"
  cat > .env <<EOF
SECRET_KEY=${SECRET}
CORS_ORIGINS=*
EOF
  echo "==> Created .env with a random SECRET_KEY"
fi

echo "==> Building and starting containers (may take a few minutes)"
sudo docker compose up -d --build

echo "==> Done"
echo "Open: http://$(curl -s ifconfig.me || echo YOUR_EC2_PUBLIC_IP)"
echo "Login: admin@stockkeeper.com / admin123"
echo "Change the admin password after first login."
