#!/usr/bin/env bash
set -euo pipefail
AGENT_ID="com.zen-pip-gestures.repatch"
PLIST="${HOME}/Library/LaunchAgents/${AGENT_ID}.plist"
launchctl bootout "gui/$(id -u)/${AGENT_ID}" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "Removed LaunchAgent ${AGENT_ID}"
