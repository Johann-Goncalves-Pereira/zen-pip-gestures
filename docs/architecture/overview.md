# Architecture overview

**Status:** shipped

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
4. Steps: quit Zen (poll until the process is gone, or force-quit and poll
   again) → ditto to `~/Applications` while the fx-autoconfig zip downloads →
   install that zip → codesign → merge profile chrome → embed-copy PiP scripts
   → LaunchAgent.
5. When `~/Applications/Zen.app` is already patched and its `CFBundleVersion`
   matches `/Applications/Zen.app`, skip both the ditto and the zip download
   (the download is skipped only if `DataDir/fx-chrome` already has
   `utils/boot.sys.mjs`). The repatch LaunchAgent overlaps the same download
   with ditto only after it has already decided a repatch is needed.
6. Failures map to Common-error recovery (retry / skip / abort).

## Gesture frames

Trackpad input is applied from one `requestAnimationFrame` callback. The frame
id stays set for the whole callback, so a wheel event re-entered from the
cursor pin cannot schedule a second frame or reset the smoothing clock. Min and
max width come from a pref observer. Available screen bounds are cached until
the PiP window resizes.
