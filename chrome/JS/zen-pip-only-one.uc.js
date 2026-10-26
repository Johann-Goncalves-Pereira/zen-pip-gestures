// ==UserScript==
// @name           Zen PiP only one window
// @description    Arc-like: at most one Picture-in-Picture window (default on)
// @include        main
// ==/UserScript==

/**
 * When a new PiP opens, close every other PiP window so only one remains.
 *
 * Pref: zen.pip.onlyOne.enabled (default true)
 */
(function () {
  "use strict";

  const PREF = "zen.pip.onlyOne.enabled";

  function enabled() {
    try {
      return Services.prefs.getBoolPref(PREF, true);
    } catch (_) {
      return true;
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

  function listPipWindows() {
    const out = [];
    try {
      for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) {
        if (win && !win.closed) {
          out.push(win);
        }
      }
    } catch (_) {
      /* ignore */
    }
    return out;
  }

  /** Keep `keep` open; close every other PiP. */
  function closeOthers(keep) {
    if (!enabled()) {
      return;
    }
    for (const win of listPipWindows()) {
      if (win === keep) {
        continue;
      }
      try {
        win.close();
      } catch (_) {
        /* ignore */
      }
    }
  }

  function onPipOpened(win) {
    if (!enabled() || !isPipWindow(win)) {
      return;
    }
    // Defer so the new window finishes registering.
    win.setTimeout(() => closeOthers(win), 0);
    win.setTimeout(() => closeOthers(win), 100);
  }

  // New chrome windows (PiP player.xhtml).
  Services.ww.registerNotification({
    observe(subject, topic) {
      if (topic !== "domwindowopened") {
        return;
      }
      const win = subject;
      try {
        win.addEventListener(
          "DOMContentLoaded",
          () => onPipOpened(win),
          { once: true }
        );
      } catch (_) {
        /* ignore */
      }
      // Already loaded / late observer.
      try {
        if (win.document?.readyState !== "loading") {
          onPipOpened(win);
        }
      } catch (_) {
        /* ignore */
      }
    },
  });

  // Export for auto-focus: close all before opening a replacement.
  try {
    window.ZenPipOnlyOne = {
      enabled,
      closeAllExcept(keep) {
        closeOthers(keep || null);
      },
      closeAll() {
        closeOthers(null);
      },
    };
  } catch (_) {
    /* ignore */
  }
})();
