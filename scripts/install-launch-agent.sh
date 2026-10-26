#!/usr/bin/env bash
# Install LaunchAgent that re-patches Zen after updates.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_ID="com.zen-pip-gestures.repatch"
PLIST="${HOME}/Library/LaunchAgents/${AGENT_ID}.plist"
REPATCH="${REPO_ROOT}/scripts/repatch-on-update.sh"
LOG="${HOME}/Library/Logs/zen-pip-gestures.launchd.log"

chmod +x "$REPATCH" "${REPO_ROOT}/scripts/install-launch-agent.sh" \
  "${REPO_ROOT}/scripts/uninstall-launch-agent.sh" 2>/dev/null || true

mkdir -p "${HOME}/Library/LaunchAgents"

# Unload old agent if present
launchctl bootout "gui/$(id -u)/${AGENT_ID}" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_ID}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${REPATCH}</string>
  </array>
  <key>WatchPaths</key>
  <array>
    <string>/Applications/Zen.app</string>
    <string>${HOME}/Applications/Zen.app</string>
    <string>${HOME}/Applications/Zen.app/Contents/Resources</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null \
  || launchctl load -w "$PLIST"
echo "Installed LaunchAgent: $PLIST"
echo "Watches Zen.app and re-runs repatch when an update wipes config.js."
