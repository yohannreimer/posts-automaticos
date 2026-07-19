#!/usr/bin/env bash
set -euo pipefail

SERVICE_LABEL="com.yrd.posts-automaticos"
AGENT_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$AGENT_DIR/$SERVICE_LABEL.plist"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$SERVICE_LABEL" 2>/dev/null || \
  launchctl bootout "$DOMAIN" "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"

echo "Serviço removido. Os dados, vídeos, logs, .env e o projeto foram preservados."
