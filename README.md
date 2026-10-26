# 🖼️ Zen PiP gestures (Arc-like) ✨

Trackpad gestures for Zen Browser’s Picture-in-Picture — like Arc:

| Gesture | What it does |
|---|---|
| 👆👆 **Two-finger swipe** on the PiP | 🚚 Moves the window |
| 🤏 **Pinch** on the PiP | 🔍 Resizes around the center |
| 🚪 Leave Zen / switch Space | 📺 Can auto-PiP the playing video |
| 🔴🟡🟢 Traffic lights | 🙈 Hidden on the PiP window |

Works via [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) (userChromeJS). **No Zen rebuild.** 🛠️❌

Inspired by [zen-browser/desktop#15905](https://github.com/zen-browser/desktop/pull/15905) / [discussion #9002](https://github.com/zen-browser/desktop/discussions/9002).

---

## ✅ Requirements

- 🍎 **macOS** (Apple Silicon or Intel)
- 🌐 **Zen Browser** already installed (from [zen-browser.app](https://zen-browser.app))
- 💻 Terminal access (you will paste one command)
- 📡 Internet (installer downloads fx-autoconfig)

---

## 🚀 Install (one command)

The one-liner downloads a **Charm TUI** binary from [GitHub Releases](https://github.com/Johann-Goncalves-Pereira/zen-pip-gestures/releases) and walks you through checks, profile pickers, and common-error recovery.

1. 🖥️ Open **Terminal**.
2. 📋 Paste:

```bash
curl -fsSL https://raw.githubusercontent.com/Johann-Goncalves-Pereira/zen-pip-gestures/main/install.sh | bash
```

3. Follow the TUI:
   - If Zen is missing → shows official install (`brew install --cask zen-browser` / [zen-browser.app](https://zen-browser.app)) and asks to retry
   - ✅ Checkbox list of Zen **profiles** to patch
   - ✅ Toggles for pan / pinch / Space auto-PiP / hide traffic lights
   - On any step failure → **Common error** help + Retry / Skip / Abort
4. 🧹 In Zen: **Help → More Troubleshooting Information → Clear startup cache…**
5. ▶️ Video → PiP → two-finger drag / pinch

### 🧰 Contributors (from a clone)

```bash
mkdir -p ~/Developer/programs
git clone https://github.com/Johann-Goncalves-Pereira/zen-pip-gestures.git ~/Developer/programs/zen-pip-gestures
cd ~/Developer/programs/zen-pip-gestures
go run ./cmd/install
# or: ./scripts/validate && go build -o zen-pip-install ./cmd/install
```

First release / no binary yet? Use `go run ./cmd/install` until a `v*` tag has been published.

---

## 🪄 What the installer does (so you’re not scared)

1. 👋 Quits Zen (asks first).
2. 📦 Copies Zen → **`~/Applications/Zen.app`** (SIP-safe).
3. 🔌 Installs **fx-autoconfig** into that copy.
4. 🔏 Ad-hoc codesigns the app.
5. 📁 Installs scripts into the **profiles you selected**.
6. ⚙️ Writes feature prefs to each profile’s `user.js`.
7. 🛰️ Installs the auto-repatch LaunchAgent.

**👉 After install, open `~/Applications/Zen.app`** (unless you symlink `/Applications` — see below).

---

## ⚠️ Warnings

| | Warning | Why it matters |
|---|---|---|
| 🛰️ | **Auto-repatch is on after install** | A LaunchAgent re-patches when Zen updates wipe `config.js`. Still quit & reopen Zen (and clear startup cache if gestures stay dead). |
| 🎯 | **Launch the patched app** | `/Applications/Zen.app` will **not** have gestures if you only patched `~/Applications`. |
| 🧹 | **Clear startup cache once** | Without this, old chrome cache may ignore new scripts. |
| 🧪 | **This is unofficial** | Not affiliated with Zen. UserChromeJS can break after Zen updates. |
| 🔒 | **Security** | You are loading privileged JS into the browser chrome. Only install from this repo (or a fork you trust). |
| 💾 | **Backup** | Your profile data stays put, but quitting Zen mid-work loses unsaved page state. |

### 🔗 Optional: make `/Applications/Zen` point at the patched copy

```bash
sudo rm -rf /Applications/Zen.app
sudo ln -s "$HOME/Applications/Zen.app" /Applications/Zen.app
```

Then Dock / Spotlight / “Zen” all open the patched build. ✨

---

## 🧪 Test that it works

1. ▶️ YouTube → PiP button.
2. 👆👆 Two-finger swipe on the trackpad **over the PiP** → window moves.
3. 🤏 Pinch → grows/shrinks, stays on screen, keeps aspect ratio.
4. ⏯️ Play / scrub / volume / close still work.
5. 🖱️ Cursor should stay **inside** the PiP (and stay hidden) while you gesture.

---

## 🎛️ Prefs (toggles)

In Zen address bar open `about:config`, search `zen.pip`, flip any toggle:

| Feature | Pref | Default |
|---|---|---|
| 👆👆 Two-finger swipe (move PiP) | `zen.pip.gestures.pan.enabled` | `true` ✅ |
| 🤏 Pinch (resize PiP) | `zen.pip.gestures.pinch.enabled` | `true` ✅ |
| 🚪 Leave Zen / switch Space (auto-PiP) | `zen.pip.autoSpace.enabled` | `true` ✅ |
| 🔴🟡🟢 Hide traffic lights on PiP | `zen.pip.hideTrafficLights.enabled` | `true` ✅ |

Extra / size:

| Pref | Default | Meaning |
|---|---|---|
| `zen.pip.trackpadGestures.enabled` | `true` ✅ | Master — `false` disables **both** pan and pinch |
| `zen.pip.gestures.minWidth` | `200` 📏 | Smallest PiP width (px) |
| `zen.pip.gestures.maxWidth` | `900` 📐 | Largest PiP width (px) |
| `media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled` | `true` ✅ | Built-in auto-PiP on tab switch (also required for Space auto-PiP) |

After flipping a toggle, reopen the PiP window (or restart Zen) so it takes effect.

---

## 🔄 Update

Paste the same `curl … | bash` one-liner again (fetches the newest Release binary), or:

```bash
cd ~/Developer/programs/zen-pip-gestures
git pull
go run ./cmd/install
```

Then: open `~/Applications/Zen.app` → **Clear startup cache** once. 🧹

### Publish a new installer binary (maintainers)

```bash
git tag v0.1.0
git push origin v0.1.0
# GitHub Actions builds darwin arm64/amd64 and attaches them to the release
```

---

## 🗑️ Uninstall

```bash
# 0. Stop auto-repatch
~/Developer/programs/zen-pip-gestures/scripts/uninstall-launch-agent.sh

# 1. Remove scripts from your profile
PROFILE="$HOME/Library/Application Support/zen/Profiles/YOUR_PROFILE"
rm -f "$PROFILE/chrome/JS/zen-pip-"*.uc.js
rm -f "$PROFILE/chrome/CSS/zen-pip-"*.css

# 2. Optional — remove fx-autoconfig loader from the patched app
rm -f "$HOME/Applications/Zen.app/Contents/Resources/config.js"
rm -f "$HOME/Applications/Zen.app/Contents/Resources/defaults/pref/config-prefs.js"

# 3. Optional — delete the patched copy and use stock Zen again
# rm -rf "$HOME/Applications/Zen.app"
```

Replace `YOUR_PROFILE` with the folder from `about:support` → Profile Folder. 📂

---

## 🩺 Troubleshooting

### 🤷 Gestures do nothing

1. ✅ Confirm you launched **`~/Applications/Zen.app`**:
   ```bash
   ls ~/Applications/Zen.app/Contents/Resources/config.js
   ```
   If that file is missing, run `./install.sh` again.
2. 🧹 **Help → More Troubleshooting Information → Clear startup cache…**
3. 📜 Check scripts exist:
   ```bash
   ls "$HOME/Library/Application Support/zen/Profiles/"*/chrome/JS/zen-pip-*.uc.js
   ```
4. 🔌 Check loader exists in the **active** profile:
   ```bash
   ls "$HOME/Library/Application Support/zen/Profiles/"*/chrome/utils/boot.sys.mjs
   ```
5. 🎛️ `about:config` → check `zen.pip.gestures.pan.enabled` / `zen.pip.gestures.pinch.enabled` (and master `zen.pip.trackpadGestures.enabled`) are `true`.

### 🚫 Zen won’t open / “damaged” / Gatekeeper

```bash
xattr -cr ~/Applications/Zen.app
codesign --force --deep --sign - ~/Applications/Zen.app
open ~/Applications/Zen.app
```

If macOS still blocks: **System Settings → Privacy & Security** → allow Zen, or right-click the app → **Open**. 🛡️

### 📁 Installer says it can’t find the profile

1. Open Zen once (stock is fine) so a profile is created. 🌱
2. Go to `about:support` → **Profile Folder** → Open Folder.
3. Copy that path and run:
   ```bash
   ZEN_PIP_PROFILE="/paste/the/full/path/here" ~/Developer/programs/zen-pip-gestures/install.sh
   ```

### 🔒 “Operation not permitted” / can’t write `/Applications`

Expected 🙂. This project **never** requires writing into SIP-protected `/Applications`. Use the `~/Applications` copy the installer creates.

### 💔 Works, then breaks after a Zen update

**Usually automatic now.** `./install.sh` installs a LaunchAgent (`com.zen-pip-gestures.repatch`) that watches Zen.app. When an update wipes `config.js`, it re-patches and shows a macOS notification.

Then: **quit & reopen Zen**. If gestures still fail → **Clear startup cache**.

Manual fallback:

```bash
cd ~/Developer/programs/zen-pip-gestures && git pull && ./install.sh
# or just:
~/Developer/programs/zen-pip-gestures/scripts/repatch-on-update.sh
```

Disable auto-repatch:

```bash
~/Developer/programs/zen-pip-gestures/scripts/uninstall-launch-agent.sh
```

Re-enable:

```bash
~/Developer/programs/zen-pip-gestures/scripts/install-launch-agent.sh
```

Logs: `~/Library/Logs/zen-pip-gestures.log`

### 👻 Cursor visible / escapes the PiP while dragging

Re-install the latest scripts (`git pull && ./install.sh`) and clear startup cache. Older builds pinned the cursor only once; current builds re-center and hide via macOS `NSCursor`.

### 🚦 Traffic lights (red/yellow/green) still show on PiP

Clear startup cache. Confirm:

```bash
ls "$HOME/Library/Application Support/zen/Profiles/"*/chrome/JS/zen-pip-no-traffic-lights.uc.js
ls "$HOME/Library/Application Support/zen/Profiles/"*/chrome/CSS/zen-pip-no-traffic-lights.css
```

### 🚪 Auto-PiP on Space / app switch doesn’t fire

That’s best-effort. Built-in tab-switch PiP is controlled by:

`media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled`

Gestures (pan/pinch) do not depend on auto-PiP. 👍

### 🧑‍💻 How to see chrome errors (advanced)

1. `about:config` → `devtools.chrome.enabled` = `true`  
   and `devtools.debugger.remote-enabled` = `true`
2. DevTools settings (F1) → enable **browser chrome and add-on debugging toolboxes**
3. **Tools → Browser Tools → Browser Toolbox** (`Cmd+Opt+Shift+I`)
4. Look for errors mentioning `zen-pip` or `autoconfig` 🔎

---

## 🧯 Common errors

| Error / symptom | Cause | Fix |
|---|---|---|
| ❌ `Zen.app not found…` | Zen not installed | Install Zen, then re-run installer 🌐 |
| ❌ `Could not find your Zen profile` | Never opened Zen / wrong profile | Open Zen once; pass `ZEN_PIP_PROFILE=…` 📁 |
| 📡 `Could not download fx-autoconfig` | No network / GitHub blocked | Check internet; retry 🔄 |
| 📦 `Failed to unpack fx-autoconfig` | Bad zip / disk full | Retry; free disk space 💾 |
| 🔏 `codesign` fails | Rare toolchain issue | `xcode-select --install` 🧰 |
| 🤷 Gestures missing but no error | Opened stock `/Applications` Zen | `open ~/Applications/Zen.app` 🎯 |
| 💔 Gestures missing after update | App bundle replaced | Wait for notification / run `scripts/repatch-on-update.sh`, then reopen Zen + clear startup cache 🧹 |
| 🔗 `curl: (22) … 404` on install URL | Typo / repo renamed | Use clone Option B 🧰 |
| 👻 PiP moves but cursor leaves window | Outdated script | `git pull && ./install.sh` 🔄 |
| 🚫 macOS says app is damaged | Quarantine / signature | `xattr -cr` + `codesign` above 🛡️ |

---

## 📂 Project layout

```text
zen-pip-gestures/
  install.sh                          ← 🚀 curl bootstrap (downloads Release binary)
  cmd/install/                        ← 🖥️ Charm TUI (Huh + Lip Gloss)
  internal/install/                   ← 🧩 patch / profiles / prefs logic
  internal/assets/                    ← 📦 embedded chrome + scripts (go:embed)
  scripts/
    validate                          ← ✅ gofmt + vet + test
    repatch-on-update.sh              ← 🛰️ auto-fix after Zen updates
    install-launch-agent.sh           ← enable auto-repatch
  chrome/                             ← source of truth for PiP scripts
  docs/                               ← wiki
```

Wiki: [`docs/README.md`](docs/README.md)

---

## 📄 License

MIT — see [LICENSE](LICENSE). ⚖️
