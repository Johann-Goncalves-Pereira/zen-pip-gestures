#!/usr/bin/env bash
# Deprecated — use ./install.sh (downloads the Charm TUI) or: go run ./cmd/install
exec "$(cd "$(dirname "$0")" && pwd)/install.sh" "$@"
