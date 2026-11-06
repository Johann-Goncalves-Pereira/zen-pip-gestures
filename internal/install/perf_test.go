package install_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/install"
)

func TestQuitWaitsUntilProcessGone(t *testing.T) {
	t.Parallel()

	var polls int
	running := func() bool {
		polls++
		return polls < 3
	}
	start := time.Now()
	if !install.WaitUntilStopped(300*time.Millisecond, 5*time.Millisecond, running) {
		t.Fatal("expected the process to be gone before the deadline")
	}
	if elapsed := time.Since(start); elapsed >= 250*time.Millisecond {
		t.Fatalf("poll returned late: %s", elapsed)
	}

	start = time.Now()
	if install.WaitUntilStopped(40*time.Millisecond, 5*time.Millisecond, func() bool { return true }) {
		t.Fatal("expected the process to still be running at the deadline")
	}
	if elapsed := time.Since(start); elapsed < 30*time.Millisecond {
		t.Fatalf("returned before the deadline: %s", elapsed)
	}
}

func TestSkipCopyWhenSamePatchedBuild(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	stock := writeFakeZenApp(t, root, "stock", "1.0.2", false)
	home := writeFakeZenApp(t, root, "home", "1.0.2", true)
	cache := filepath.Join(root, "fx-chrome")

	// Same version and home patched → skip ditto. Download still required
	// until the fx chrome cache exists.
	if !install.SamePatchedBuild(stock, home) {
		t.Fatal("expected same patched build")
	}
	if install.SkipFxDownload(stock, home, cache) {
		t.Fatal("expected download while fx chrome cache is missing")
	}

	if err := os.MkdirAll(filepath.Join(cache, "utils"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cache, "utils", "boot.sys.mjs"), []byte("export {}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !install.SkipFxDownload(stock, home, cache) {
		t.Fatal("expected to skip the fx-autoconfig download")
	}

	newer := writeFakeZenApp(t, root, "newer-stock", "1.0.3", false)
	if install.SamePatchedBuild(newer, home) {
		t.Fatal("expected copy when stock CFBundleVersion differs")
	}
	if install.SkipFxDownload(newer, home, cache) {
		t.Fatal("expected download when versions differ")
	}

	unpatched := writeFakeZenApp(t, root, "unpatched-home", "1.0.2", false)
	if install.SamePatchedBuild(stock, unpatched) {
		t.Fatal("expected copy when the home app is not patched")
	}
}

func writeFakeZenApp(t *testing.T, root, name, version string, patched bool) string {
	t.Helper()
	app := filepath.Join(root, name, "Zen.app")
	res := filepath.Join(app, "Contents", "Resources")
	pref := filepath.Join(res, "defaults", "pref")
	if err := os.MkdirAll(pref, 0o755); err != nil {
		t.Fatal(err)
	}
	plist := filepath.Join(app, "Contents", "Info.plist")
	body := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleVersion</key>
<string>` + version + `</string>
</dict></plist>`
	if err := os.WriteFile(plist, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	if patched {
		if err := os.WriteFile(filepath.Join(res, "config.js"), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(pref, "config-prefs.js"), []byte("y"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return app
}
