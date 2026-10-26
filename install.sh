#!/usr/bin/env bash
# Zen PiP gestures — download the Charm TUI binary from GitHub Releases and run it.
#
#   curl -fsSL https://raw.githubusercontent.com/Johann-Goncalves-Pereira/zen-pip-gestures/main/install.sh | bash
#
# Contributors (from a clone):
#   go run ./cmd/install
#
set -euo pipefail

REPO="Johann-Goncalves-Pereira/zen-pip-gestures"
API="https://api.github.com/repos/${REPO}/releases/latest"
RED=$'\033[31m'
GRN=$'\033[32m'
BLD=$'\033[1m'
RST=$'\033[0m'

die() { printf '%s❌ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }
ok()  { printf '%s✅ %s%s\n' "$GRN" "$*" "$RST"; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  die "This installer is macOS-only."
fi

arch="$(uname -m)"
case "$arch" in
  arm64) asset="zen-pip-install-darwin-arm64" ;;
  x86_64) asset="zen-pip-install-darwin-amd64" ;;
  *) die "Unsupported architecture: $arch (need arm64 or x86_64)" ;;
esac

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
bin="$tmpdir/$asset"

printf '%s⬇️  Downloading %s…%s\n' "$BLD" "$asset" "$RST"

# Prefer GitHub API → browser_download_url; fall back to /releases/latest/download/
download_url=""
if command -v curl >/dev/null && command -v python3 >/dev/null; then
  json="$(curl -fsSL "$API" || true)"
  if [[ -n "$json" ]]; then
    download_url="$(
      printf '%s' "$json" | python3 -c "
import json,sys
rel=json.load(sys.stdin)
for a in rel.get('assets',[]):
    if a.get('name')==sys.argv[1]:
        print(a['browser_download_url']); break
" "$asset" 2>/dev/null || true
    )"
  fi
fi

if [[ -z "$download_url" ]]; then
  download_url="https://github.com/${REPO}/releases/latest/download/${asset}"
fi

curl -fsSL -o "$bin" "$download_url" \
  || die "Could not download ${asset}.
Create a release (tag v*) or run from a clone:  go run ./cmd/install
URL tried: $download_url"

chmod +x "$bin"
# Clear quarantine so Gatekeeper does not block the downloaded binary.
xattr -d com.apple.quarantine "$bin" 2>/dev/null || true

ok "Starting installer TUI…"
exec "$bin" "$@"
