package install

import (
	"os"
	"path/filepath"
	"strings"
)

// ZenPaths locates Zen.app roots (injectable for tests).
type ZenPaths struct {
	Applications     string
	HomeApplications string
}

// DefaultZenPaths uses the current user's home directory.
func DefaultZenPaths() ZenPaths {
	home, err := os.UserHomeDir()
	if err != nil {
		home = ""
	}
	return ZenPaths{
		Applications:     "/Applications",
		HomeApplications: filepath.Join(home, "Applications"),
	}
}

// ZenAppPath returns the preferred Zen.app path if installed.
func ZenAppPath(p ZenPaths) string {
	home := filepath.Join(p.HomeApplications, "Zen.app")
	stock := filepath.Join(p.Applications, "Zen.app")
	if dirExists(home) {
		return home
	}
	if dirExists(stock) {
		return stock
	}
	return ""
}

// StockZenAppPath returns /Applications/Zen.app when present.
func StockZenAppPath(p ZenPaths) string {
	stock := filepath.Join(p.Applications, "Zen.app")
	if dirExists(stock) {
		return stock
	}
	return ""
}

// HomeZenAppPath returns ~/Applications/Zen.app path (may not exist).
func HomeZenAppPath(p ZenPaths) string {
	return filepath.Join(p.HomeApplications, "Zen.app")
}

// ZenInstalled reports whether Zen.app exists in Applications or HomeApplications.
func ZenInstalled(p ZenPaths) bool {
	return ZenAppPath(p) != ""
}

// IsPatched is true when fx-autoconfig loader files are present.
func IsPatched(appPath string) bool {
	if appPath == "" {
		return false
	}
	res := filepath.Join(appPath, "Contents", "Resources")
	config := filepath.Join(res, "config.js")
	prefs := filepath.Join(res, "defaults", "pref", "config-prefs.js")
	return fileExists(config) && fileExists(prefs)
}

// ZenMissingHints returns official install guidance for the TUI.
func ZenMissingHints() string {
	var b strings.Builder
	b.WriteString("Zen Browser was not found in /Applications or ~/Applications.\n\n")
	b.WriteString("Install it officially, then come back:\n\n")
	b.WriteString("  • Website: https://zen-browser.app\n")
	b.WriteString("  • Homebrew: brew install --cask zen-browser\n")
	return b.String()
}

func dirExists(path string) bool {
	st, err := os.Stat(path)
	return err == nil && st.IsDir()
}

func fileExists(path string) bool {
	st, err := os.Stat(path)
	return err == nil && !st.IsDir()
}
