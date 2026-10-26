// ==UserScript==
// @name           Zen PiP auto when content leaves view
// @description    Auto-PiP on tab switch, Space/desktop change, Stage Manager — not Raycast/menu bar
// @include        main
// ==/UserScript==

/**
 * Triggers:
 *  1. TabSelect — leave a tab that had a playing video
 *  2. Window deactivate — another desktop / Stage Manager / other app
 *     (skips Raycast, Spotlight, status-bar / Control Center overlays)
 *  3. occlusionstatechange / minimize — when the API reports not visible
 *
 * Pref: zen.pip.autoSpace.enabled (default true)
 */
(function () {
  "use strict";

  function mark(msg) {
    try {
      const f = Cc["@mozilla.org/file/directory_service;1"]
        .getService(Ci.nsIProperties)
        .get("Home", Ci.nsIFile);
      f.append("Library");
      f.append("Logs");
      if (!f.exists()) {
        f.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
      }
      f.append("zen-pip-scripts.log");
      const fos = Cc[
        "@mozilla.org/network/file-output-stream;1"
      ].createInstance(Ci.nsIFileOutputStream);
      fos.init(f, 0x02 | 0x08 | 0x10, 0o644, 0);
      const line = `autofocus ${msg} ${new Date().toISOString()}\n`;
      fos.write(line, line.length);
      fos.close();
    } catch (_) {
      /* ignore */
    }
  }

  mark("start");

  const PIP_ENABLED = "media.videocontrols.picture-in-picture.enabled";
  const PIP_SWITCH_TABS =
    "media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled";
  const PREF_AUTO_SPACE = "zen.pip.autoSpace.enabled";
  const PREF_ONLY_ONE = "zen.pip.onlyOne.enabled";
  const SETTLE_MS = 200;

  /** Frontmost apps that keep Zen visible underneath — do not auto-PiP. */
  const OVERLAY_BUNDLE_IDS = [
    "com.raycast.macos",
    "com.apple.Spotlight",
    "com.apple.systemuiserver",
    "com.apple.controlcenter",
    "com.apple.notificationcenterui",
    "com.apple.TextInputMenuAgent",
    "com.apple.TextInputUI.xpc",
    "com.apple.UserNotificationCenter",
    "com.runningwithcrayons.Alfred",
    "com.runningwithcrayons.Alfred-Preferences",
  ];

  /** @type {WeakSet<object>} */
  const openedByUs = new WeakSet();

  let PictureInPicture = null;
  for (const uri of [
    "moz-src:///toolkit/components/pictureinpicture/PictureInPicture.sys.mjs",
    "resource://gre/modules/PictureInPicture.sys.mjs",
  ]) {
    try {
      PictureInPicture = ChromeUtils.importESModule(uri).PictureInPicture;
      mark("pip-module=" + uri);
      break;
    } catch (ex) {
      mark("pip-miss=" + uri);
    }
  }

  let settleTimer = 0;
  let lastSelectedBrowser = null;
  let macFrontmost = null;

  function prefsAllow() {
    try {
      return (
        Services.prefs.getBoolPref(PREF_AUTO_SPACE, true) &&
        Services.prefs.getBoolPref(PIP_ENABLED, false)
      );
    } catch (_) {
      return false;
    }
  }

  function onlyOneEnabled() {
    try {
      return Services.prefs.getBoolPref(PREF_ONLY_ONE, true);
    } catch (_) {
      return true;
    }
  }

  /** Close every open PiP so a new AutoToggle can replace it (Arc-like). */
  function closeAllPips() {
    try {
      if (window.ZenPipOnlyOne?.closeAll) {
        window.ZenPipOnlyOne.closeAll();
        return;
      }
    } catch (_) {
      /* fall through */
    }
    try {
      for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) {
        if (win && !win.closed) {
          win.close();
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  function ensureTabSwitchPref() {
    try {
      Services.prefs.setBoolPref(PIP_SWITCH_TABS, true);
    } catch (_) {
      /* ignore */
    }
  }

  function getFrontmostBundleId() {
    if (macFrontmost === false) {
      return "";
    }
    try {
      if (Services.appinfo.OS !== "Darwin") {
        macFrontmost = false;
        return "";
      }
      if (!macFrontmost) {
        const { ctypes } = ChromeUtils.importESModule(
          "resource://gre/modules/ctypes.sys.mjs"
        );
        const libobjc = ctypes.open(ctypes.libraryName("objc"));
        const sel_registerName = libobjc.declare(
          "sel_registerName",
          ctypes.default_abi,
          ctypes.voidptr_t,
          ctypes.char.ptr
        );
        const objc_getClass = libobjc.declare(
          "objc_getClass",
          ctypes.default_abi,
          ctypes.voidptr_t,
          ctypes.char.ptr
        );
        const objc_msgSend = libobjc.declare(
          "objc_msgSend",
          ctypes.default_abi,
          ctypes.voidptr_t,
          ctypes.voidptr_t,
          ctypes.voidptr_t
        );
        const objc_msgSend_str = libobjc.declare(
          "objc_msgSend",
          ctypes.default_abi,
          ctypes.char.ptr,
          ctypes.voidptr_t,
          ctypes.voidptr_t
        );
        macFrontmost = {
          sharedWorkspace: sel_registerName("sharedWorkspace"),
          frontmostApplication: sel_registerName("frontmostApplication"),
          bundleIdentifier: sel_registerName("bundleIdentifier"),
          UTF8String: sel_registerName("UTF8String"),
          NSWorkspace: objc_getClass("NSWorkspace"),
          msgSend: objc_msgSend,
          msgSendStr: objc_msgSend_str,
        };
      }
      const api = macFrontmost;
      const ws = api.msgSend(api.NSWorkspace, api.sharedWorkspace);
      const app = api.msgSend(ws, api.frontmostApplication);
      if (!app || app.isNull()) {
        return "";
      }
      const ns = api.msgSend(app, api.bundleIdentifier);
      if (!ns || ns.isNull()) {
        return "";
      }
      const cstr = api.msgSendStr(ns, api.UTF8String);
      return cstr && !cstr.isNull() ? cstr.readString() : "";
    } catch (ex) {
      mark("frontmost-fail:" + ex);
      macFrontmost = false;
      return "";
    }
  }

  function isOverlayFrontmost() {
    const id = getFrontmostBundleId();
    if (!id) {
      return false;
    }
    return OVERLAY_BUNDLE_IDS.some(
      (b) => id === b || id.startsWith(b + ".") || id.startsWith(b)
    );
  }

  function windowNotVisible(chromeWin) {
    try {
      if (chromeWin.closed) {
        return true;
      }
      if (chromeWin.windowState === chromeWin.STATE_MINIMIZED) {
        return true;
      }
      if (chromeWin.isFullyOccluded) {
        return true;
      }
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function isPipWindow(win) {
    try {
      return (
        win &&
        !win.closed &&
        win.document?.documentElement?.getAttribute("windowtype") ===
          "Toolkit:PictureInPicture"
      );
    } catch (_) {
      return false;
    }
  }

  function anyPipOpen() {
    try {
      for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) {
        if (win && !win.closed) {
          return true;
        }
      }
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function browserAlreadyHasPip(browser) {
    try {
      if (PictureInPicture?.browserWeakMap?.has(browser)) {
        return true;
      }
      if (PictureInPicture?.weakAutoPipBrowserToParent?.has(browser)) {
        return true;
      }
      if (PictureInPicture?.weakWinToBrowser) {
        for (const win of Services.wm.getEnumerator(
          "Toolkit:PictureInPicture"
        )) {
          if (PictureInPicture.weakWinToBrowser.get(win) === browser) {
            return true;
          }
        }
      }
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function getSelectedBrowser(chromeWin) {
    try {
      return chromeWin.gBrowser?.selectedBrowser || null;
    } catch (_) {
      return null;
    }
  }

  function closePipForBrowser(browser) {
    if (PictureInPicture?.weakAutoPipBrowserToParent?.has(browser)) {
      try {
        PictureInPicture.closeSinglePipWindow({
          reason: "Foregrounded",
          actorRef: PictureInPicture.weakAutoPipBrowserToParent.get(browser),
        });
        return true;
      } catch (_) {
        /* fall through */
      }
    }
    try {
      for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) {
        if (win && !win.closed) {
          win.close();
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function tryAutoPipForBrowser(chromeWin, browser, reason) {
    if (!prefsAllow()) {
      mark("skip-prefs");
      return;
    }
    if (!browser) {
      mark("skip-no-browser:" + reason);
      return;
    }
    if (browserAlreadyHasPip(browser)) {
      mark("skip-already-pip:" + reason);
      return;
    }
    // Arc-like: replace any other PiP instead of stacking or skipping.
    if (anyPipOpen()) {
      if (!onlyOneEnabled()) {
        mark("skip-already-pip:" + reason);
        return;
      }
      closeAllPips();
      mark("replaced-other-pip:" + reason);
    }

    const wgp = browser.browsingContext?.currentWindowGlobal;
    if (!wgp) {
      mark("skip-no-wgp:" + reason);
      return;
    }

    let actor;
    try {
      actor = wgp.getActor("PictureInPictureLauncher");
    } catch (ex) {
      mark("skip-no-actor:" + ex);
      return;
    }
    if (!actor) {
      mark("skip-actor-null:" + reason);
      return;
    }

    const wasActive = !!browser.docShellIsActive;
    try {
      browser.docShellIsActive = false;
      actor.sendAsyncMessage("PictureInPicture:AutoToggle");
      mark("autotoggle-sent:" + reason);
    } catch (ex) {
      mark("autotoggle-fail:" + ex);
      try {
        browser.docShellIsActive = wasActive;
      } catch (_) {
        /* ignore */
      }
      return;
    }

    await new Promise((r) => chromeWin.setTimeout(r, 500));
    if (anyPipOpen()) {
      openedByUs.add(browser);
      mark("opened:" + reason);
    } else if (wasActive) {
      try {
        browser.docShellIsActive = true;
      } catch (_) {
        /* ignore */
      }
      mark("no-pip:" + reason);
    }
  }

  function unpipIfOurs(chromeWin, reason) {
    if (!prefsAllow()) {
      return;
    }
    const browser = getSelectedBrowser(chromeWin);
    if (!browser || !openedByUs.has(browser)) {
      return;
    }
    closePipForBrowser(browser);
    openedByUs.delete(browser);
    mark("closed:" + reason);
  }

  function afterDeactivate(chromeWin) {
    if (!prefsAllow()) {
      return;
    }
    if (isPipWindow(Services.focus.activeWindow)) {
      mark("skip-focus-pip");
      return;
    }
    // Focus bounced back to Zen (transient).
    try {
      if (
        !chromeWin.closed &&
        (chromeWin.document.hasFocus() ||
          Services.focus.activeWindow === chromeWin)
      ) {
        mark("skip-focus-returned");
        return;
      }
    } catch (_) {
      /* ignore */
    }
    if (isOverlayFrontmost()) {
      mark("skip-overlay:" + getFrontmostBundleId());
      return;
    }
    // Space / Stage Manager / other app — content no longer what user is looking at.
    tryAutoPipForBrowser(
      chromeWin,
      getSelectedBrowser(chromeWin),
      "deactivate"
    );
  }

  function onOcclusionOrSize(chromeWin) {
    if (windowNotVisible(chromeWin)) {
      tryAutoPipForBrowser(
        chromeWin,
        getSelectedBrowser(chromeWin),
        "occluded"
      );
    } else {
      unpipIfOurs(chromeWin, "visible");
    }
  }

  function schedule(chromeWin, fn) {
    if (settleTimer) {
      chromeWin.clearTimeout(settleTimer);
    }
    settleTimer = chromeWin.setTimeout(() => {
      settleTimer = 0;
      fn();
    }, SETTLE_MS);
  }

  // --- Tab switch (video leaves the selected tab) ---
  function bindTabSelect(chromeWin) {
    const gBrowser = chromeWin.gBrowser;
    if (!gBrowser?.tabContainer) {
      return;
    }
    lastSelectedBrowser = getSelectedBrowser(chromeWin);
    gBrowser.tabContainer.addEventListener("TabSelect", () => {
      const prev = lastSelectedBrowser;
      lastSelectedBrowser = getSelectedBrowser(chromeWin);
      if (prev && prev !== lastSelectedBrowser) {
        tryAutoPipForBrowser(chromeWin, prev, "tab-switch");
      }
      // Returning to a tab we auto-PiP'd → close that PiP.
      if (
        lastSelectedBrowser &&
        openedByUs.has(lastSelectedBrowser) &&
        !windowNotVisible(chromeWin)
      ) {
        unpipIfOurs(chromeWin, "tab-back");
      }
    });
  }

  // --- Focus leave (desktop / Stage Manager / other app) ---
  window.addEventListener("deactivate", (event) => {
    const chromeWin = event.currentTarget;
    schedule(chromeWin, () => afterDeactivate(chromeWin));
  });
  window.addEventListener("activate", (event) => {
    const chromeWin = event.currentTarget;
    schedule(chromeWin, () => {
      if (!windowNotVisible(chromeWin)) {
        unpipIfOurs(chromeWin, "activate");
      }
    });
  });

  // --- Occlusion / minimize (when the platform reports it) ---
  window.addEventListener("occlusionstatechange", (event) => {
    schedule(event.currentTarget, () => onOcclusionOrSize(event.currentTarget));
  });
  window.addEventListener("sizemodechange", (event) => {
    schedule(event.currentTarget, () => onOcclusionOrSize(event.currentTarget));
  });

  ensureTabSwitchPref();
  if (window.gBrowser) {
    bindTabSelect(window);
  } else {
    window.addEventListener(
      "DOMContentLoaded",
      () => bindTabSelect(window),
      { once: true }
    );
  }

  mark("ready prefs=" + prefsAllow());
})();
