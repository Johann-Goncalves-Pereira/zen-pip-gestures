// ==UserScript==
// @name           Zen PiP only one window
// @description    Arc-like: at most one Picture-in-Picture window (default on)
// @include        main
// ==/UserScript==

/**
 * When a new PiP opens, close every other PiP window so only one remains.
 *
 * Pref: zen.pip.onlyOne.enabled (default true)
 *
 * Closing must scrub Firefox's PiP WeakMaps — raw win.close() alone leaves
 * browserWeakMap / weakAutoPipBrowserToParent dirty and breaks auto-PiP.
 */
(function () {
  "use strict";

  const PREF = "zen.pip.onlyOne.enabled";

  let PictureInPicture = null;
  for (const uri of [
    "moz-src:///toolkit/components/pictureinpicture/PictureInPicture.sys.mjs",
    "resource://gre/modules/PictureInPicture.sys.mjs",
  ]) {
    try {
      PictureInPicture = ChromeUtils.importESModule(uri).PictureInPicture;
      break;
    } catch (_) {
      /* try next */
    }
  }

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
      /* fall through */
    }
    try {
      win.close();
    } catch (_) {
      /* ignore */
    }
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
      closePipWindowClean(win);
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
        win.addEventListener("DOMContentLoaded", () => onPipOpened(win), {
          once: true,
        });
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
