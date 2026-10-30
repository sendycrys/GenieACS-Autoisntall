#!/usr/bin/env bash
# ==============================================================================
# GenieACS Uninstaller Script
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}[ERROR] This script must be run as root!${NC}"
  exit 1
fi

echo -e "${YELLOW}${BOLD}WARNING: This will stop and remove all GenieACS services.${NC}"
read -r -p "Are you sure you want to proceed? [y/N]: " confirm

if [[ ! "$confirm" =~ ^[yY]$ ]]; then
  echo "Uninstallation aborted."
  exit 0
fi

echo "Stopping and disabling GenieACS services..."
systemctl stop genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui coturn || true
systemctl disable genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui || true

echo "Removing systemd service units..."
rm -f /etc/systemd/system/genieacs-*.service
systemctl daemon-reload

echo "Removing GenieACS npm package..."
npm uninstall -g genieacs || true

read -r -p "Do you also want to remove /opt/genieacs and /var/log/genieacs? [y/N]: " rm_dirs
if [[ "$rm_dirs" =~ ^[yY]$ ]]; then
  rm -rf /opt/genieacs /var/log/genieacs
  echo "Directories removed."
fi

read -r -p "Do you want to DROP the MongoDB 'genieacs' database? [y/N]: " rm_db
if [[ "$rm_db" =~ ^[yY]$ ]]; then
  if command -v mongosh &>/dev/null; then
    mongosh genieacs --eval "db.dropDatabase()" || true
  elif command -v mongo &>/dev/null; then
    mongo genieacs --eval "db.dropDatabase()" || true
  fi
  echo "Database dropped."
fi

echo -e "${GREEN}${BOLD}GenieACS has been successfully uninstalled.${NC}"
