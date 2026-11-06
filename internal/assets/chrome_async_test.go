package assets_test

import (
	"strings"
	"testing"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/assets"
)

func TestPiPApplyDoesNotRescheduleFromResize(t *testing.T) {
	t.Parallel()
	body := readChrome(t, "chrome/JS/zen-pip-no-traffic-lights.uc.js")
	if strings.Contains(body, `dispatchEvent(new Event("resize"))`) {
		t.Fatal("apply must not dispatch resize")
	}
	if strings.Contains(body, `addEventListener("resize"`) {
		t.Fatal("apply must not reschedule itself from resize")
	}
	if strings.Contains(body, "setTimeout(apply") {
		t.Fatal("apply must not use a staggered setTimeout ladder")
	}
	if !strings.Contains(body, "MutationObserver") {
		t.Fatal("a MutationObserver must reapply when the button box is removed")
	}
	if !strings.Contains(body, "zen-pip-buttonbox-anchor") {
		t.Fatal("observer must key off the hidden button box anchor")
	}
}

func TestAutoPipWakesOnPipWindow(t *testing.T) {
	t.Parallel()
	body := readChrome(t, "chrome/JS/zen-pip-auto-focus.uc.js")
	for _, needle := range []string{
		"attempt.gen",
		"domwindowopened",
		"domwindowclosed",
		"logStream",
	} {
		if !strings.Contains(body, needle) {
			t.Errorf("auto-focus missing %q", needle)
		}
	}
	if strings.Contains(body, "setTimeout(r, 700)") || strings.Contains(body, "setTimeout(r, 50)") {
		t.Fatal("auto-focus must not sleep a fixed 50ms or 700ms")
	}
	// One declaration plus one call site in afterDeactivate.
	if strings.Count(body, "getFrontmostBundleId()") != 2 {
		t.Fatalf("getFrontmostBundleId() occurrences = %d, want declaration plus one read", strings.Count(body, "getFrontmostBundleId()"))
	}
}

func TestGestureKeepsSingleFrame(t *testing.T) {
	t.Parallel()
	body := readChrome(t, "chrome/JS/zen-pip-gestures.uc.js")
	tickAt := strings.Index(body, "function tick(ts)")
	if tickAt < 0 {
		t.Fatal("missing tick")
	}
	tick := body[tickAt:]
	flushAt := strings.Index(tick, "flushPendingInput()")
	clearAt := strings.Index(tick, "raf = 0")
	if flushAt < 0 || (clearAt >= 0 && clearAt < flushAt) {
		t.Fatal("tick must keep the frame id until after flushPendingInput")
	}
	if !strings.Contains(body, "Services.prefs.addObserver(PREF_MIN") {
		t.Fatal("min width must come from a pref observer")
	}
	if !strings.Contains(body, "cachedAvail") {
		t.Fatal("available screen bounds must be cached")
	}
}

func readChrome(t *testing.T, path string) string {
	t.Helper()
	data, err := assets.Chrome.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}
