package install_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/install"
)

func TestParseProfilesIni(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	ini := filepath.Join(dir, "profiles.ini")
	content := `[General]
StartWithLastProfile=1

[Profile0]
Name=Default (release)
IsRelative=1
Path=Profiles/abc.Default (release)
Default=1

[Profile1]
Name=Other
IsRelative=1
Path=Profiles/other.profile
`
	if err := os.WriteFile(ini, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	profiles, err := install.ParseProfilesIni(ini, dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(profiles) != 2 {
		t.Fatalf("got %d profiles, want 2", len(profiles))
	}
	var def *install.Profile
	for i := range profiles {
		if profiles[i].IsDefault {
			def = &profiles[i]
		}
	}
	if def == nil {
		t.Fatal("expected a default profile")
	}
	want := filepath.Join(dir, "Profiles", "abc.Default (release)")
	if def.Path != want {
		t.Fatalf("default path = %q, want %q", def.Path, want)
	}
	if def.Name != "Default (release)" {
		t.Fatalf("name = %q", def.Name)
	}
}

func TestListSelectableProfiles(t *testing.T) {
	t.Parallel()
	zenSupport := t.TempDir()
	profDir := filepath.Join(zenSupport, "Profiles", "good.profile")
	badDir := filepath.Join(zenSupport, "Profiles", "bad.profile")
	if err := os.MkdirAll(profDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(badDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(profDir, "prefs.js"), []byte("//"), 0o644); err != nil {
		t.Fatal(err)
	}
	ini := filepath.Join(zenSupport, "profiles.ini")
	content := `[Profile0]
Name=Good
IsRelative=1
Path=Profiles/good.profile
Default=1

[Profile1]
Name=Bad
IsRelative=1
Path=Profiles/bad.profile
`
	if err := os.WriteFile(ini, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := install.ListSelectableProfiles(zenSupport)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d, want 1 (prefs.js required)", len(got))
	}
	if got[0].Name != "Good" {
		t.Fatalf("got %#v", got[0])
	}
}
