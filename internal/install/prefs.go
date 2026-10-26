package install

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// FeatureToggles control zen.pip.* user.js prefs.
type FeatureToggles struct {
	Pan               bool
	Pinch             bool
	AutoSpace         bool
	HideTrafficLights bool
	MasterGestures    bool
}

// DefaultFeatureToggles enables every feature.
func DefaultFeatureToggles() FeatureToggles {
	return FeatureToggles{
		Pan:               true,
		Pinch:             true,
		AutoSpace:         true,
		HideTrafficLights: true,
		MasterGestures:    true,
	}
}

// WriteUserPrefs merges required prefs into profile/user.js.
func WriteUserPrefs(profilePath string, t FeatureToggles) error {
	path := profilePath + "/user.js"
	prefs := map[string]string{
		"media.videocontrols.picture-in-picture.enabled":                            "true",
		"media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled": "true",
		"zen.pip.trackpadGestures.enabled":                                          boolJS(t.MasterGestures),
		"zen.pip.gestures.pan.enabled":                                              boolJS(t.Pan),
		"zen.pip.gestures.pinch.enabled":                                            boolJS(t.Pinch),
		"zen.pip.autoSpace.enabled":                                                 boolJS(t.AutoSpace),
		"zen.pip.hideTrafficLights.enabled":                                         boolJS(t.HideTrafficLights),
	}

	existing := map[string]string{}
	var other []string
	if data, err := os.ReadFile(path); err == nil {
		sc := bufio.NewScanner(strings.NewReader(string(data)))
		for sc.Scan() {
			line := sc.Text()
			name, ok := parseUserPrefLine(line)
			if !ok {
				other = append(other, line)
				continue
			}
			if _, keep := prefs[name]; keep {
				continue
			}
			existing[name] = line
		}
	}

	var b strings.Builder
	for _, line := range other {
		if strings.TrimSpace(line) == "" {
			continue
		}
		b.WriteString(line)
		b.WriteByte('\n')
	}
	for _, line := range existing {
		b.WriteString(line)
		b.WriteByte('\n')
	}
	for name, val := range prefs {
		fmt.Fprintf(&b, "user_pref(%q, %s);\n", name, val)
	}
	return os.WriteFile(path, []byte(b.String()), 0o644)
}

func boolJS(v bool) string {
	if v {
		return "true"
	}
	return "false"
}

func parseUserPrefLine(line string) (name string, ok bool) {
	line = strings.TrimSpace(line)
	const prefix = `user_pref("`
	if !strings.HasPrefix(line, prefix) {
		return "", false
	}
	rest := strings.TrimPrefix(line, prefix)
	i := strings.Index(rest, `"`)
	if i <= 0 {
		return "", false
	}
	return rest[:i], true
}
