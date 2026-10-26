#!/usr/bin/env bash
# Auto-repatch Zen after an update wiped fx-autoconfig (config.js).
# Safe to run often (LaunchAgent WatchPaths / login). No-ops when already patched.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_APP="/Applications/Zen.app"
DST_APP="${HOME}/Applications/Zen.app"
ZEN_SUPPORT="${HOME}/Library/Application Support/zen"
LOG_DIR="${HOME}/Library/Logs"
LOG_FILE="${LOG_DIR}/zen-pip-gestures.log"
LOCK_DIR="${TMPDIR:-/tmp}/zen-pip-gestures-repatch.lock"
LABEL="zen-pip-gestures"

mkdir -p "$LOG_DIR"

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  printf '%s\n' "$line" >> "$LOG_FILE"
}

notify() {
  local title="$1" body="$2"
  osascript -e "display notification \"${body}\" with title \"${title}\"" 2>/dev/null || true
}

# Single-flight lock (WatchPaths can fire in bursts).
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

is_patched() {
  local app="$1"
  [[ -f "$app/Contents/Resources/config.js" ]] \
    && [[ -f "$app/Contents/Resources/defaults/pref/config-prefs.js" ]]
}

zen_running() {
  pgrep -if 'Zen\.app|zen-bin' >/dev/null 2>&1
}

resolve_profile() {
  local INI="$ZEN_SUPPORT/profiles.ini"
  local INSTALLS="$ZEN_SUPPORT/installs.ini"
  local PATH_LINE="" PROFILE=""
  if [[ -f "$INI" ]]; then
    PATH_LINE="$(
      awk '
        /^\[Profile/ { p=1; path=""; def=0 }
        p && /^Path=/ { path=$0; sub(/^Path=/, "", path) }
        p && /^Default=1/ { def=1 }
        p && /^\[/ && !/^\[Profile/ {
          if (def && path) { print path; exit }
          p=0; path=""; def=0
        }
        END { if (def && path) print path }
      ' "$INI"
    )"
    if [[ -z "$PATH_LINE" && -f "$INSTALLS" ]]; then
      PATH_LINE="$(awk -F= '/^Default=/{print $2; exit}' "$INSTALLS")"
    fi
    if [[ -z "$PATH_LINE" ]]; then
      PATH_LINE="$(awk -F= '/^Path=/{print $2; exit}' "$INI")"
    fi
  fi
  if [[ -n "${PATH_LINE:-}" ]]; then
    if [[ "$PATH_LINE" = /* ]]; then
      PROFILE="$PATH_LINE"
    else
      PROFILE="$ZEN_SUPPORT/$PATH_LINE"
    fi
  fi
  if [[ -n "$PROFILE" && -f "$PROFILE/prefs.js" ]]; then
    echo "$PROFILE"
    return
  fi
  local FOUND
  FOUND="$(find "$ZEN_SUPPORT/Profiles" -name prefs.js -type f 2>/dev/null | head -1 || true)"
  if [[ -n "$FOUND" ]]; then
    dirname "$FOUND"
  fi
}

profile_ok() {
  local p="$1"
  [[ -f "$p/chrome/utils/boot.sys.mjs" ]] \
    && [[ -f "$p/chrome/JS/zen-pip-gestures.uc.js" ]]
}

# Decide whether anything is broken.
NEED=0
REASON=""

if [[ ! -d "$DST_APP" && ! -d "$SRC_APP" ]]; then
  log "skip: no Zen.app found"
  exit 0
fi

# Stock /Applications replaced our symlink with a fresh unpatched app.
if [[ -d "$SRC_APP" && ! -L "$SRC_APP" ]] && ! is_patched "$SRC_APP"; then
  NEED=1
  REASON="stock /Applications/Zen.app is unpatched (likely after update)"
fi

if [[ -d "$DST_APP" ]] && ! is_patched "$DST_APP"; then
  NEED=1
  REASON="~/Applications/Zen.app missing config.js"
fi

PROFILE="${ZEN_PIP_PROFILE:-$(resolve_profile)}"
if [[ -n "${PROFILE:-}" && -d "$PROFILE" ]] && ! profile_ok "$PROFILE"; then
  NEED=1
  REASON="profile chrome scripts missing"
fi

if [[ "$NEED" -eq 0 ]]; then
  # Healthy — quiet exit (no notification spam).
  exit 0
fi

log "repatch needed: $REASON"

# If Zen is mid-update / running, we can still rewrite Resources; user must
# restart for loader to pick up. Avoid force-quit unless ZEN_PIP_FORCE_QUIT=1.
if zen_running && [[ "${ZEN_PIP_FORCE_QUIT:-0}" != "1" ]]; then
  log "Zen is running — patching on disk; will ask for restart"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# Prefer refreshing ~/Applications from the newest stock tree when present.
mkdir -p "$HOME/Applications"
if [[ -d "$SRC_APP" && ! -L "$SRC_APP" ]]; then
  log "refreshing ~/Applications/Zen.app from /Applications"
  rm -rf "$DST_APP"
  ditto "$SRC_APP" "$DST_APP"
elif [[ ! -d "$DST_APP" && -d "$SRC_APP" ]]; then
  ditto "$SRC_APP" "$DST_APP"
fi

if [[ ! -d "$DST_APP" ]]; then
  log "error: no destination app to patch"
  notify "$LABEL" "Could not find Zen.app to re-patch."
  exit 1
fi

log "downloading fx-autoconfig"
curl -fsSL -o "$TMP/fx-autoconfig.zip" \
  "https://github.com/MrOtherGuy/fx-autoconfig/archive/refs/heads/master.zip" \
  || {
    log "error: download failed"
    notify "$LABEL" "Zen updated but re-patch failed (network). Run ./install.sh"
    exit 1
  }
unzip -q "$TMP/fx-autoconfig.zip" -d "$TMP"
FX="$(find "$TMP" -maxdepth 1 -type d -name 'fx-autoconfig-*' | head -1)"
if [[ -z "$FX" || ! -f "$FX/program/config.js" ]]; then
  log "error: unpack failed"
  notify "$LABEL" "Zen updated but re-patch failed (unpack). Run ./install.sh"
  exit 1
fi

ZEN_RES="$DST_APP/Contents/Resources"
cp "$FX/program/config.js" "$ZEN_RES/config.js"
mkdir -p "$ZEN_RES/defaults/pref"
cp "$FX/program/defaults/pref/config-prefs.js" \
  "$ZEN_RES/defaults/pref/config-prefs.js"
xattr -cr "$DST_APP" || true
codesign --force --deep --sign - "$DST_APP" >/dev/null 2>&1 || true
log "patched + signed $DST_APP"

# Restore profile scripts from this repo (survive most updates anyway).
if [[ -z "${PROFILE:-}" || ! -d "$PROFILE" ]]; then
  PROFILE="$(resolve_profile)"
fi
if [[ -n "${PROFILE:-}" && -d "$PROFILE" ]]; then
  mkdir -p "$PROFILE/chrome/JS" "$PROFILE/chrome/CSS"
  rsync -a "$FX/profile/chrome/" "$PROFILE/chrome/"
  cp "$REPO_ROOT/chrome/JS/zen-pip-"*.uc.js "$PROFILE/chrome/JS/" 2>/dev/null || true
  cp "$REPO_ROOT/chrome/CSS/zen-pip-"*.css "$PROFILE/chrome/CSS/" 2>/dev/null || true
  log "profile scripts refreshed: $PROFILE"
fi

# Best-effort: if /Applications is a real unpatched app and we can replace it
# with a symlink without sudo, do so. (Usually needs sudo — skip quietly.)
if [[ -d "$SRC_APP" && ! -L "$SRC_APP" ]]; then
  if rm -rf "$SRC_APP" 2>/dev/null; then
    ln -s "$DST_APP" "$SRC_APP" 2>/dev/null && log "restored /Applications symlink" || true
  else
    log "note: could not restore /Applications symlink (need sudo once)"
  fi
fi

notify "Zen PiP gestures ✨" \
  "Zen was updated — gestures were re-patched. Quit & reopen Zen (Clear startup cache if needed)."
log "repatch complete"
exit 0
