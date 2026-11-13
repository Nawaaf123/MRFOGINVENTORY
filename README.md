# Stock Keeper

Inventory management system for tracking products across multiple warehouses, managing orders, receivings, payments, and generating reports.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python 3.12) |
| Frontend | React + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| Database | PostgreSQL 16 |
| Deployment | Docker + Docker Compose on AWS EC2 |
| CI/CD | Manual deploy for now (`./scripts/deploy.sh`); GitHub Actions later |

## Features

- **Inventory Management** — Track products across multiple warehouses with per-warehouse stock levels
- **Orders** — Create, edit, and cancel outgoing orders with automatic stock deduction
- **Receivings** — Record incoming stock against BOL numbers
- **Payments** — Track wholesaler invoices, record payments, distribute across invoices
- **Reports** — Sales analytics with charts and Excel export
- **Drift Monitor** — Detect stock discrepancies between live data and audit log
- **PDF/Excel Export** — Invoices, pick sheets, inventory lists, sales reports
- **Auth** — JWT-based login with admin/user roles

## Home / new computer setup

Use this when you move to a new machine (for example your home PC) and want to develop features, then deploy manually.

### 1. One-time tools

- Git
- Python 3.12+
- Node.js 22+
- Docker Desktop (recommended)
- Your GitHub login (same account as the office machine)
- Your EC2 `.pem` key copied from the office machine (for deploys)

### 2. Clone and install

```bash
git clone https://github.com/Nawaaf123/MRFOGINVENTORY.git
cd MRFOGINVENTORY
./scripts/setup-home.sh
```

### 3. Develop features

```bash
# Terminal 1 — API
cd backend && source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — UI
cd frontend && npm run dev
```

Open http://localhost:5179  
Login: `admin@stockkeeper.com` / `admin123`

### 4. Deploy manually to production

Push your branch/commits to GitHub, then:

```bash
export EC2_HOST=YOUR_EC2_PUBLIC_IP
export EC2_KEY=~/.ssh/your-key.pem
./scripts/deploy.sh
```

That SSHs into EC2, pulls `main`, and rebuilds Docker containers.  
If SSH fails from home, allow your home IP on the EC2 security group (port 22).

## Local Development

### Prerequisites

- Python 3.12+
- Node.js 22+
- PostgreSQL 16+ (or Docker)

### Quick Start with Docker

```bash
docker compose up -d
```

The app will be available at http://localhost. Default login:
- Email: `admin@stockkeeper.com`
- Password: `admin123`

### Manual Setup

**Database:**
```bash
# Start PostgreSQL (via Docker or local install)
docker run -d --name stockkeeper-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=stockkeeper \
  -p 5432:5432 \
  postgres:16-alpine
```

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python init_db.py        # Create tables + seed admin user
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev              # Starts on http://localhost:5179
```

## AWS Deployment Guide

### 1. Launch EC2

- AMI: Ubuntu 24.04 LTS
- Instance type: t3.small (or t3.micro for testing)
- Storage: 20 GB
- Security group: Allow SSH (22), HTTP (80), HTTPS (443)

### 2. Set Up EC2

SSH into your instance and run:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt install -y docker-compose-plugin

# Clone your repo
git clone https://github.com/YOUR_USERNAME/stock-keeper.git ~/stock-keeper
cd ~/stock-keeper

# Create .env file
cat > .env << 'EOF'
SECRET_KEY=your-secure-random-string-here
CORS_ORIGINS=http://your-domain.com
EOF

# Start the app
docker compose up -d
```

### 3. Create RDS PostgreSQL (optional, recommended for production)

If using RDS instead of the Docker PostgreSQL:

1. Create an RDS PostgreSQL 16 instance
2. Security group: allow port 5432 from your EC2's security group
3. Update `docker-compose.yml`: remove the `db` service and change `DATABASE_URL` to point to RDS

```
DATABASE_URL=postgresql+asyncpg://user:password@your-rds-endpoint:5432/stockkeeper
```

### 4. Set Up GitHub Actions CI/CD

Add these secrets in your GitHub repo (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `EC2_HOST` | Your EC2 public IP or domain |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Your EC2 private key (PEM format) |

**How it works:** Every push to `main` triggers GitHub Actions, which SSHs into your EC2, pulls the latest code, rebuilds Docker containers, and restarts the app.

### 5. Custom Domain + HTTPS (optional)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

## Project Structure

```
├── backend/                 # FastAPI backend
│   ├── main.py             # App entry point
│   ├── config.py           # Environment config
│   ├── database.py         # DB connection
│   ├── models.py           # SQLAlchemy models
│   ├── schemas.py          # Pydantic schemas
│   ├── auth.py             # JWT auth
│   ├── routers/            # API route handlers
│   ├── init_db.py          # Table creation + seed
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── hooks/          # useAuth, useInventory
│   │   ├── lib/            # API client, utilities
│   │   ├── pages/          # Auth, Index, NotFound
│   │   └── types/          # TypeScript types
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
├── scripts/
│   ├── setup-home.sh       # One-time setup on a new computer
│   └── deploy.sh           # Manual EC2 deploy over SSH
├── .env.example
└── README.md
```
