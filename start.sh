#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[brickops]${NC} $1"; }
ok()  { echo -e "${GREEN}[ok]${NC} $1"; }
warn(){ echo -e "${YELLOW}[warn]${NC} $1"; }
err() { echo -e "${RED}[error]${NC} $1"; }

# ── Prerequisites ──────────────────────────────────────────────
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    err "$1 is required but not installed."
    exit 1
  fi
}

check_cmd bun
check_cmd psql

# ── Load env ───────────────────────────────────────────────────
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
  log "Loaded .env"
else
  err ".env not found — copy .env.example to .env first"
  exit 1
fi

# ── Database ───────────────────────────────────────────────────
check_postgres() {
  log "Checking PostgreSQL connection..."
  # Use nc (netcat) which is reliable on macOS
  if nc -z -w 3 localhost 5432 2>/dev/null; then
    ok "PostgreSQL is reachable on port 5432"
    return 0
  fi
  return 1
}

if ! check_postgres; then
  warn "Cannot reach PostgreSQL on localhost:5432"
  warn "Continuing anyway — Prisma will validate the connection..."
fi

# ── Prisma ─────────────────────────────────────────────────────
log "Running Prisma migrations..."
cd packages/db
bunx prisma migrate deploy 2>/dev/null || bunx prisma migrate dev --skip-generate
bunx prisma generate
cd "$ROOT_DIR"
ok "Database ready"

# ── Install deps ───────────────────────────────────────────────
log "Installing dependencies..."
bun install
ok "Dependencies installed"

# ── Build agent personas ───────────────────────────────────────
log "Building agent personas..."
cd packages/agent-policy
bun run build 2>/dev/null || warn "agent-policy build skipped"
cd "$ROOT_DIR"

# ── Start services ─────────────────────────────────────────────
log "Starting all services..."
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  BrickOps Development Environment${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${YELLOW}WhatsApp Gateway:${NC} http://localhost:3002"
echo -e "  ${YELLOW}API + Orchestrator:${NC} http://localhost:3001"
echo -e "  ${YELLOW}Web UI:${NC} http://localhost:5173"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""

# Cleanup on exit
cleanup() {
  log "Shutting down..."
  kill 0 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# Start all services in background
(cd apps/whatsapp-gateway && bun run dev) &
PID_GATEWAY=$!

sleep 2

(cd apps/api && bun run dev) &
PID_API=$!

sleep 2

(cd apps/web && bun run dev) &
PID_WEB=$!

log "All services started (PIDs: gateway=$PID_GATEWAY api=$PID_API web=$PID_WEB)"
log "Press Ctrl+C to stop all services"

# Wait for any process to exit
wait
