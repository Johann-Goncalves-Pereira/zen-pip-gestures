// ==UserScript==
// @name           Zen PiP hide traffic lights
// @description    Hide macOS traffic lights; PiP #unpip + #playpause (cqi, hide until hover)
// @include        chrome://global/content/pictureinpicture/player.xhtml
// ==/UserScript==

/**
 * Native traffic lights are Cocoa widgets positioned from the XUL
 * titlebar-buttonbox rect. display:none can make Cocoa fall back to a default
 * left-side placement (looks like a sidebar-side strip). Use a 0×0 laid-out
 * buttonbox instead so placeWindowButtons gets an empty rect and hides them.
 *
 * Pref: zen.pip.hideTrafficLights.enabled (default true)
 */
(function () {
  "use strict";

  const PREF_HIDE = "zen.pip.hideTrafficLights.enabled";

  function hideEnabled() {
    try {
      return Services.prefs.getBoolPref(PREF_HIDE, true);
    } catch (_) {
      return true;
    }
  }

  // PiP-only — every selector gated to Toolkit:PictureInPicture (never browser.xhtml).
  const INLINE_CSS = `
html[windowtype="Toolkit:PictureInPicture"] .titlebar-buttonbox-container#zen-pip-buttonbox-anchor,
html[windowtype="Toolkit:PictureInPicture"] #zen-pip-buttonbox-anchor {
  position: fixed !important;
  left: 0 !important;
  top: 0 !important;
  width: 0 !important;
  height: 0 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 0 !important;
  max-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  appearance: none !important;
  -moz-appearance: none !important;
}

html[windowtype="Toolkit:PictureInPicture"] #controls {
  container-type: size !important;
  container-name: zen-pip !important;
}

html[windowtype="Toolkit:PictureInPicture"] .control-item:hover::after,
html[windowtype="Toolkit:PictureInPicture"] .control-item:focus-visible::after,
html[windowtype="Toolkit:PictureInPicture"] .control-item::after {
  content: none !important;
  display: none !important;
}

html[windowtype="Toolkit:PictureInPicture"] #close,
html[windowtype="Toolkit:PictureInPicture"] #minimize,
html[windowtype="Toolkit:PictureInPicture"] #controls-bottom-gradient,
html[windowtype="Toolkit:PictureInPicture"] .controls-bottom-upper,
html[windowtype="Toolkit:PictureInPicture"] .start-controls,
html[windowtype="Toolkit:PictureInPicture"] .end-controls,
html[windowtype="Toolkit:PictureInPicture"] #seekBackward,
html[windowtype="Toolkit:PictureInPicture"] #seekForward,
html[windowtype="Toolkit:PictureInPicture"] #timestamp {
  display: none !important;
}

html[windowtype="Toolkit:PictureInPicture"] #controls-bottom {
  pointer-events: none !important;
  bottom: 0 !important;
  margin: 0 !important;
  width: 100% !important;
}

html[windowtype="Toolkit:PictureInPicture"] #controls-bottom .controls-bottom-lower,
html[windowtype="Toolkit:PictureInPicture"] #controls-bottom .center-controls {
  display: block !important;
  margin: 0 !important;
  grid-template-columns: none !important;
  grid-template-areas: none !important;
  justify-self: start !important;
}

/* Shared corner-icon treatment (keep SVG background-image). Capped at 48px max. */
html[windowtype="Toolkit:PictureInPicture"] #unpip,
html[windowtype="Toolkit:PictureInPicture"] #unpip[mac="true"],
html[windowtype="Toolkit:PictureInPicture"] #playpause {
  width: 8cqi !important;
  height: 8cqi !important;
  max-width: 48px !important;
  max-height: 48px !important;
  min-width: 0 !important;
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  fill: #ffffff !important;
  fill-opacity: 1 !important;
  color: #ffffff !important;
  -moz-context-properties: fill, fill-opacity !important;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.75)) !important;
  opacity: 0 !important;
  pointer-events: none !important;
  transition: opacity 160ms linear !important;
  background-size: 60% !important;
  background-repeat: no-repeat !important;
  background-position: center !important;
}

html[windowtype="Toolkit:PictureInPicture"] #unpip,
html[windowtype="Toolkit:PictureInPicture"] #unpip[mac="true"] {
  position: absolute !important;
  left: 2cqi !important;
  right: auto !important;
  top: 2cqi !important;
  bottom: auto !important;
}

html[windowtype="Toolkit:PictureInPicture"] #playpause {
  position: fixed !important;
  left: 2cqi !important;
  right: auto !important;
  bottom: 2cqi !important;
  top: auto !important;
  grid-area: unset !important;
}

/* Reveal when controls are hovered, showing, or keying — provided window is active */
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #controls:hover #unpip,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #controls:hover #playpause,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #controls[showing] #unpip,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #controls[showing] #playpause,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #controls[keying] #unpip,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #controls[keying] #playpause {
  opacity: 0.85 !important;
  pointer-events: auto !important;
}

/* Elevated hover/focus for individual buttons when active */
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #unpip:hover,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #unpip:focus,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #unpip:focus-visible,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #unpip[mac="true"]:hover,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #unpip[mac="true"]:focus,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #unpip[mac="true"]:focus-visible,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #playpause:hover,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #playpause:focus,
html[windowtype="Toolkit:PictureInPicture"]:not(:-moz-window-inactive):not([pip-inactive]) #playpause:focus-visible {
  background-color: transparent !important;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.9)) !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}

/* When PiP window is inactive / clicked out, always hide both buttons */
html[windowtype="Toolkit:PictureInPicture"]:-moz-window-inactive #unpip,
html[windowtype="Toolkit:PictureInPicture"]:-moz-window-inactive #playpause,
html[windowtype="Toolkit:PictureInPicture"][pip-inactive] #unpip,
html[windowtype="Toolkit:PictureInPicture"][pip-inactive] #playpause {
  opacity: 0 !important;
  pointer-events: none !important;
}
`;

  let sheetLoaded = false;

  function ensureRootAttrs() {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.setAttribute("customtitlebar", "true");
    root.setAttribute("chromemargin", "0,0,0,0");
    root.setAttribute("drawtitle", "false");
    // Pretend tabs-in-titlebar so widget code treats chrome like a full-bleed UI.
    root.setAttribute("tabsintitlebar", "true");
  }

  /**
   * player.xhtml CSP is `default-src chrome:` — a DOM <style> element is ignored.
   * Prefer windowUtils.loadSheetUsingURI (privileged) so rules actually apply.
   * zen-pip-no-traffic-lights.uc.css is the primary path via fx-autoconfig.
   */
  function injectCss() {
    if (sheetLoaded) {
      return;
    }
    try {
      const uri = Services.io.newURI(
        "data:text/css;charset=utf-8," + encodeURIComponent(INLINE_CSS)
      );
      // Author sheet on this PiP window only (not a global agent sheet).
      window.windowUtils.loadSheetUsingURI(
        uri,
        Ci.nsIDOMWindowUtils.AUTHOR_SHEET
      );
      sheetLoaded = true;
      return;
    } catch (_) {
      /* fall through — .uc.css author sheet still applies when present */
    }
  }

  /**
   * Cocoa reads this box to place traffic lights. Zero-size + in-tree ⇒ hide.
   * Replace any existing visible buttonbox Zen/Firefox may have created.
   */
  function ensureHiddenButtonbox() {
    const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    const root = document.documentElement;

    // Hide any stock buttonboxes by collapsing them into our anchor pattern.
    for (const el of document.querySelectorAll(
      ".titlebar-buttonbox-container, .titlebar-buttonbox"
    )) {
      if (el.id === "zen-pip-buttonbox-anchor") {
        continue;
      }
      el.style.cssText =
        "width:0!important;height:0!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;";
    }

    let container = document.getElementById("zen-pip-buttonbox-anchor");
    if (!container) {
      container = document.createElementNS(XUL, "hbox");
      container.id = "zen-pip-buttonbox-anchor";
      container.className = "titlebar-buttonbox-container";

      const box = document.createElementNS(XUL, "hbox");
      box.className = "titlebar-buttonbox titlebar-color";
      for (const kind of ["close", "min", "max"]) {
        const btn = document.createElementNS(XUL, "toolbarbutton");
        btn.className = `titlebar-${kind} titlebar-button`;
        box.appendChild(btn);
      }
      container.appendChild(box);

      const titlebar = document.getElementById("titlebar");
      if (titlebar) {
        titlebar.insertBefore(container, titlebar.firstChild);
      } else {
        root.insertBefore(container, root.firstChild);
      }
    }

    // Critical: stay in layout flow at 0×0 — not display:none.
    container.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;min-width:0;min-height:0;max-width:0;max-height:0;margin:0;padding:0;overflow:hidden;opacity:0;pointer-events:none;";
  }

  function forceWidgetSync() {
    try {
      // Nudge AppWindow to re-read customtitlebar / buttonbox metrics.
      // Do not dispatch resize: a resize listener that calls apply loops forever.
      const root = document.documentElement;
      root.setAttribute("chromemargin", "0,0,0,0");
      root.setAttribute("customtitlebar", "true");
    } catch (_) {
      /* ignore */
    }
  }

  let applying = false;

  function apply() {
    if (applying || !hideEnabled()) {
      return;
    }
    applying = true;
    try {
      ensureRootAttrs();
      injectCss();
      ensureHiddenButtonbox();
      forceWidgetSync();
    } finally {
      applying = false;
    }
  }

  function watchTitlebar() {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    const onTitlebarChange = () => {
      if (!document.getElementById("zen-pip-buttonbox-anchor")) {
        apply();
      }
    };
    const watch = (titlebar) => {
      if (!titlebar || titlebar.__zenPipWatch) {
        return;
      }
      titlebar.__zenPipWatch = true;
      const inner = new MutationObserver(onTitlebarChange);
      inner.observe(titlebar, { childList: true, subtree: true });
      onTitlebarChange();
    };
    watch(document.getElementById("titlebar"));
    const outer = new MutationObserver(() => {
      watch(document.getElementById("titlebar"));
    });
    outer.observe(root, { childList: true });
  }

  function handleBlur() {
    try {
      const root = document.documentElement;
      if (root) {
        root.setAttribute("pip-inactive", "true");
      }
      const controls = document.getElementById("controls");
      if (controls) {
        controls.removeAttribute("showing");
        controls.removeAttribute("keying");
      }
    } catch (_) {
      /* ignore */
    }
  }

  function handleFocus() {
    try {
      const root = document.documentElement;
      if (root) {
        root.removeAttribute("pip-inactive");
      }
    } catch (_) {
      /* ignore */
    }
  }

  function start() {
    apply();
    watchTitlebar();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  // Fullscreen rebuilds the titlebar. Apply once; do not listen for resize.
  window.addEventListener("fullscreenchange", () => {
    apply();
  });
  window.addEventListener("blur", handleBlur);
  window.addEventListener("focus", handleFocus);
})();
