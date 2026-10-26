#!/usr/bin/env bash
# Deprecated — use the repo-root installer:
#   ./install.sh
# or:
#   curl -fsSL https://raw.githubusercontent.com/Johann-Goncalves-Pereira/zen-pip-gestures/main/install.sh | bash
exec "$(cd "$(dirname "$0")/.." && pwd)/install.sh" "$@"
