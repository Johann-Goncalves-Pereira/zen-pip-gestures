package install_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/install"
)

func TestZenInstalled(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	apps := filepath.Join(root, "Applications")
	homeApps := filepath.Join(root, "HomeApplications")
	if err := os.MkdirAll(apps, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(homeApps, 0o755); err != nil {
		t.Fatal(err)
	}

	paths := install.ZenPaths{Applications: apps, HomeApplications: homeApps}
	if install.ZenInstalled(paths) {
		t.Fatal("expected not installed")
	}

	if err := os.Mkdir(filepath.Join(apps, "Zen.app"), 0o755); err != nil {
		t.Fatal(err)
	}
	if !install.ZenInstalled(paths) {
		t.Fatal("expected installed via /Applications")
	}

	if err := os.Remove(filepath.Join(apps, "Zen.app")); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(homeApps, "Zen.app"), 0o755); err != nil {
		t.Fatal(err)
	}
	if !install.ZenInstalled(paths) {
		t.Fatal("expected installed via ~/Applications")
	}
}

func TestIsPatched(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	app := filepath.Join(root, "Zen.app")
	res := filepath.Join(app, "Contents", "Resources")
	pref := filepath.Join(res, "defaults", "pref")
	if err := os.MkdirAll(pref, 0o755); err != nil {
		t.Fatal(err)
	}
	if install.IsPatched(app) {
		t.Fatal("expected unpatched")
	}
	if err := os.WriteFile(filepath.Join(res, "config.js"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if install.IsPatched(app) {
		t.Fatal("expected still unpatched without config-prefs.js")
	}
	if err := os.WriteFile(filepath.Join(pref, "config-prefs.js"), []byte("y"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !install.IsPatched(app) {
		t.Fatal("expected patched")
	}
}

func TestZenMissingHints(t *testing.T) {
	t.Parallel()
	h := install.ZenMissingHints()
	if h == "" {
		t.Fatal("expected non-empty hints")
	}
	if !containsAll(h, "zen-browser.app", "brew install --cask zen-browser") {
		t.Fatalf("hints missing official install guidance: %q", h)
	}
}

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !strings.Contains(s, p) {
			return false
		}
	}
	return true
}
