package install_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/install"
)

// TestStepCopyAppSkipsWhenApplicationsSymlinksHome asserts the installer does
// not RemoveAll+ditto when /Applications/Zen.app resolves to ~/Applications/Zen.app.
func TestStepCopyAppSkipsWhenApplicationsSymlinksHome(t *testing.T) {
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
	homeZen := filepath.Join(homeApps, "Zen.app")
	if err := os.MkdirAll(filepath.Join(homeZen, "Contents"), 0o755); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(homeZen, "Contents", "KEEP")
	if err := os.WriteFile(marker, []byte("safe"), 0o644); err != nil {
		t.Fatal(err)
	}
	stockZen := filepath.Join(apps, "Zen.app")
	if err := os.Symlink(homeZen, stockZen); err != nil {
		t.Fatal(err)
	}

	cfg := &install.Config{
		Zen: install.ZenPaths{Applications: apps, HomeApplications: homeApps},
	}
	steps := install.Steps()
	var copyStep install.Step
	for _, s := range steps {
		if s.ID == "copy-app" {
			copyStep = s
			break
		}
	}
	if copyStep.Run == nil {
		t.Fatal("copy-app step missing")
	}
	if err := copyStep.Run(cfg); err != nil {
		t.Fatalf("copy-app: %v", err)
	}
	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("home Zen.app was destroyed (marker missing): %v", err)
	}
}
