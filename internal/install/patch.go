package install

import (
	"archive/zip"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/assets"
)

const fxAutoconfigZip = "https://github.com/MrOtherGuy/fx-autoconfig/archive/refs/heads/master.zip"

// Config is the installer run configuration.
type Config struct {
	Zen             ZenPaths
	ZenSupport      string
	Profiles        []Profile
	Features        FeatureToggles
	DataDir         string // extracted scripts live here
	SkipLaunchAgent bool
	QuitZen         bool
	FxChrome        string // set by fx-autoconfig step
}

// DefaultConfig fills OS-specific paths.
func DefaultConfig() (Config, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return Config{}, err
	}
	return Config{
		Zen:        DefaultZenPaths(),
		ZenSupport: filepath.Join(home, "Library", "Application Support", "zen"),
		Features:   DefaultFeatureToggles(),
		DataDir:    filepath.Join(home, ".local", "share", "zen-pip-gestures"),
		QuitZen:    true,
	}, nil
}

// Step is one install action.
type Step struct {
	ID   string
	Name string
	Run  func(cfg *Config) error
}

// Steps returns the ordered install pipeline.
func Steps() []Step {
	return []Step{
		{ID: "quit", Name: "Quit Zen", Run: stepQuitZen},
		{ID: "copy-app", Name: "Copy Zen to ~/Applications", Run: stepCopyApp},
		{ID: "fx-autoconfig", Name: "Download & install fx-autoconfig", Run: stepFxAutoconfig},
		{ID: "codesign", Name: "Ad-hoc codesign", Run: stepCodesign},
		{ID: "profiles", Name: "Install scripts into profiles", Run: stepProfiles},
		{ID: "data-dir", Name: "Extract helper scripts", Run: stepDataDir},
		{ID: "launchagent", Name: "Install auto-repatch LaunchAgent", Run: stepLaunchAgent},
	}
}

func stepQuitZen(cfg *Config) error {
	if !cfg.QuitZen {
		return nil
	}
	_ = exec.Command("osascript", "-e", `tell application "Zen" to quit`).Run()
	for _, name := range []string{"Zen", "zen", "zen-bin"} {
		_ = exec.Command("killall", name).Run()
	}
	time.Sleep(time.Second)
	if running := zenProcessRunning(); running {
		_ = exec.Command("killall", "-9", "Zen", "zen-bin").Run()
		time.Sleep(time.Second)
	}
	return nil
}

func zenProcessRunning() bool {
	out, err := exec.Command("pgrep", "-if", `Zen\.app|zen-bin`).CombinedOutput()
	if err != nil {
		return false
	}
	return len(strings.TrimSpace(string(out))) > 0
}

func stepCopyApp(cfg *Config) error {
	if runtime.GOOS != "darwin" {
		return fmt.Errorf("macOS only")
	}
	dst := HomeZenAppPath(cfg.Zen)
	stock := StockZenAppPath(cfg.Zen)
	if stock == "" && !dirExists(dst) {
		return fmt.Errorf("Zen.app not found")
	}
	if err := os.MkdirAll(cfg.Zen.HomeApplications, 0o755); err != nil {
		return err
	}
	if stock != "" && stock != dst {
		if err := os.RemoveAll(dst); err != nil {
			return err
		}
		if err := exec.Command("ditto", stock, dst).Run(); err != nil {
			return fmt.Errorf("ditto: %w", err)
		}
	}
	if !dirExists(dst) {
		return fmt.Errorf("Zen.app not found after copy")
	}
	return nil
}

func stepFxAutoconfig(cfg *Config) error {
	dst := HomeZenAppPath(cfg.Zen)
	tmp, err := os.MkdirTemp("", "zen-pip-fx-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)

	zipPath := filepath.Join(tmp, "fx.zip")
	if err := downloadFile(fxAutoconfigZip, zipPath); err != nil {
		return fmt.Errorf("download fx-autoconfig: %w", err)
	}
	if err := unzip(zipPath, tmp); err != nil {
		return fmt.Errorf("unpack fx-autoconfig: %w", err)
	}
	fxDir, err := findFxRoot(tmp)
	if err != nil {
		return err
	}
	res := filepath.Join(dst, "Contents", "Resources")
	if err := copyFile(filepath.Join(fxDir, "program", "config.js"), filepath.Join(res, "config.js")); err != nil {
		return err
	}
	prefDir := filepath.Join(res, "defaults", "pref")
	if err := os.MkdirAll(prefDir, 0o755); err != nil {
		return err
	}
	if err := copyFile(
		filepath.Join(fxDir, "program", "defaults", "pref", "config-prefs.js"),
		filepath.Join(prefDir, "config-prefs.js"),
	); err != nil {
		return err
	}
	cfg.FxChrome = filepath.Join(fxDir, "profile", "chrome")
	// Keep fx chrome for profile merge — copy to DataDir so it survives tmp cleanup.
	kept := filepath.Join(cfg.DataDir, "fx-chrome")
	_ = os.RemoveAll(kept)
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		return err
	}
	if err := copyDir(cfg.FxChrome, kept); err != nil {
		return err
	}
	cfg.FxChrome = kept
	return nil
}

func findFxRoot(tmp string) (string, error) {
	entries, err := os.ReadDir(tmp)
	if err != nil {
		return "", err
	}
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "fx-autoconfig-") {
			p := filepath.Join(tmp, e.Name())
			if fileExists(filepath.Join(p, "program", "config.js")) {
				return p, nil
			}
		}
	}
	return "", fmt.Errorf("unpack fx-autoconfig: root not found")
}

func stepCodesign(cfg *Config) error {
	dst := HomeZenAppPath(cfg.Zen)
	_ = exec.Command("xattr", "-cr", dst).Run()
	cmd := exec.Command("codesign", "--force", "--deep", "--sign", "-", dst)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("codesign: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func stepProfiles(cfg *Config) error {
	if len(cfg.Profiles) == 0 {
		return fmt.Errorf("profile: none selected")
	}
	if cfg.FxChrome == "" {
		return fmt.Errorf("fx-autoconfig chrome missing — re-run fx-autoconfig step")
	}
	for _, p := range cfg.Profiles {
		chrome := filepath.Join(p.Path, "chrome")
		if err := os.MkdirAll(filepath.Join(chrome, "JS"), 0o755); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Join(chrome, "CSS"), 0o755); err != nil {
			return err
		}
		if err := copyDir(cfg.FxChrome, chrome); err != nil {
			return fmt.Errorf("merge fx chrome: %w", err)
		}
		if err := copyEmbeddedChrome(chrome); err != nil {
			return err
		}
		if err := WriteUserPrefs(p.Path, cfg.Features); err != nil {
			return err
		}
	}
	return nil
}

func stepDataDir(cfg *Config) error {
	if err := os.MkdirAll(filepath.Join(cfg.DataDir, "scripts"), 0o755); err != nil {
		return err
	}
	if err := extractEmbedFS(assets.Scripts, "scripts", filepath.Join(cfg.DataDir, "scripts"), 0o755); err != nil {
		return err
	}
	// chrome/ next to scripts so repatch-on-update.sh can copy from DataDir as repo root.
	return extractEmbedFS(assets.Chrome, "chrome", filepath.Join(cfg.DataDir, "chrome"), 0o644)
}

func extractEmbedFS(efs fs.FS, root, destRoot string, fileMode fs.FileMode) error {
	return fs.WalkDir(efs, root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		dest := filepath.Join(destRoot, rel)
		data, err := fs.ReadFile(efs, path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return err
		}
		return os.WriteFile(dest, data, fileMode)
	})
}

func stepLaunchAgent(cfg *Config) error {
	if cfg.SkipLaunchAgent {
		return nil
	}
	script := filepath.Join(cfg.DataDir, "scripts", "install-launch-agent.sh")
	if !fileExists(script) {
		return fmt.Errorf("launchagent: missing %s", script)
	}
	// Rewrite repatch script's REPO_ROOT expectation: install-launch-agent uses dirname/..
	// which is DataDir when scripts live in DataDir/scripts.
	cmd := exec.Command("/bin/bash", script)
	cmd.Dir = cfg.DataDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("launchagent: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func copyEmbeddedChrome(profileChrome string) error {
	return fs.WalkDir(assets.Chrome, "chrome", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel("chrome", path)
		if err != nil {
			return err
		}
		dest := filepath.Join(profileChrome, rel)
		data, err := assets.Chrome.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return err
		}
		return os.WriteFile(dest, data, 0o644)
	})
}

func downloadFile(url, dest string) error {
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download: HTTP %d", resp.StatusCode)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func unzip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()
	destClean := filepath.Clean(dest) + string(os.PathSeparator)
	for _, f := range r.File {
		target := filepath.Join(dest, f.Name)
		if !strings.HasPrefix(filepath.Clean(target)+string(os.PathSeparator), destClean) &&
			filepath.Clean(target) != filepath.Clean(dest) {
			return fmt.Errorf("illegal path in zip")
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		out.Close()
		rc.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func copyDir(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(path, target)
	})
}
