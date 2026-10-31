package assets_test

import (
	"strings"
	"testing"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/assets"
)

// TestPiPControlsOverlayMinimalUnpip asserts BR-pip-02 and BR-pip-03:
// companion CSS and INLINE_CSS hide chrome overlays and leave only a
// top-left white Back-to-Tab (#unpip) with drop shadow.
func TestPiPControlsOverlayMinimalUnpip(t *testing.T) {
	t.Parallel()

	css, err := assets.Chrome.ReadFile("chrome/CSS/zen-pip-no-traffic-lights.css")
	if err != nil {
		t.Fatalf("read companion CSS: %v", err)
	}
	js, err := assets.Chrome.ReadFile("chrome/JS/zen-pip-no-traffic-lights.uc.js")
	if err != nil {
		t.Fatalf("read PiP script: %v", err)
	}

	sources := map[string]string{
		"chrome/CSS/zen-pip-no-traffic-lights.css":  string(css),
		"chrome/JS/zen-pip-no-traffic-lights.uc.js": string(js),
	}

	hideNeedles := []string{
		"#close",
		"#minimize",
		"#controls-bottom",
		"#controls-bottom-gradient",
		"display: none !important",
	}
	unpipNeedles := []string{
		"#unpip",
		`#unpip[mac="true"]`,
		"left: 10px !important",
		"right: auto !important",
		"top: 10px !important",
		"background: transparent !important",
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
	}
}
