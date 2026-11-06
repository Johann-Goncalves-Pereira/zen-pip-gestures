package assets_test

import (
	"strings"
	"testing"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/assets"
)

// TestPiPControlsOverlayMinimalUnpip asserts BR-pip-02..07 / BR-pip-04:
// PiP-only overlay CSS (windowtype-gated), CSP-safe sheet loading, no tooltips,
// container-query sizing, and bottom-left #playpause.
func TestPiPControlsOverlayMinimalUnpip(t *testing.T) {
	t.Parallel()

	css, err := assets.Chrome.ReadFile("chrome/CSS/zen-pip-no-traffic-lights.css")
	if err != nil {
		t.Fatalf("read companion CSS: %v", err)
	}
	ucCSS, err := assets.Chrome.ReadFile("chrome/CSS/zen-pip-no-traffic-lights.uc.css")
	if err != nil {
		t.Fatalf("read fx-autoconfig .uc.css: %v", err)
	}
	js, err := assets.Chrome.ReadFile("chrome/JS/zen-pip-no-traffic-lights.uc.js")
	if err != nil {
		t.Fatalf("read PiP script: %v", err)
	}

	sources := map[string]string{
		"chrome/CSS/zen-pip-no-traffic-lights.css":    string(css),
		"chrome/CSS/zen-pip-no-traffic-lights.uc.css": string(ucCSS),
		"chrome/JS/zen-pip-no-traffic-lights.uc.js":   string(js),
	}

	pipGate := `html[windowtype="Toolkit:PictureInPicture"]`
	hideNeedles := []string{
		pipGate + " #close",
		pipGate + " #minimize",
		pipGate + " #controls-bottom-gradient",
		pipGate + " .controls-bottom-upper",
		pipGate + " .start-controls",
		pipGate + " .end-controls",
		pipGate + " #seekBackward",
		pipGate + " #seekForward",
		"display: none !important",
	}
	unpipNeedles := []string{
		pipGate + " #unpip",
		pipGate + ` #unpip[mac="true"]`,
		"right: auto !important",
		"background-color: transparent !important",
		"fill: #ffffff !important",
		"fill-opacity: 1 !important",
		"color: #ffffff !important",
		"drop-shadow(0 2px 4px rgba(0, 0, 0, 0.75))",
		"-moz-context-properties: fill, fill-opacity !important",
	}
	tooltipNeedles := []string{
		pipGate + " .control-item:hover::after",
		pipGate + " .control-item:focus-visible::after",
		"content: none !important",
	}
	containerNeedles := []string{
		pipGate + " #controls",
		"container-type: size !important",
		"cqi",
	}
	playNeedles := []string{
		pipGate + " #playpause",
		"bottom:",
		"left:",
	}
	sizeCapNeedles := []string{
		"max-width: 48px !important",
		"max-height: 48px !important",
	}
	inactiveNeedles := []string{
		":-moz-window-inactive",
		"pip-inactive",
		"#controls:hover #unpip",
		"#controls:hover #playpause",
	}

	for path, body := range sources {
		for _, needle := range hideNeedles {
			if !strings.Contains(body, needle) {
				t.Errorf("%s missing hide rule fragment %q", path, needle)
			}
		}
		// Must keep #controls-bottom available for #playpause (BR-pip-02).
		if strings.Contains(body, pipGate+" #controls-bottom,") ||
			strings.Contains(body, pipGate+" #controls-bottom {") ||
			strings.Contains(body, pipGate+" #controls-bottom\n") {
			// Allow rules that style #controls-bottom, but not display:none on it alone in a hide group.
			if strings.Contains(body, `#controls-bottom,
html[windowtype="Toolkit:PictureInPicture"] #controls-bottom-gradient`) ||
				strings.Contains(body, `#controls-bottom,
html[windowtype="Toolkit:PictureInPicture"] #controls-bottom-gradient {
  display: none`) {
				t.Errorf("%s must not hide whole #controls-bottom with #controls-bottom-gradient", path)
			}
		}
		if strings.Contains(body, `#minimize,
html[windowtype="Toolkit:PictureInPicture"] #controls-bottom,
html[windowtype="Toolkit:PictureInPicture"] #controls-bottom-gradient`) {
			t.Errorf("%s must not list #controls-bottom in the hide block with #close/#minimize", path)
		}
		for _, needle := range unpipNeedles {
			if !strings.Contains(body, needle) {
				t.Errorf("%s missing #unpip rule fragment %q", path, needle)
			}
		}
		for _, needle := range tooltipNeedles {
			if !strings.Contains(body, needle) {
				t.Errorf("%s missing tooltip-suppress fragment %q", path, needle)
			}
		}
		for _, needle := range containerNeedles {
			if !strings.Contains(body, needle) {
				t.Errorf("%s missing container/cqi fragment %q", path, needle)
			}
		}
		for _, needle := range playNeedles {
			if !strings.Contains(body, needle) {
				t.Errorf("%s missing #playpause rule fragment %q", path, needle)
			}
		}
		for _, needle := range sizeCapNeedles {
			if !strings.Contains(body, needle) {
				t.Errorf("%s missing button size cap fragment %q", path, needle)
			}
		}
		for _, needle := range inactiveNeedles {
			if !strings.Contains(body, needle) {
				t.Errorf("%s missing outside-click/inactive hide fragment %q", path, needle)
			}
		}
		if strings.Contains(body, "max-width: none") {
			t.Errorf("%s must not specify max-width: none (cap size at 48px)", path)
		}
		if !strings.Contains(body, "#unpip") || !strings.Contains(body, "cqi") {
			t.Errorf("%s must size #unpip with cqi", path)
		}
		if !strings.Contains(body, "#playpause") || !strings.Contains(body, "cqi") {
			t.Errorf("%s must size #playpause with cqi", path)
		}
		if strings.Contains(body, "background: transparent") ||
			strings.Contains(body, "background-image: none") {
			t.Errorf("%s must not clear icon background-image via shorthand/none", path)
		}
		// Must not target main browser chrome from this PiP sheet.
		for _, banned := range []string{
			"#zen-appcontent-navbar-wrapper",
			"toolbox#navigator-toolbox",
			"--zen-toolbar-height",
		} {
			if strings.Contains(body, banned) {
				t.Errorf("%s must not touch main Zen chrome (%q)", path, banned)
			}
		}
	}

	jsBody := string(js)
	if !strings.Contains(jsBody, "loadSheetUsingURI") {
		t.Error("uc.js must inject via windowUtils.loadSheetUsingURI (CSP blocks inline <style>)")
	}
	if !strings.Contains(jsBody, "AUTHOR_SHEET") {
		t.Error("uc.js must use AUTHOR_SHEET (not AGENT_SHEET) for PiP-only inject")
	}
	if strings.Contains(jsBody, "nsIDOMWindowUtils.AGENT_SHEET") {
		t.Error("uc.js must not register nsIDOMWindowUtils.AGENT_SHEET for PiP overlay CSS")
	}
	if !strings.Contains(jsBody, `addEventListener("blur"`) {
		t.Error("uc.js must listen for blur to hide controls when clicking out of PiP")
	}
	if !strings.Contains(jsBody, `addEventListener("focus"`) {
		t.Error("uc.js must listen for focus to restore controls when returning to PiP")
	}

	uc := string(ucCSS)
	if !strings.Contains(uc, "@include        chrome://global/content/pictureinpicture/player.xhtml") {
		t.Error(".uc.css must @include the PiP player.xhtml so fx-autoconfig injects it")
	}
	// Unclosed /* ==UserScript== headers make fx-autoconfig drop @include and
	// fall back to browser.xhtml — which wrecks main Zen.
	if !strings.Contains(uc, "==/UserScript==*/") {
		t.Error(`.uc.css header must close with "==/UserScript==*/"`)
	}
}
