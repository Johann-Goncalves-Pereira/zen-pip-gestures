package install

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Profile is one Zen/Firefox profile from profiles.ini.
type Profile struct {
	Name      string
	Path      string // absolute
	IsDefault bool
}

// ParseProfilesIni reads profiles.ini and resolves paths against zenSupportDir.
func ParseProfilesIni(iniPath, zenSupportDir string) ([]Profile, error) {
	f, err := os.Open(iniPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var (
		out        []Profile
		inProfile  bool
		name       string
		relPath    string
		isDefault  bool
		isRelative = true
	)

	flush := func() {
		if !inProfile || relPath == "" {
			return
		}
		p := Profile{Name: name, IsDefault: isDefault}
		if filepath.IsAbs(relPath) {
			p.Path = relPath
		} else {
			p.Path = filepath.Join(zenSupportDir, relPath)
		}
		if p.Name == "" {
			p.Name = filepath.Base(p.Path)
		}
		out = append(out, p)
		inProfile = false
		name = ""
		relPath = ""
		isDefault = false
		isRelative = true
	}

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			flush()
			sec := line[1 : len(line)-1]
			inProfile = strings.HasPrefix(sec, "Profile")
			continue
		}
		if !inProfile {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		switch key {
		case "Name":
			name = val
		case "Path":
			relPath = val
		case "Default":
			isDefault = val == "1"
		case "IsRelative":
			isRelative = val != "0"
			_ = isRelative
		}
	}
	flush()
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// ListSelectableProfiles returns profiles that have prefs.js.
func ListSelectableProfiles(zenSupportDir string) ([]Profile, error) {
	ini := filepath.Join(zenSupportDir, "profiles.ini")
	profiles, err := ParseProfilesIni(ini, zenSupportDir)
	if err != nil {
		if os.IsNotExist(err) {
			return scanProfilesFallback(zenSupportDir)
		}
		return nil, err
	}
	var out []Profile
	for _, p := range profiles {
		if fileExists(filepath.Join(p.Path, "prefs.js")) {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return scanProfilesFallback(zenSupportDir)
	}
	return out, nil
}

func scanProfilesFallback(zenSupportDir string) ([]Profile, error) {
	root := filepath.Join(zenSupportDir, "Profiles")
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("no Zen profiles found under %s", zenSupportDir)
		}
		return nil, err
	}
	var out []Profile
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		path := filepath.Join(root, e.Name())
		if !fileExists(filepath.Join(path, "prefs.js")) {
			continue
		}
		out = append(out, Profile{Name: e.Name(), Path: path})
	}
	return out, nil
}
