# Auto-PiP (tab switch & Space)

**Status:** shipped

## Goal

When the playing video is no longer what the user is looking at, open Zen’s
Picture-in-Picture automatically — Arc-like — without firing on transient
overlays (Raycast, Spotlight, menu bar).

## Triggers

1. **Tab switch** — leave a tab that had a playing, unmuted, PiP-eligible video
2. **Window deactivate** — another Space / Stage Manager / other app (not an
   overlay bundle ID)
3. **Occlusion / minimize** — when the platform reports the window not visible

Pref: `zen.pip.autoSpace.enabled` (default `true`).

## Implementation notes

Auto-PiP sends `PictureInPicture:AutoToggle` to the content
`PictureInPictureLauncher` actor. Firefox only opens PiP when the child finds a
video that is **playing**, **not muted**, and **PiP-eligible**.

### Do not force `docShellIsActive = false` before AutoToggle

Especially on deactivate, forcing the docShell inactive can pause media before
`autoToggle()` runs its `videoIsPlaying` check, which yields a silent no-op
(`no-pip` in `~/Library/Logs/zen-pip-scripts.log`).

### Close PiP through Firefox’s maps

Raw `win.close()` on a PiP player does **not** clear `browserWeakMap` /
`weakAutoPipBrowserToParent`. Later AutoToggle attempts then hit
`skip-already-pip` forever. Always remove those entries (prefer
`PictureInPicture.closeSinglePipWindow` with reason `Unpip`) before closing.

## Logging

`autofocus …` lines in `~/Library/Logs/zen-pip-scripts.log`.
