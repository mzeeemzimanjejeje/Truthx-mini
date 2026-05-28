#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# TRUTH-MD VPS Setup Script
# Installs Docker + Docker Compose and launches the bot and nginx in one command.
#
# Usage (run as root or with sudo):
#   curl -fsSL https://raw.githubusercontent.com/mzeeemzimanjejeje/Truthx-mini/main/setup-vps.sh | bash
#   — or —
#   chmod +x setup-vps.sh && sudo ./setup-vps.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

REPO_URL="https://github.com/mzeeemzimanjejeje/Truthx-mini"
INSTALL_DIR="/opt/truth-md"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[TRUTH-MD]${NC} $1"; }
warn() { echo -e "${YELLOW}[TRUTH-MD]${NC} $1"; }
err()  { echo -e "${RED}[TRUTH-MD]${NC} $1"; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    err "Please run as root: sudo bash setup-vps.sh"
fi

log "Starting TRUTH-MD VPS setup..."
echo ""

# ── 1. System update ──────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release

# ── 2. Install Docker ─────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log "Docker installed ✅"
else
    log "Docker already installed ✅"
fi

# ── 3. Install Docker Compose ─────────────────────────────────────────────────
if ! command -v docker-compose &>/dev/null && ! docker compose version &>/dev/null 2>&1; then
    log "Installing Docker Compose..."
    COMPOSE_VER=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
    curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VER}/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    log "Docker Compose installed ✅"
else
    log "Docker Compose already installed ✅"
fi

# ── 4. Clone or update repo ───────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
    log "Updating existing installation at $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git pull origin main
else
    log "Cloning TRUTH-MD into $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# ── 5. Create .env if missing ─────────────────────────────────────────────────
if [ ! -f "$INSTALL_DIR/.env" ]; then
    log "Creating .env from template..."
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    echo ""
    warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    warn "  ACTION REQUIRED: Edit your .env file now."
    warn "  Run: nano $INSTALL_DIR/.env"
    warn "  Set SESSION_ID and OWNER_NUMBER at minimum."
    warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    read -p "Press ENTER after editing .env to continue..." _
fi

# ── 6. Build and start containers ─────────────────────────────────────────────
log "Building Docker image (this takes a few minutes on first run)..."
cd "$INSTALL_DIR"

if command -v docker-compose &>/dev/null; then
    docker-compose pull nginx 2>/dev/null || true
    docker-compose up -d --build
else
    docker compose pull nginx 2>/dev/null || true
    docker compose up -d --build
fi

# ── 7. Wait for health check ──────────────────────────────────────────────────
log "Waiting for bot to come online..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:5000/health >/dev/null 2>&1; then
        log "Bot is online ✅"
        break
    fi
    sleep 3
    if [ "$i" -eq 30 ]; then
        warn "Bot didn't respond on /health within 90s — check logs with: docker logs truth-md-bot"
    fi
done

# ── 8. Show status ────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  TRUTH-MD is deployed! 🚀${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo "  Web UI:     http://${SERVER_IP}"
echo "  Health:     http://${SERVER_IP}/health"
echo ""
echo "  Useful commands:"
echo "    View logs:    docker logs -f truth-md-bot"
echo "    Restart bot:  docker restart truth-md-bot"
echo "    Stop all:     docker-compose down  (in $INSTALL_DIR)"
echo "    Update bot:   cd $INSTALL_DIR && git pull && docker-compose up -d --build"
echo ""
echo "  To add HTTPS, install certbot and uncomment the SSL block in nginx/default.conf"
echo "    apt install certbot python3-certbot-nginx"
echo "    certbot --nginx -d your-domain.com"
echo ""
