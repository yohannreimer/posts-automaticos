#!/usr/bin/env bash
set -euo pipefail

SERVICE_LABEL="com.yrd.posts-automaticos"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="$(command -v node)"
AGENT_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$AGENT_DIR/$SERVICE_LABEL.plist"
LOG_DIR="$PROJECT_DIR/data/logs"
DOMAIN="gui/$(id -u)"

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  printf '%s' "$value"
}

if [[ ! -f "$PROJECT_DIR/server.mjs" || ! -f "$PROJECT_DIR/.env" ]]; then
  echo "Projeto ou .env não encontrado em: $PROJECT_DIR" >&2
  exit 1
fi

mkdir -p "$AGENT_DIR" "$LOG_DIR"

PROJECT_XML="$(xml_escape "$PROJECT_DIR")"
NODE_XML="$(xml_escape "$NODE_BIN")"
STDOUT_XML="$(xml_escape "$LOG_DIR/server.log")"
STDERR_XML="$(xml_escape "$LOG_DIR/server-error.log")"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$SERVICE_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_XML</string>
    <string>$PROJECT_XML/server.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_XML</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>$STDOUT_XML</string>
  <key>StandardErrorPath</key>
  <string>$STDERR_XML</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST_PATH"
launchctl bootout "$DOMAIN/$SERVICE_LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST_PATH"
launchctl enable "$DOMAIN/$SERVICE_LABEL"
launchctl kickstart -k "$DOMAIN/$SERVICE_LABEL"

echo "Serviço instalado e iniciado."
echo "Abra: http://localhost:4173"
echo "Status: launchctl print $DOMAIN/$SERVICE_LABEL"
echo "Logs: $LOG_DIR/server.log e $LOG_DIR/server-error.log"
