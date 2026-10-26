// ==UserScript==
// @name           Zen PiP auto on Space/app switch
// @description    Auto-PiP when leaving Zen for another Space/app; unpip only what we opened
// @include        main
// ==/UserScript==

/**
 * Zen/Firefox 144+ moved PictureInPicture.sys.mjs to moz-src:// — avoid hard
 * dependency on that module; drive AutoToggle via the window actor instead.
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

  function prefsAllow() {
    try {
      return (
        Services.prefs.getBoolPref(PIP_ENABLED, false) &&
        Services.prefs.getBoolPref(PIP_SWITCH_TABS, false)
      );
    } catch (_) {
      return false;
    }
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

  function focusMovedToPip() {
    try {
      return isPipWindow(Services.focus.activeWindow);
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
    // Fallback: any PiP open is enough to skip (avoid stacking).
    return anyPipOpen();
  }

  function getSelectedBrowser(chromeWin) {
    try {
      return chromeWin.gBrowser?.selectedBrowser || null;
    } catch (_) {
      return null;
    }
  }

  function closePipForBrowser(browser) {
    if (
      PictureInPicture?.weakAutoPipBrowserToParent?.has(browser)
    ) {
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
    // Fallback: close all PiP windows (only used for ones we opened).
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

  async function autoPipOnDeactivate(chromeWin) {
    if (!prefsAllow()) {
      mark("skip-prefs");
      return;
    }
    if (focusMovedToPip()) {
      mark("skip-focus-pip");
      return;
    }

    const browser = getSelectedBrowser(chromeWin);
    if (!browser) {
      mark("skip-no-browser");
      return;
    }
    if (browserAlreadyHasPip(browser)) {
      mark("skip-already-pip");
      return;
    }

    const wgp = browser.browsingContext?.currentWindowGlobal;
    if (!wgp) {
      mark("skip-no-wgp");
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
      mark("skip-actor-null");
      return;
    }

    const wasActive = !!browser.docShellIsActive;
    try {
      browser.docShellIsActive = false;
      actor.sendAsyncMessage("PictureInPicture:AutoToggle");
      mark("autotoggle-sent");
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
      mark("opened");
    } else if (wasActive) {
      try {
        browser.docShellIsActive = true;
      } catch (_) {
        /* ignore */
      }
      mark("no-pip");
    }
  }

  function unpipOnActivate(chromeWin) {
    if (!prefsAllow()) {
      return;
    }
    const browser = getSelectedBrowser(chromeWin);
    if (!browser || !openedByUs.has(browser)) {
      return;
    }
    closePipForBrowser(browser);
    openedByUs.delete(browser);
    mark("closed");
  }

  window.addEventListener("deactivate", (event) => {
    const chromeWin = event.currentTarget;
    chromeWin.setTimeout(() => autoPipOnDeactivate(chromeWin), 0);
  });
  window.addEventListener("activate", (event) => {
    const chromeWin = event.currentTarget;
    chromeWin.setTimeout(() => unpipOnActivate(chromeWin), 0);
  });

  mark("ready prefs=" + prefsAllow());
})();
