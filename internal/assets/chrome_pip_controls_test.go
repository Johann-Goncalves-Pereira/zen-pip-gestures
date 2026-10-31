package assets_test

import (
	"strings"
	"testing"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/assets"
)

// TestPiPControlsOverlayMinimalUnpip asserts BR-pip-02 / BR-pip-03 / BR-pip-04:
// PiP-only overlay CSS (windowtype-gated) and CSP-safe sheet loading.
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
		pipGate + " #controls-bottom",
		pipGate + " #controls-bottom-gradient",
		"display: none !important",
	}
	unpipNeedles := []string{
		pipGate + " #unpip",
		pipGate + ` #unpip[mac="true"]`,
		"left: 10px !important",
		"right: auto !important",
		"top: 10px !important",
		"background-color: transparent !important",
		"fill: #ffffff !important",
		"fill-opacity: 1 !important",
		"color: #ffffff !important",
		"drop-shadow(0 2px 4px rgba(0, 0, 0, 0.75))",
		"-moz-context-properties: fill, fill-opacity !important",
	}

	for path, body := range sources {
		for _, needle := range hideNeedles {
			if !strings.Contains(body, needle) {
				t.Errorf("%s missing hide rule fragment %q", path, needle)
			}
		}
		for _, needle := range unpipNeedles {
			if !strings.Contains(body, needle) {
				t.Errorf("%s missing #unpip rule fragment %q", path, needle)
			}
		}
		if strings.Contains(body, "background: transparent") ||
			strings.Contains(body, "background-image: none") {
			t.Errorf("%s must not clear #unpip background-image via shorthand/none", path)
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
