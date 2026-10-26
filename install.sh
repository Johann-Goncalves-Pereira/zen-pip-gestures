#!/usr/bin/env bash
# Zen PiP gestures — one-command macOS installer.
#
# Usage (from a clone):
#   ./install.sh
#
# Usage (no clone yet — copies itself into ~/Developer/programs/zen-pip-gestures):
#   curl -fsSL https://raw.githubusercontent.com/Johann-Goncalves-Pereira/zen-pip-gestures/main/install.sh | bash
#
set -euo pipefail

REPO_NAME="zen-pip-gestures"
REPO_URL="https://github.com/Johann-Goncalves-Pereira/zen-pip-gestures.git"
DEFAULT_CLONE_DIR="${HOME}/Developer/programs/${REPO_NAME}"

# Prefer ~/Applications (writable, SIP-safe). Fall back only if Zen lives there.
SRC_APP="/Applications/Zen.app"
DST_APP="${HOME}/Applications/Zen.app"
ZEN_SUPPORT="${HOME}/Library/Application Support/zen"

RED=$'\033[31m'
GRN=$'\033[32m'
YLW=$'\033[33m'
BLD=$'\033[1m'
RST=$'\033[0m'

say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$GRN" "$*" "$RST"; }
warn() { printf '%s⚠️  %s%s\n' "$YLW" "$*" "$RST"; }
die()  { printf '%s❌ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Resolve where this script lives. If piped from curl, clone the repo first.
# ---------------------------------------------------------------------------
resolve_repo_root() {
  local here
  if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "$here/chrome/JS/zen-pip-gestures.uc.js" ]]; then
      echo "$here"
      return
    fi
  fi

  # Running via curl | bash — clone (or update) a local copy.
  say "${BLD}📥${RST} Scripts not found next to installer — cloning repo…"
  mkdir -p "$(dirname "$DEFAULT_CLONE_DIR")"
  if [[ -d "$DEFAULT_CLONE_DIR/.git" ]]; then
    git -C "$DEFAULT_CLONE_DIR" pull --ff-only || warn "git pull failed; using existing clone"
  else
    rm -rf "$DEFAULT_CLONE_DIR"
    git clone --depth 1 "$REPO_URL" "$DEFAULT_CLONE_DIR"
  fi
  echo "$DEFAULT_CLONE_DIR"
}

# ---------------------------------------------------------------------------
REPO_ROOT="$(resolve_repo_root)"
ZEN_RES="$DST_APP/Contents/Resources"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say ""
say "${BLD}🖼️  Zen PiP gestures installer ✨${RST}"
say "📂 Repo: $REPO_ROOT"
say ""

# Warnings up front
say "${YLW}${BLD}⚠️  Before we continue:${RST}"
say "  🍎  macOS only"
say "  🌐  Zen Browser must already be installed (usually in /Applications)"
say "  🛑  This will QUIT Zen"
say "  📦  Zen will be copied to ~/Applications/Zen.app (SIP-safe)"
say "  🎯  After install, launch THAT copy — not /Applications/Zen.app"
say "  🔁  After every Zen update, run this installer again"
say ""

if [[ ! -d "$SRC_APP" && ! -d "$DST_APP" ]]; then
  die "Zen.app not found in /Applications or ~/Applications.
Install Zen from https://zen-browser.app first, then re-run."
fi

# If stock app missing but home copy exists, refresh from home as source
if [[ ! -d "$SRC_APP" && -d "$DST_APP" ]]; then
  warn "No /Applications/Zen.app — will re-patch existing ~/Applications/Zen.app"
  SRC_APP="$DST_APP"
fi

if [[ ! -f "$REPO_ROOT/chrome/JS/zen-pip-gestures.uc.js" ]]; then
  die "Missing chrome/JS/zen-pip-gestures.uc.js in $REPO_ROOT"
fi

# ---------------------------------------------------------------------------
say "${BLD}👋${RST} Quitting Zen…"
osascript -e 'tell application "Zen" to quit' 2>/dev/null || true
for name in Zen zen zen-bin; do
  killall "$name" 2>/dev/null || true
done
sleep 1
if pgrep -if 'Zen\.app|zen-bin' >/dev/null 2>&1; then
  killall -9 Zen zen-bin 2>/dev/null || true
  sleep 1
fi
ok "Zen quit"

# ---------------------------------------------------------------------------
say "${BLD}📦${RST} Copying Zen → ~/Applications (writable copy)…"
mkdir -p "$HOME/Applications"
if [[ "$SRC_APP" != "$DST_APP" ]]; then
  # Fresh copy from stock app so updates are picked up
  rm -rf "$DST_APP"
  ditto "$SRC_APP" "$DST_APP"
elif [[ ! -d "$DST_APP" ]]; then
  die "Internal error: no destination Zen.app"
fi
ok "App at $DST_APP"

# ---------------------------------------------------------------------------
say "${BLD}⬇️${RST} Downloading fx-autoconfig…"
curl -fsSL -o "$TMP/fx-autoconfig.zip" \
  "https://github.com/MrOtherGuy/fx-autoconfig/archive/refs/heads/master.zip" \
  || die "Could not download fx-autoconfig (check network)"
unzip -q "$TMP/fx-autoconfig.zip" -d "$TMP"
FX="$(find "$TMP" -maxdepth 1 -type d -name 'fx-autoconfig-*' | head -1)"
[[ -n "$FX" && -f "$FX/program/config.js" ]] || die "Failed to unpack fx-autoconfig"
ok "fx-autoconfig ready"

# ---------------------------------------------------------------------------
say "${BLD}🔌${RST} Installing autoconfig into app Resources…"
cp "$FX/program/config.js" "$ZEN_RES/config.js"
mkdir -p "$ZEN_RES/defaults/pref"
cp "$FX/program/defaults/pref/config-prefs.js" \
  "$ZEN_RES/defaults/pref/config-prefs.js"
ok "config.js + config-prefs.js"

say "${BLD}🔏${RST} Clearing quarantine + ad-hoc codesign…"
xattr -cr "$DST_APP" || true
codesign --force --deep --sign - "$DST_APP" >/dev/null
ok "Signed ~/Applications/Zen.app"

# ---------------------------------------------------------------------------
resolve_profile() {
  local INI="$ZEN_SUPPORT/profiles.ini"
  local INSTALLS="$ZEN_SUPPORT/installs.ini"
  local PATH_LINE=""

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

  local PROFILE=""
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
    return
  fi
  echo ""
}

PROFILE="${ZEN_PIP_PROFILE:-}"
if [[ -z "$PROFILE" ]]; then
  PROFILE="$(resolve_profile)"
fi

if [[ -z "${PROFILE:-}" || ! -d "$PROFILE" || ! -f "$PROFILE/prefs.js" ]]; then
  die "Could not find your Zen profile (prefs.js).
Open Zen once, then in the address bar go to:  about:support
Click \"Profile Folder\" → Open Folder, then re-run:

  ZEN_PIP_PROFILE=\"/full/path/to/that/folder\" \"$REPO_ROOT/install.sh\""
fi

say "${BLD}📁${RST} Profile: $PROFILE"

# ---------------------------------------------------------------------------
say "${BLD}🧩${RST} Merging fx-autoconfig into profile chrome/…"
mkdir -p "$PROFILE/chrome"
rsync -a "$FX/profile/chrome/" "$PROFILE/chrome/"
ok "boot.sys.mjs + utils"

say "${BLD}✨${RST} Installing Zen PiP scripts…"
mkdir -p "$PROFILE/chrome/JS" "$PROFILE/chrome/CSS"
cp "$REPO_ROOT/chrome/JS/zen-pip-gestures.uc.js" "$PROFILE/chrome/JS/"
cp "$REPO_ROOT/chrome/JS/zen-pip-auto-focus.uc.js" "$PROFILE/chrome/JS/"
cp "$REPO_ROOT/chrome/JS/zen-pip-no-traffic-lights.uc.js" "$PROFILE/chrome/JS/"
cp "$REPO_ROOT/chrome/CSS/zen-pip-no-traffic-lights.css" "$PROFILE/chrome/CSS/"
ok "gestures + auto-focus + no-traffic-lights"

# Prefs
USER_JS="$PROFILE/user.js"
touch "$USER_JS"
ensure_pref() {
  local name="$1" value="$2"
  if grep -q "user_pref(\"$name\"" "$USER_JS" 2>/dev/null; then
    sed -i '' "s|user_pref(\"$name\".*|user_pref(\"$name\", $value);|" "$USER_JS"
  else
    printf 'user_pref("%s", %s);\n' "$name" "$value" >> "$USER_JS"
  fi
}
ensure_pref "media.videocontrols.picture-in-picture.enabled" "true"
ensure_pref "media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled" "true"
ensure_pref "zen.pip.trackpadGestures.enabled" "true"
ensure_pref "zen.pip.gestures.pan.enabled" "true"
ensure_pref "zen.pip.gestures.pinch.enabled" "true"
ensure_pref "zen.pip.autoSpace.enabled" "true"
ensure_pref "zen.pip.hideTrafficLights.enabled" "true"
ok "prefs written to user.js"

# Optional: replace /Applications with symlink so Dock/Spotlight hit the good copy
if [[ -d /Applications/Zen.app && ! -L /Applications/Zen.app ]]; then
  say ""
  warn "You still have a stock Zen at /Applications/Zen.app."
  warn "Always open:  open \"$DST_APP\""
  warn "Or (optional) symlink so both paths are the same:"
  say "  sudo rm -rf /Applications/Zen.app && sudo ln -s \"$DST_APP\" /Applications/Zen.app"
fi

# ---------------------------------------------------------------------------
say ""
say "${GRN}${BLD}🎉 Done!${RST}"
say ""
say "${BLD}👉 Next steps (do these now):${RST}"
say "  1️⃣  Open the patched app:"
say "       open \"$DST_APP\""
say "  2️⃣  In Zen: Help → More Troubleshooting Information → ${BLD}Clear startup cache…${RST}"
say "     (Zen will restart)"
say "  3️⃣  Play a video → click PiP → two-finger drag to move, pinch to resize ✨"
say ""
say "📌 Pin ${BLD}~/Applications/Zen.app${RST} to your Dock. Prefer that over /Applications."
say ""
say "🔎 Verify files:"
ls -la "$ZEN_RES/config.js" \
  "$ZEN_RES/defaults/pref/config-prefs.js" \
  "$PROFILE/chrome/utils/boot.sys.mjs" \
  "$PROFILE/chrome/JS/zen-pip-"*.uc.js \
  "$PROFILE/chrome/CSS/zen-pip-"*.css
say ""
say "🩺 Problems? Read: $REPO_ROOT/README.md  →  Troubleshooting"
