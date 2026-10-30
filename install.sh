#!/usr/bin/env bash
# ==============================================================================
# GenieACS Custom Auto-Installer & Orchestrator
# Repository: https://github.com/sendycrys/GenieACS-Autoisntall.git
# ==============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ASCII Banner
print_banner() {
  clear
  echo -e "${CYAN}${BOLD}"
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║                                                                  ║"
  echo "║       ██████╗ ███████╗███╗   ██╗██╗███████╗ █████╗  ██████╗      ║"
  echo "║      ██╔════╝ ██╔════╝████╗  ██║██║██╔════╝██╔══██╗██╔════╝      ║"
  echo "║      ██║  ███╗█████╗  ██╔██╗ ██║██║█████╗  ███████║██║           ║"
  echo "║      ██║   ██║██╔══╝  ██║╚██╗██║██║██╔══╝  ██╔══██║██║           ║"
  echo "║      ╚██████╔╝███████╗██║ ╚████║██║███████╗██║  ██║╚██████╗      ║"
  echo "║       ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝      ║"
  echo "║               PREMIUM EDITION AUTO-INSTALLER                     ║"
  echo "║      Dark Theme | STUN TR-111 | PPPoE Search | Custom Badges    ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# Logger helper
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 1. Root check
if [ "$(id -u)" -ne 0 ]; then
  log_error "This script must be run as root (or with sudo)!"
  exit 1
fi

print_banner

# Determine source directory (local clone vs direct curl execution)
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
TEMP_DIR=""

if [ ! -d "${SOURCE_DIR}/data" ] || [ ! -d "${SOURCE_DIR}/public" ]; then
  log_info "Installer executed remotely via curl/wget. Cloning repository..."
  TEMP_DIR=$(mktemp -d /tmp/genieacs-install-XXXXXX)
  git clone --depth 1 https://github.com/sendycrys/GenieACS-Autoisntall.git "${TEMP_DIR}"
  SOURCE_DIR="${TEMP_DIR}"
fi

cleanup() {
  if [ -n "${TEMP_DIR}" ] && [ -d "${TEMP_DIR}" ]; then
    rm -rf "${TEMP_DIR}"
  fi
}
trap cleanup EXIT

# 2. Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  OS_VERSION=$VERSION_ID
  CODENAME=$VERSION_CODENAME
else
  log_error "Unsupported OS. Please run on Ubuntu (20.04/22.04/24.04) or Debian (11/12)."
  exit 1
fi

log_info "Detected OS: ${PRETTY_NAME} (${CODENAME})"

# Auto-detect IP address
DEFAULT_IP=$(ip -4 addr show default 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)
if [ -z "$DEFAULT_IP" ]; then
  DEFAULT_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
DEFAULT_IP="${DEFAULT_IP:-127.0.0.1}"

# Interactive prompts (with env override support)
echo -e "${BOLD}${CYAN}--- Configuration Setup ---${NC}"

if [ -z "$SERVER_IP" ]; then
  read -r -p "Enter Server IP / Domain for ACS & STUN [$DEFAULT_IP]: " input_ip
  SERVER_IP="${input_ip:-$DEFAULT_IP}"
fi

if [ -z "$ADMIN_USER" ]; then
  read -r -p "Enter Admin Username [admin]: " input_user
  ADMIN_USER="${input_user:-admin}"
fi

if [ -z "$ADMIN_PASS" ]; then
  read -r -s -p "Enter Admin Password [admin123]: " input_pass
  echo ""
  ADMIN_PASS="${input_pass:-admin123}"
fi

echo ""
log_info "Server IP: ${BOLD}${SERVER_IP}${NC}"
log_info "Admin Username: ${BOLD}${ADMIN_USER}${NC}"
echo ""

# 3. System packages
log_info "Updating system package index..."
apt-get update -y
apt-get install -y curl wget gnupg lsb-release build-essential git coturn iproute2 jq ca-certificates

# 4. Install Node.js 18 LTS
if ! command -v node &>/dev/null || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 18 ]; then
  log_info "Installing Node.js 18 LTS..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
else
  log_info "Node.js already installed: $(node -v)"
fi

# 5. Install MongoDB
if ! command -v mongod &>/dev/null; then
  log_info "Installing MongoDB..."
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /etc/apt/keyrings/mongodb-server-7.0.gpg --yes

  if [ "$OS" = "ubuntu" ]; then
    UBUNTU_REPO_VER="$CODENAME"
    # Fallback for newer distros like 24.04 noble if repo not published yet
    if [ "$CODENAME" = "noble" ]; then
      UBUNTU_REPO_VER="jammy"
    fi
    echo "deb [ arch=amd64,arm64 signed-by=/etc/apt/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${UBUNTU_REPO_VER}/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
  elif [ "$OS" = "debian" ]; then
    DEBIAN_REPO_VER="$CODENAME"
    echo "deb [ signed-by=/etc/apt/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/debian ${DEBIAN_REPO_VER}/mongodb-org/7.0 main" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
  fi

  apt-get update -y || true
  apt-get install -y mongodb-org || apt-get install -y mongodb || true
fi

systemctl daemon-reload
systemctl enable mongod 2>/dev/null || systemctl enable mongodb 2>/dev/null || true
systemctl restart mongod 2>/dev/null || systemctl restart mongodb 2>/dev/null || true
log_success "MongoDB service is running."

# 6. Install GenieACS Base Package
log_info "Installing GenieACS 1.2.13..."
npm install -g genieacs@1.2.13

# 7. Create genieacs system user
if ! id genieacs &>/dev/null; then
  useradd --system --no-create-home --user-group genieacs
fi

# 8. Setup directories & permissions
mkdir -p /opt/genieacs/ext /var/log/genieacs
chown -R genieacs:genieacs /opt/genieacs /var/log/genieacs

# Copy environment config
cp "${SOURCE_DIR}/config/genieacs.env" /opt/genieacs/genieacs.env
chown genieacs:genieacs /opt/genieacs/genieacs.env
chmod 600 /opt/genieacs/genieacs.env

# 9. Apply Custom GenieACS UI & Frontend Patches
log_info "Applying Premium UI theme & customizations..."

GENIEACS_PATH="/usr/lib/node_modules/genieacs"
if [ ! -d "$GENIEACS_PATH" ]; then
  GENIEACS_PATH="/usr/local/lib/node_modules/genieacs"
fi

if [ -d "$GENIEACS_PATH" ]; then
  # Copy custom UI binary
  cp -f "${SOURCE_DIR}/bin/genieacs-ui" "${GENIEACS_PATH}/bin/genieacs-ui"
  chmod +x "${GENIEACS_PATH}/bin/genieacs-ui"

  # Copy custom public assets
  cp -rf "${SOURCE_DIR}/public/"* "${GENIEACS_PATH}/public/"
  log_success "Custom UI theme and frontend patches applied."
else
  log_warn "Could not locate global genieacs node_modules. Custom patches skipped."
fi

# 10. Configure Coturn STUN Server
log_info "Configuring STUN Server (coturn)..."
cp -f "${SOURCE_DIR}/config/turnserver.conf" /etc/turnserver.conf

# Enable coturn in /etc/default/coturn if it exists
if [ -f /etc/default/coturn ]; then
  sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/g' /etc/default/coturn
  sed -i 's/TURNSERVER_ENABLED=0/TURNSERVER_ENABLED=1/g' /etc/default/coturn
fi

systemctl enable coturn || true
systemctl restart coturn || true
log_success "STUN server configured on UDP port 3478."

# 11. Install Systemd Services
log_info "Installing GenieACS systemd service units..."
cp -f "${SOURCE_DIR}/systemd/"*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui

# 12. Import Database Collections
log_info "Importing provisions, presets, virtual parameters, and UI configs..."
node "${SOURCE_DIR}/scripts/import-db.js" \
  --mongo-url "mongodb://127.0.0.1:27017/genieacs" \
  --server-ip "$SERVER_IP" \
  --admin-user "$ADMIN_USER" \
  --admin-pass "$ADMIN_PASS"

# 13. Start All Services
log_info "Starting GenieACS services..."
systemctl restart genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui

# 14. Verification & Output Summary
echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}       GENIEACS PREMIUM EDITION INSTALLED SUCCESSFULLY!          ${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}🌐 GenieACS Web UI:${NC}    http://${SERVER_IP}:3000"
echo -e "  ${BOLD}👤 Admin Username:${NC}     ${ADMIN_USER}"
echo -e "  ${BOLD}🔑 Admin Password:${NC}     ${ADMIN_PASS}"
echo -e "  ${BOLD}📡 TR-069 ACS URL:${NC}     http://${SERVER_IP}:7547"
echo -e "  ${BOLD}⚡ NBI API URL:${NC}        http://${SERVER_IP}:7557"
echo -e "  ${BOLD}🎯 STUN Server:${NC}        udp://${SERVER_IP}:3478"
echo ""
echo -e "${CYAN}${BOLD}Features Included:${NC}"
echo -e "  ✓ Premium Dark Theme with Cyberpunk Glow Aesthetic"
echo -e "  ✓ PPPoE Username Search Filter & Search Bar"
echo -e "  ✓ Full Parameter Table (SSID, PPPoE IP, TR-069 IP, PON, Optical RX Badges, Temp)"
echo -e "  ✓ Solusi STUN TR-111 & Safe Provisioning untuk ONT China Mobile (CMDC H1s-3)"
echo -e "  ✓ Auto Reboot Navigation & Client Management"
echo -e "  ✓ 20 Virtual Parameters Pre-configured for Huawei, ZTE, FiberHome, Totolink, CMDC"
echo ""
echo -e "${YELLOW}Useful Service Commands:${NC}"
echo -e "  systemctl status genieacs-ui"
echo -e "  systemctl restart genieacs-cwmp genieacs-ui"
echo -e "  journalctl -u genieacs-cwmp -f"
echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
