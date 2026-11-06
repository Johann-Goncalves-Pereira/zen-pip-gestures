package install

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// BundleVersion reads CFBundleVersion from an app bundle.
// An unreadable or missing version is empty, which refuses a skip.
func BundleVersion(appPath string) string {
	if appPath == "" {
		return ""
	}
	path := filepath.Join(appPath, "Contents", "Info.plist")
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	if bytes.HasPrefix(data, []byte("bplist")) {
		return bundleVersionFromPlistBuddy(path)
	}
	return bundleVersionFromXML(data)
}

func bundleVersionFromXML(data []byte) string {
	const key = "<key>CFBundleVersion</key>"
	text := string(data)
	i := strings.Index(text, key)
	if i < 0 {
		return ""
	}
	rest := text[i+len(key):]
	start := strings.Index(rest, "<string>")
	end := strings.Index(rest, "</string>")
	if start < 0 || end < start {
		return ""
	}
	return strings.TrimSpace(rest[start+len("<string>") : end])
}

func bundleVersionFromPlistBuddy(path string) string {
	out, err := exec.Command("/usr/libexec/PlistBuddy", "-c", "Print :CFBundleVersion", path).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// SamePatchedBuild is true when home is already patched and its
// CFBundleVersion matches the stock app. Callers then skip ditto.
func SamePatchedBuild(stockApp, homeApp string) bool {
	if stockApp == "" || homeApp == "" || stockApp == homeApp {
		return false
	}
	if !dirExists(homeApp) || !IsPatched(homeApp) {
		return false
	}
	stockV := BundleVersion(stockApp)
	homeV := BundleVersion(homeApp)
	if stockV == "" || homeV == "" {
		return false
	}
	return stockV == homeV
}

// SkipFxDownload is true when the app copy can be skipped and a previous
// fx-autoconfig chrome tree is already on disk.
func SkipFxDownload(stockApp, homeApp, fxChromeCache string) bool {
	if !SamePatchedBuild(stockApp, homeApp) {
		return false
	}
	return fxChromeReady(fxChromeCache)
}

func fxChromeReady(dir string) bool {
	return fileExists(filepath.Join(dir, "utils", "boot.sys.mjs"))
}
