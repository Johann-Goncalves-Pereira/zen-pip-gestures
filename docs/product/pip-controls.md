# PiP player controls overlay

**Status:** shipped

## Goal

In Zen’s Picture-in-Picture window
(`chrome://global/content/pictureinpicture/player.xhtml`), show only the
Back-to-Tab control (`#unpip`) as a standalone white icon with a drop shadow in
the top-left corner. Hide close, minimize, and the entire bottom transport
overlay so the video stays uncluttered.

## Hide

These nodes are never shown while the traffic-lights / controls companion CSS is
active:

| Selector | Role |
| -------- | ---- |
| `#close` | In-player close |
| `#minimize` | In-player minimize |
| `#controls-bottom` | Seek + play/pause + volume row |
| `#controls-bottom-gradient` | Fade behind the bottom row |

Each uses `display: none !important`.

## Back-to-Tab (`#unpip`)

| Concern | Rule |
| ------- | ---- |
| Position | `left: 10px`, `right: auto`, `top: 10px` (overrides macOS `#unpip[mac="true"]`) |
| Background | Transparent (no light square chrome) |
| Icon | White fill / color (`#ffffff`, `fill-opacity: 1`) |
| Depth | `filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.75))`; elevated shadow on hover/focus |
| SVG fill | `-moz-context-properties: fill, fill-opacity` so white fill applies to the icon |

```mermaid
flowchart LR
  before["Busy overlay: close minimize bottom bar unpip top-right"] --> after["Only white unpip top-left with drop shadow"]
```

## Sources of truth

| File | Role |
| ---- | ---- |
| `chrome/CSS/zen-pip-no-traffic-lights.uc.css` | **Primary** — fx-autoconfig author sheet (`@include` player.xhtml). Bypasses PiP CSP. |
| `chrome/CSS/zen-pip-no-traffic-lights.css` | Mirror for docs/tests / embed sync (not loaded by fx-autoconfig; only `*.uc.css` is) |
| `chrome/JS/zen-pip-no-traffic-lights.uc.js` | Cocoa buttonbox hide + `windowUtils.loadSheetUsingURI` backup for `INLINE_CSS` |

### Why not a DOM `<style>` tag?

`player.xhtml` ships `Content-Security-Policy: default-src chrome:`. An inline
`<style>` appended by UC.js is ignored, which is why close / minimize / the
bottom bar kept showing after a plain file copy. Author sheets loaded through
fx-autoconfig (or `loadSheetUsingURI`) are not subject to that CSP.

### PiP-only — never main Zen

- `.uc.css` header must end with `==/UserScript==*/`. An unclosed
  `/* ==UserScript==` header drops `@include` and fx-autoconfig falls back to
  **browser.xhtml**, which can hide titlebars / break the main window.
- Every selector is gated with
  `html[windowtype="Toolkit:PictureInPicture"]`.
- UC.js injects with `AUTHOR_SHEET` only (not `AGENT_SHEET`).
- Deploy by copying profile `chrome/` files; **do not** quit Zen or run the
  full installer just to refresh PiP CSS — close and reopen the PiP window.

Do **not** set `background:` shorthand or `background-image: none` on `#unpip`
— the glyph is a `background-image` SVG; only clear `background-color`.

`./scripts/validate` rsyncs `chrome/` into `internal/assets/chrome/` for the
installer embed.

Pref gate for the script remains `zen.pip.hideTrafficLights.enabled`
(default `true`).
