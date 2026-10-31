// ==UserScript==
// @name           Zen PiP hide traffic lights
// @description    Hide macOS traffic lights; PiP #unpip + #playpause (cqi, no tooltips)
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

html[windowtype="Toolkit:PictureInPicture"] #unpip,
html[windowtype="Toolkit:PictureInPicture"] #unpip[mac="true"],
html[windowtype="Toolkit:PictureInPicture"] #playpause {
  width: 8cqi !important;
  height: 8cqi !important;
  max-width: none !important;
  min-width: 0 !important;
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  fill: #ffffff !important;
  fill-opacity: 1 !important;
  color: #ffffff !important;
  -moz-context-properties: fill, fill-opacity !important;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.75)) !important;
  opacity: 1 !important;
  background-size: 60% !important;
  background-repeat: no-repeat !important;
  background-position: center !important;
  pointer-events: auto !important;
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

html[windowtype="Toolkit:PictureInPicture"] #unpip:hover,
html[windowtype="Toolkit:PictureInPicture"] #unpip:focus,
html[windowtype="Toolkit:PictureInPicture"] #unpip:focus-visible,
html[windowtype="Toolkit:PictureInPicture"] #unpip[mac="true"]:hover,
html[windowtype="Toolkit:PictureInPicture"] #unpip[mac="true"]:focus,
html[windowtype="Toolkit:PictureInPicture"] #unpip[mac="true"]:focus-visible,
html[windowtype="Toolkit:PictureInPicture"] #playpause:hover,
html[windowtype="Toolkit:PictureInPicture"] #playpause:focus,
html[windowtype="Toolkit:PictureInPicture"] #playpause:focus-visible {
  background-color: transparent !important;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.9)) !important;
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
      const root = document.documentElement;
      const cur = root.getAttribute("chromemargin") || "0,0,0,0";
      root.setAttribute("chromemargin", cur);
      root.setAttribute("customtitlebar", "true");
      window.dispatchEvent(new Event("resize"));
    } catch (_) {
      /* ignore */
    }
  }

  function apply() {
    if (!hideEnabled()) {
      return;
    }
    ensureRootAttrs();
    injectCss();
    ensureHiddenButtonbox();
    forceWidgetSync();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
  window.setTimeout(apply, 0);
  window.setTimeout(apply, 100);
  window.setTimeout(apply, 400);
  window.setTimeout(apply, 1000);

  // Re-apply when the player rebuilds chrome (fullscreen toggle etc.).
  window.addEventListener("resize", () => window.setTimeout(apply, 0));
  window.addEventListener("fullscreenchange", () => window.setTimeout(apply, 0));
})();
