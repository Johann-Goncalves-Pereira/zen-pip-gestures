# Architecture overview

**Status:** shipped (installer TUI in progress → see catalog)

## Pieces

| Piece | Role |
| ----- | ---- |
| `install.sh` | Downloads the latest macOS Release binary and execs it |
| `cmd/install` | Charm TUI (Huh / Lip Gloss) that patches Zen + profiles |
| `internal/install` | Pure helpers: Zen detection, profiles.ini, patch checks |
| `chrome/JS|CSS` | userChromeJS scripts loaded via fx-autoconfig |
| `scripts/repatch-on-update.sh` | LaunchAgent target after Zen updates |

## Install data flow

1. Bootstrap fetches `zen-pip-install-darwin-{arm64,amd64}` from GitHub Releases.
2. TUI confirms Zen exists (or guides official install + retry).
3. User multi-selects profiles; optional feature toggles write `user.js`
   (size prefs stay out of `user.js` — see [Prefs](../product/prefs.md)).
4. Steps: quit Zen → ditto to `~/Applications` → fx-autoconfig → codesign →
   merge profile chrome → embed-copy PiP scripts → LaunchAgent.
5. Failures map to Common-error recovery (retry / skip / abort).
