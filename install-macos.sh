#!/usr/bin/env bash
# Deprecated entry point — use ./install.sh
exec "$(cd "$(dirname "$0")" && pwd)/install.sh" "$@"
