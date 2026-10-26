// ==UserScript==
// @name           Zen force toolbar height + hide traffic lights
// @description    Slim top strip (8px), no hover reflow, hide traffic lights
// @include        main
// ==/UserScript==

/**
 * Zen single-toolbar + hide-window-controls:
 *  - zen-tabs.css grows the navbar on zen-has-hover
 *  - zen-browser-container.css applies a negative margin-top on
 *    #tabbrowser-tabpanels[has-toolbar-hovered] .browserContainer
 *    (pref zen.view.shift-down-site-on-hover off) — that shoves the page up
 *
 * Pref: zen.pip.hideTrafficLights.enabled (default true)
 */
(function () {
  "use strict";

  const PREF = "zen.pip.hideTrafficLights.enabled";
  const PREF_SHIFT = "zen.view.shift-down-site-on-hover";
  const STYLE_ID = "zen-pip-force-toolbar-height";
  const H = "8px";

  const CSS = `
/* ---- locked toolbar height (no hover expand) ---- */
:root,
:root[zen-single-toolbar="true"] {
  --zen-toolbar-height: ${H} !important;
  --zen-toolbar-height-with-bookmarks: ${H} !important;
}

:root #zen-appcontent-navbar-wrapper,
:root[zen-single-toolbar="true"] #zen-appcontent-navbar-wrapper,
:root[zen-single-toolbar="true"]:not([customizing]) #zen-appcontent-navbar-wrapper,
:root[zen-single-toolbar="true"] #zen-appcontent-navbar-wrapper[should-hide="true"],
:root[zen-single-toolbar="true"] #zen-appcontent-navbar-wrapper[zen-has-hover="true"],
:root[zen-single-toolbar="true"] #zen-appcontent-navbar-wrapper[has-popup-menu],
:root[zen-single-toolbar="true"] #zen-appcontent-navbar-wrapper[zen-compact-mode-active],
:root[zen-has-bookmarks][zen-single-toolbar="true"] #zen-appcontent-navbar-wrapper {
  --zen-toolbar-height: ${H} !important;
  --zen-toolbar-height-with-bookmarks: ${H} !important;
  height: ${H} !important;
  min-height: ${H} !important;
  max-height: ${H} !important;
  transition: none !important;
  transition-delay: 0s !important;
}

:root #zen-appcontent-navbar-wrapper #zen-appcontent-navbar-container,
:root[zen-single-toolbar="true"] #zen-appcontent-navbar-wrapper #zen-appcontent-navbar-container,
:root[zen-single-toolbar="true"] #zen-appcontent-navbar-wrapper[zen-has-hover="true"] #zen-appcontent-navbar-container {
  min-height: ${H} !important;
  height: ${H} !important;
  max-height: ${H} !important;
}

:root:not([zen-compact-mode="true"]) #navigator-toolbox {
  margin-top: ${H} !important;
}

:root:not([zen-compact-mode="true"]) #titlebar {
  padding-top: ${H} !important;
}

/*
 * Kill zen-browser-container.css hover compensation:
 * #tabbrowser-tabpanels[has-toolbar-hovered] .browserContainer {
 *   margin-top: calc(-1 * var(--zen-toolbar-height) + …);
 * }
 */
.browserSidebarContainer .browserContainer,
.browserSidebarContainer:is(.deck-selected, [zen-split="true"]) .browserContainer,
#tabbrowser-tabpanels[has-toolbar-hovered] .browserSidebarContainer .browserContainer,
#tabbrowser-tabpanels[has-toolbar-hovered]
  .browserSidebarContainer:is(.deck-selected, [zen-split="true"])
  .browserContainer {
  --zen-toolbar-height: ${H} !important;
  --margin-top-fix: 0px !important;
  margin-top: 0 !important;
  transition: none !important;
  transition-delay: 0s !important;
}

/* ---- traffic lights: gone forever ---- */
.titlebar-buttonbox-container,
.titlebar-buttonbox,
.titlebar-button,
.titlebar-close,
.titlebar-min,
.titlebar-max,
.titlebar-restore,
#titlebar .titlebar-buttonbox-container,
#zen-appcontent-navbar-wrapper .titlebar-buttonbox-container,
#zen-sidebar-top-buttons .titlebar-buttonbox-container {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  width: 0 !important;
  height: 0 !important;
  max-width: 0 !important;
  max-height: 0 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}
`;

  function enabled() {
    try {
      return Services.prefs.getBoolPref(PREF, true);
    } catch (_) {
      return true;
    }
  }

  function disableShiftPref() {
    // Zen: when this pref is true, the negative-margin media query is skipped.
    try {
      Services.prefs.setBoolPref(PREF_SHIFT, true);
    } catch (_) {
      /* ignore */
    }
  }

  function apply() {
    const doc = document;
    if (!doc || !doc.documentElement) {
      return;
    }
    let style = doc.getElementById(STYLE_ID);
    if (!enabled()) {
      if (style) {
        style.remove();
      }
      return;
    }
    disableShiftPref();
    if (!style) {
      style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
      style.id = STYLE_ID;
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.textContent = CSS;
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
  window.setTimeout(apply, 0);
  window.setTimeout(apply, 500);

  try {
    Services.prefs.addObserver(PREF, apply);
  } catch (_) {
    /* ignore */
  }
})();
