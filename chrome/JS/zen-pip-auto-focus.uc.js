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

  let logStream = null;

  function openLogStream() {
    if (logStream) {
      return logStream;
    }
    const f = Cc["@mozilla.org/file/directory_service;1"]
      .getService(Ci.nsIProperties)
      .get("Home", Ci.nsIFile);
    f.append("Library");
    f.append("Logs");
    if (!f.exists()) {
      f.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
    }
    f.append("zen-pip-scripts.log");
    const fos = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
      Ci.nsIFileOutputStream
    );
    // PR_WRONLY | PR_CREATE_FILE | PR_APPEND. Held for the session.
    fos.init(f, 0x02 | 0x08 | 0x10, 0o644, 0);
    logStream = fos;
    return logStream;
  }

  function mark(msg) {
    try {
      const fos = openLogStream();
      const line = `autofocus ${msg} ${new Date().toISOString()}\n`;
      fos.write(line, line.length);
    } catch (_) {
      logStream = null;
    }
  }

  mark("start");

  const PIP_ENABLED = "media.videocontrols.picture-in-picture.enabled";
  const PIP_SWITCH_TABS =
    "media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled";
  const PREF_AUTO_SPACE = "zen.pip.autoSpace.enabled";
  const PREF_ONLY_ONE = "zen.pip.onlyOne.enabled";
  const SETTLE_MS = 200;
  const PIP_CLEAR_CAP_MS = 200;
  const PIP_OPEN_CAP_MS = 700;

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
  /** @type {{ gen: number, browser: object|null }} */
  const attempt = { gen: 0, browser: null };
  /** @type {Promise<void>|null} */
  let inFlight = null;

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
      for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) {
        if (win && !win.closed) {
          closePipWindowClean(win);
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

  function isOverlayBundle(id) {
    if (!id) {
      return false;
    }
    return OVERLAY_BUNDLE_IDS.some(
      (b) => id === b || id.startsWith(b + ".") || id.startsWith(b)
    );
  }

  function stillCurrent(gen) {
    return gen === attempt.gen;
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

  /** Live PiP player window still mapped to this browser (not a stale WeakMap). */
  function livePipWindowForBrowser(browser) {
    if (!browser || !PictureInPicture?.weakWinToBrowser) {
      return null;
    }
    try {
      for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) {
        if (win && !win.closed && PictureInPicture.weakWinToBrowser.get(win) === browser) {
          return win;
        }
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function browserAlreadyHasPip(browser) {
    return !!livePipWindowForBrowser(browser);
  }

  /**
   * Raw `win.close()` leaves browserWeakMap / weakAutoPipBrowserToParent dirty,
   * so later AutoToggle attempts stick on skip-already-pip. Prefer Firefox's
   * closeSinglePipWindow; otherwise scrub maps then close.
   */
  function closePipWindowClean(win) {
    if (!win || win.closed) {
      return;
    }
    try {
      const browser = PictureInPicture?.weakWinToBrowser?.get(win);
      if (browser && PictureInPicture) {
        const actor =
          PictureInPicture.weakAutoPipBrowserToParent?.get(browser) || null;
        if (actor) {
          // "Unpip" is not a deliberate-close reason (won't suppress auto-PiP).
          PictureInPicture.closeSinglePipWindow({
            reason: "Unpip",
            actorRef: actor,
          });
          return;
        }
        try {
          PictureInPicture.removePiPBrowserFromWeakMap?.(browser);
        } catch (_) {
          /* ignore */
        }
        try {
          PictureInPicture.weakAutoPipBrowserToParent?.delete(browser);
        } catch (_) {
          /* ignore */
        }
      }
    } catch (_) {
      /* fall through to close */
    }
    try {
      win.close();
    } catch (_) {
      /* ignore */
    }
  }

  function clearStalePipMaps(browser) {
    if (!browser || !PictureInPicture) {
      return;
    }
    try {
      if (PictureInPicture.browserWeakMap?.has(browser)) {
        PictureInPicture.browserWeakMap.delete(browser);
      }
    } catch (_) {
      /* ignore */
    }
    try {
      PictureInPicture.weakAutoPipBrowserToParent?.delete(browser);
    } catch (_) {
      /* ignore */
    }
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
    const live = livePipWindowForBrowser(browser);
    if (live) {
      closePipWindowClean(live);
      return true;
    }
    clearStalePipMaps(browser);
    return false;
  }

  function waitForWindowSignal(chromeWin, gen, capMs, topic, ready) {
    if (!stillCurrent(gen)) {
      return Promise.resolve(false);
    }
    if (ready()) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const observer = {
        observe(_subject, observedTopic) {
          if (settled || observedTopic !== topic) {
            return;
          }
          if (!stillCurrent(gen)) {
            finish(false);
            return;
          }
          if (ready()) {
            finish(true);
          }
        },
      };
      function finish(ok) {
        if (settled) {
          return;
        }
        settled = true;
        try {
          Services.ww.unregisterNotification(observer);
        } catch (_) {
          /* observer already removed */
        }
        if (timer) {
          chromeWin.clearTimeout(timer);
        }
        resolve(ok);
      }
      try {
        Services.ww.registerNotification(observer);
      } catch (ex) {
        mark("ww-listen-fail:" + ex);
        resolve(false);
        return;
      }
      timer = chromeWin.setTimeout(() => {
        finish(stillCurrent(gen) && ready());
      }, capMs);
    });
  }

  function waitUntilNoPip(chromeWin, gen) {
    return waitForWindowSignal(
      chromeWin,
      gen,
      PIP_CLEAR_CAP_MS,
      "domwindowclosed",
      () => !anyPipOpen()
    );
  }

  function waitForPipOpen(chromeWin, browser, gen) {
    const ready = () => anyPipOpen() || !!livePipWindowForBrowser(browser);
    if (!stillCurrent(gen)) {
      return Promise.resolve(false);
    }
    if (ready()) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const observer = {
        observe(subject, observedTopic) {
          if (settled || observedTopic !== "domwindowopened") {
            return;
          }
          const win = subject;
          const check = () => {
            if (settled) {
              return;
            }
            if (!stillCurrent(gen)) {
              finish(false);
              return;
            }
            if (ready() || isPipWindow(win)) {
              finish(true);
            }
          };
          try {
            if (win?.document?.readyState === "loading") {
              win.addEventListener("DOMContentLoaded", check, { once: true });
              return;
            }
          } catch (_) {
            /* window went away before we could listen */
          }
          check();
        },
      };
      function finish(ok) {
        if (settled) {
          return;
        }
        settled = true;
        try {
          Services.ww.unregisterNotification(observer);
        } catch (_) {
          /* observer already removed */
        }
        if (timer) {
          chromeWin.clearTimeout(timer);
        }
        resolve(ok);
      }
      try {
        Services.ww.registerNotification(observer);
      } catch (ex) {
        mark("ww-listen-fail:" + ex);
        resolve(false);
        return;
      }
      timer = chromeWin.setTimeout(() => {
        finish(stillCurrent(gen) && ready());
      }, PIP_OPEN_CAP_MS);
    });
  }

  function requestAutoPip(chromeWin, browser, reason) {
    const gen = ++attempt.gen;
    attempt.browser = browser;
    const run = tryAutoPipForBrowser(chromeWin, browser, reason, gen).catch(
      (ex) => {
        mark("attempt-fail:" + ex);
      }
    );
    inFlight = run;
    run.finally(() => {
      if (inFlight === run) {
        inFlight = null;
      }
    });
  }

  async function tryAutoPipForBrowser(chromeWin, browser, reason, gen) {
    if (!prefsAllow()) {
      mark("skip-prefs");
      return;
    }
    if (!browser) {
      mark("skip-no-browser:" + reason);
      return;
    }

    // Stale maps after a raw win.close() look like "already pip" with no window.
    if (!livePipWindowForBrowser(browser)) {
      if (
        PictureInPicture?.browserWeakMap?.has(browser) ||
        PictureInPicture?.weakAutoPipBrowserToParent?.has(browser)
      ) {
        clearStalePipMaps(browser);
        mark("cleared-stale:" + reason);
      }
    } else {
      mark("skip-already-pip:" + reason);
      return;
    }

    // Arc-like: replace any other PiP instead of stacking or skipping.
    if (anyPipOpen()) {
      if (!onlyOneEnabled()) {
        mark("skip-other-pip:" + reason);
        return;
      }
      closeAllPips();
      mark("replaced-other-pip:" + reason);
      const cleared = await waitUntilNoPip(chromeWin, gen);
      if (!stillCurrent(gen)) {
        mark("stale:" + reason);
        return;
      }
      if (!cleared) {
        mark("pip-clear-cap:" + reason);
      }
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

    // Do NOT set docShellIsActive=false before AutoToggle. That can pause the
    // video before the child's videoIsPlaying check (esp. Space/deactivate).
    if (!stillCurrent(gen)) {
      mark("stale:" + reason);
      return;
    }

    try {
      actor.sendAsyncMessage("PictureInPicture:AutoToggle");
      mark("autotoggle-sent:" + reason);
    } catch (ex) {
      mark("autotoggle-fail:" + ex);
      return;
    }

    const opened = await waitForPipOpen(chromeWin, browser, gen);
    if (!stillCurrent(gen)) {
      mark("stale:" + reason);
      return;
    }
    if (opened) {
      openedByUs.add(browser);
      mark("opened:" + reason);
      return;
    }

    // One retry — first pass can race tab freeze / Space animation.
    try {
      actor.sendAsyncMessage("PictureInPicture:AutoToggle");
      mark("autotoggle-retry:" + reason);
    } catch (ex) {
      mark("autotoggle-retry-fail:" + ex);
      mark("no-pip:" + reason);
      return;
    }
    const openedRetry = await waitForPipOpen(chromeWin, browser, gen);
    if (!stillCurrent(gen)) {
      mark("stale:" + reason);
      return;
    }
    if (openedRetry) {
      openedByUs.add(browser);
      mark("opened-retry:" + reason);
    } else {
      mark("no-pip:" + reason);
    }
  }

  function unpipIfOurs(chromeWin, reason) {
    if (!prefsAllow()) {
      return;
    }
    const browser = getSelectedBrowser(chromeWin);
    if (browser && attempt.browser === browser) {
      attempt.gen += 1;
    }
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
    const front = getFrontmostBundleId();
    if (isOverlayBundle(front)) {
      mark("skip-overlay:" + front);
      return;
    }
    // Space / Stage Manager / other app — content no longer what user is looking at.
    requestAutoPip(chromeWin, getSelectedBrowser(chromeWin), "deactivate");
  }

  function onOcclusionOrSize(chromeWin) {
    if (windowNotVisible(chromeWin)) {
      requestAutoPip(chromeWin, getSelectedBrowser(chromeWin), "occluded");
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
        requestAutoPip(chromeWin, prev, "tab-switch");
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
