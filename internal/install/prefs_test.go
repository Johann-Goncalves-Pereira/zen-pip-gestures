package install_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/install"
)

func TestWriteUserPrefsStripsGestureWidthPrefs(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "user.js")
	before := `user_pref("userChromeJS.enabled", true);
user_pref("zen.pip.gestures.minWidth", 200);
user_pref("zen.pip.gestures.maxWidth", 900);
user_pref("zen.pip.gestures.pan.enabled", false);
`
	if err := os.WriteFile(path, []byte(before), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := install.WriteUserPrefs(dir, install.DefaultFeatureToggles()); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	got := string(data)
	for _, banned := range []string{
		"zen.pip.gestures.minWidth",
		"zen.pip.gestures.maxWidth",
	} {
		if strings.Contains(got, banned) {
			t.Fatalf("user.js still contains %q:\n%s", banned, got)
		}
	}
	if !strings.Contains(got, `user_pref("userChromeJS.enabled", true)`) {
		t.Fatalf("expected unrelated pref preserved:\n%s", got)
	}
	if !strings.Contains(got, `user_pref("zen.pip.gestures.pan.enabled", true)`) {
		t.Fatalf("expected managed pan pref rewritten to true:\n%s", got)
	}
}
