// ==UserScript==
// @name           Zen PiP trackpad gestures
// @description    Two-finger pan moves PiP; pinch resizes around center (Arc-like)
// @include        chrome://global/content/pictureinpicture/player.xhtml
// ==/UserScript==

/**
 * Prefs (about:config):
 *   zen.pip.gestures.pan.enabled   (default true) — two-finger swipe moves PiP
 *   zen.pip.gestures.pinch.enabled (default true) — pinch resizes PiP
 *   zen.pip.trackpadGestures.enabled (default true) — master; false disables both
 *   zen.pip.gestures.minWidth (default 200)
 *   zen.pip.gestures.maxWidth (default 900)
 */
(function () {
  "use strict";

  const PREF_MASTER = "zen.pip.trackpadGestures.enabled";
  const PREF_PAN = "zen.pip.gestures.pan.enabled";
  const PREF_PINCH = "zen.pip.gestures.pinch.enabled";
  const PREF_MIN = "zen.pip.gestures.minWidth";
  const PREF_MAX = "zen.pip.gestures.maxWidth";
  const DEFAULT_MIN_WIDTH = 200;
  const DEFAULT_MAX_WIDTH = 900;
  const WHEEL_PINCH_SCALE = 100;
  const GESTURE_IDLE_MS = 280;
  /** Smoothing time constant (seconds). Lower = snappier. */
  const SMOOTH_TAU = 0.042;
  const SETTLE_PX = 0.25;

  // 1×1 transparent SVG — forces a real “empty” cursor, not just CSS none.
  const BLANK_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
  )}") 0 0, none`;

  function prefInt(name, fallback) {
    try {
      const v = Services.prefs.getIntPref(name, fallback);
      return Number.isFinite(v) && v > 0 ? v : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function prefBool(name, fallback) {
    try {
      return Services.prefs.getBoolPref(name, fallback);
    } catch (_) {
      return fallback;
    }
  }

  function masterEnabled() {
    return prefBool(PREF_MASTER, true);
  }

  function panEnabled() {
    return masterEnabled() && prefBool(PREF_PAN, true);
  }

  function pinchEnabled() {
    return masterEnabled() && prefBool(PREF_PINCH, true);
  }

  function isFullscreen() {
    return !!(window.fullScreen || document.fullscreenElement);
  }

  function isInteractiveControl(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return !!target.closest(
      "button, input, select, textarea, a, [role='button'], .panel, .control-item, .scrubber-no-drag, slider"
    );
  }

  function availBounds() {
    const s = window.screen;
    return {
      left: s.availLeft,
      top: s.availTop,
      right: s.availLeft + s.availWidth,
      bottom: s.availTop + s.availHeight,
      width: s.availWidth,
      height: s.availHeight,
    };
  }

  function clampRect(x, y, w, h) {
    const a = availBounds();
    w = Math.min(w, a.width);
    h = Math.min(h, a.height);
    x = Math.min(Math.max(x, a.left), a.right - w);
    y = Math.min(Math.max(y, a.top), a.bottom - h);
    return { x, y, w, h };
  }

  function aspectRatio() {
    const h = target.h || window.outerHeight;
    const w = target.w || window.outerWidth;
    return h > 0 ? w / h : 16 / 9;
  }

  function sizeLimits() {
    const a = availBounds();
    const ratio = aspectRatio();
    const hardMax = Math.min(
      prefInt(PREF_MAX, DEFAULT_MAX_WIDTH),
      a.width,
      Math.floor(a.height * ratio)
    );
    const hardMin = Math.min(
      hardMax,
      Math.max(prefInt(PREF_MIN, DEFAULT_MIN_WIDTH), window.minWidth || 0)
    );
    return { hardMin, hardMax, ratio };
  }

  // --- macOS OS cursor hide (refcount). Warps unhide Cocoa unless we hide. ---
  let macCursor = null;
  let macHideDepth = 0;

  function getMacCursor() {
    if (macCursor !== null) {
      return macCursor;
    }
    macCursor = false;
    try {
      if (Services.appinfo.OS !== "Darwin") {
        return macCursor;
      }
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
      const NSCursor = objc_getClass("NSCursor");
      const hideSel = sel_registerName("hide");
      const unhideSel = sel_registerName("unhide");
      macCursor = {
        hide() {
          objc_msgSend(NSCursor, hideSel);
        },
        unhide() {
          objc_msgSend(NSCursor, unhideSel);
        },
      };
    } catch (_) {
      macCursor = false;
    }
    return macCursor;
  }

  function macHideCursor() {
    const api = getMacCursor();
    if (!api) {
      return;
    }
    try {
      api.hide();
      macHideDepth += 1;
    } catch (_) {
      /* ignore */
    }
  }

  function macUnhideCursor() {
    const api = getMacCursor();
    if (!api || macHideDepth <= 0) {
      macHideDepth = 0;
      return;
    }
    try {
      while (macHideDepth > 0) {
        api.unhide();
        macHideDepth -= 1;
      }
    } catch (_) {
      macHideDepth = 0;
    }
  }

  const target = {
    x: window.screenX,
    y: window.screenY,
    w: window.outerWidth,
    h: window.outerHeight,
  };
  const live = { x: target.x, y: target.y, w: target.w, h: target.h };

  // Batched gesture input — applied once per animation frame.
  let pendingPanX = 0;
  let pendingPanY = 0;
  let pendingLogScale = 0;

  let raf = 0;
  let lastTs = 0;
  let gestureActive = false;
  let gestureIdleTimer = 0;
  let magnifyGestureUntil = 0;
  let lastApplied = { x: 0, y: 0, w: 0, h: 0 };
  let styleEl = null;

  function ensureStyle() {
    if (styleEl) {
      return;
    }
    styleEl = document.createElement("style");
    styleEl.id = "zen-pip-gesture-cursor";
    styleEl.textContent = `
      :root.zen-pip-gesture-active,
      :root.zen-pip-gesture-active * {
        cursor: ${BLANK_CURSOR} !important;
      }
    `;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function hideCursorHard() {
    ensureStyle();
    document.documentElement.classList.add("zen-pip-gesture-active");
    try {
      document.documentElement.style.setProperty(
        "cursor",
        BLANK_CURSOR,
        "important"
      );
      if (document.body) {
        document.body.style.setProperty("cursor", BLANK_CURSOR, "important");
      }
    } catch (_) {
      /* ignore */
    }
    macHideCursor();
    try {
      if (!document.pointerLockElement) {
        document.documentElement.requestPointerLock();
      }
    } catch (_) {
      /* ignore — not always allowed in chrome windows */
    }
    try {
      window.windowUtils.setCursor("none");
    } catch (_) {
      /* ignore */
    }
  }

  function showCursorHard() {
    document.documentElement.classList.remove("zen-pip-gesture-active");
    try {
      document.documentElement.style.removeProperty("cursor");
      if (document.body) {
        document.body.style.removeProperty("cursor");
      }
    } catch (_) {
      /* ignore */
    }
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } catch (_) {
      /* ignore */
    }
    try {
      window.windowUtils.setCursor("auto");
    } catch (_) {
      /* ignore */
    }
    macUnhideCursor();
  }

  /**
   * Keep the (hidden) pointer inside the PiP as the window moves.
   * Safe to call every applied move — NSCursor.hide keeps Cocoa from flashing.
   */
  function pinCursorToPipCenter() {
    try {
      const wu = window.windowUtils;
      const dpr = window.devicePixelRatio || 1;
      const cx =
        ((window.mozInnerScreenX || window.screenX) + window.innerWidth / 2) *
        dpr;
      const cy =
        ((window.mozInnerScreenY || window.screenY) + window.innerHeight / 2) *
        dpr;
      wu.sendNativeMouseEvent(
        Math.round(cx),
        Math.round(cy),
        wu.NATIVE_MOUSE_MESSAGE_MOVE,
        0,
        0,
        document.documentElement
      );
      try {
        window.windowUtils.setCursor("none");
      } catch (_) {
        /* ignore */
      }
    } catch (_) {
      /* ignore */
    }
  }

  function beginGesture() {
    if (!gestureActive) {
      gestureActive = true;
      pendingPanX = 0;
      pendingPanY = 0;
      pendingLogScale = 0;
      target.x = live.x = window.screenX;
      target.y = live.y = window.screenY;
      target.w = live.w = window.outerWidth;
      target.h = live.h = window.outerHeight;
      lastApplied.x = Math.round(live.x);
      lastApplied.y = Math.round(live.y);
      lastApplied.w = Math.round(live.w);
      lastApplied.h = Math.round(live.h);
      hideCursorHard();
      pinCursorToPipCenter();
    }
    if (gestureIdleTimer) {
      window.clearTimeout(gestureIdleTimer);
    }
    gestureIdleTimer = window.setTimeout(endGesture, GESTURE_IDLE_MS);
  }

  function endGesture() {
    gestureIdleTimer = 0;
    if (!gestureActive) {
      return;
    }
    flushPendingInput();
    applyWindow(target.x, target.y, target.w, target.h, true);
    live.x = target.x;
    live.y = target.y;
    live.w = target.w;
    live.h = target.h;
    gestureActive = false;
    pendingPanX = 0;
    pendingPanY = 0;
    pendingLogScale = 0;
    showCursorHard();
  }

  function applyWindow(x, y, w, h, force) {
    const r = clampRect(x, y, w, h);
    const nx = Math.round(r.x);
    const ny = Math.round(r.y);
    const nw = Math.round(r.w);
    const nh = Math.round(r.h);
    if (
      !force &&
      nx === lastApplied.x &&
      ny === lastApplied.y &&
      nw === lastApplied.w &&
      nh === lastApplied.h
    ) {
      return r;
    }
    const moved = nx !== lastApplied.x || ny !== lastApplied.y;
    const resized = nw !== lastApplied.w || nh !== lastApplied.h;
    if (resized) {
      window.resizeTo(nw, nh);
    }
    if (moved) {
      window.moveTo(nx, ny);
    }
    lastApplied.x = nx;
    lastApplied.y = ny;
    lastApplied.w = nw;
    lastApplied.h = nh;
    // Window moved under the pointer — pull pointer back into PiP (hidden).
    if (gestureActive && (moved || resized)) {
      pinCursorToPipCenter();
    }
    return r;
  }

  function flushPendingInput() {
    if (pendingPanX !== 0 || pendingPanY !== 0) {
      const dx = pendingPanX;
      const dy = pendingPanY;
      pendingPanX = 0;
      pendingPanY = 0;
      const r = clampRect(
        target.x - dx,
        target.y - dy,
        target.w,
        target.h
      );
      target.x = r.x;
      target.y = r.y;
      target.w = r.w;
      target.h = r.h;
    }
    if (pendingLogScale !== 0) {
      const factor = Math.exp(pendingLogScale);
      pendingLogScale = 0;
      if (factor > 0 && Number.isFinite(factor)) {
        const { hardMin, hardMax, ratio } = sizeLimits();
        const cx = target.x + target.w / 2;
        const cy = target.y + target.h / 2;
        let w = target.w * factor;
        w = Math.min(Math.max(w, hardMin), hardMax);
        const h = w / ratio;
        const r = clampRect(cx - w / 2, cy - h / 2, w, h);
        target.x = r.x;
        target.y = r.y;
        target.w = r.w;
        target.h = r.h;
      }
    }
  }

  function tick(ts) {
    raf = 0;
    flushPendingInput();

    if (!lastTs) {
      lastTs = ts;
    }
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;

    const alpha = 1 - Math.exp(-dt / SMOOTH_TAU);

    live.x += (target.x - live.x) * alpha;
    live.y += (target.y - live.y) * alpha;
    live.w += (target.w - live.w) * alpha;
    live.h += (target.h - live.h) * alpha;

    const dist =
      Math.abs(target.x - live.x) +
      Math.abs(target.y - live.y) +
      Math.abs(target.w - live.w) +
      Math.abs(target.h - live.h);

    if (dist < SETTLE_PX) {
      live.x = target.x;
      live.y = target.y;
      live.w = target.w;
      live.h = target.h;
      applyWindow(live.x, live.y, live.w, live.h, false);
      lastTs = 0;
      return;
    }

    applyWindow(live.x, live.y, live.w, live.h, false);
    raf = requestAnimationFrame(tick);
  }

  function scheduleTick() {
    if (!raf) {
      lastTs = 0;
      raf = requestAnimationFrame(tick);
    }
  }

  function queuePan(dx, dy) {
    pendingPanX += dx;
    pendingPanY += dy;
    scheduleTick();
  }

  function queueScaleLog(logDelta) {
    pendingLogScale += logDelta;
    scheduleTick();
  }

  function onWheel(event) {
    if (isFullscreen()) {
      return;
    }

    // ctrl+wheel (or trackpad pinch-as-wheel) → resize
    if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (!pinchEnabled() || isInteractiveControl(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      beginGesture();
      if (performance.now() < magnifyGestureUntil) {
        return;
      }
      queueScaleLog(-event.deltaY / WHEEL_PINCH_SCALE);
      return;
    }

    if (!panEnabled()) {
      return;
    }
    if (event.deltaMode !== 0) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }
    if (isInteractiveControl(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    beginGesture();
    queuePan(event.deltaX, event.deltaY);
  }

  function noteMagnifyGesture() {
    magnifyGestureUntil = performance.now() + 200;
  }

  function onMagnifyStart(event) {
    if (
      !pinchEnabled() ||
      isFullscreen() ||
      isInteractiveControl(event.target)
    ) {
      return;
    }
    beginGesture();
    noteMagnifyGesture();
    event.preventDefault();
  }

  function onMagnifyUpdate(event) {
    if (
      !pinchEnabled() ||
      isFullscreen() ||
      isInteractiveControl(event.target)
    ) {
      return;
    }
    beginGesture();
    noteMagnifyGesture();
    event.preventDefault();
    queueScaleLog(event.delta);
  }

  function onMagnifyEnd(event) {
    if (!pinchEnabled() || isFullscreen()) {
      return;
    }
    noteMagnifyGesture();
    event.preventDefault();
  }

  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  window.addEventListener("MozMagnifyGestureStart", onMagnifyStart, true);
  window.addEventListener("MozMagnifyGestureUpdate", onMagnifyUpdate, true);
  window.addEventListener("MozMagnifyGesture", onMagnifyEnd, true);

  window.addEventListener(
    "unload",
    () => {
      macUnhideCursor();
    },
    { once: true }
  );
})();
