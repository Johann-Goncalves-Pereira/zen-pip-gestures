package main

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"

	"github.com/Johann-Goncalves-Pereira/zen-pip-gestures/internal/install"
)

var (
	titleStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("205"))
	okStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	errStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("196"))
	mutedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, errStyle.Render("✗ "+err.Error()))
		os.Exit(1)
	}
}

func run() error {
	fmt.Println(titleStyle.Render("🖼️  Zen PiP gestures installer"))
	fmt.Println(mutedStyle.Render("Arc-like trackpad PiP — Charm TUI"))
	fmt.Println()

	var proceed bool
	if err := huh.NewConfirm().
		Title("Continue? This will quit Zen and patch ~/Applications/Zen.app").
		Affirmative("Yes, install").
		Negative("Cancel").
		Value(&proceed).
		Run(); err != nil {
		return err
	}
	if !proceed {
		fmt.Println(mutedStyle.Render("Cancelled."))
		return nil
	}

	cfg, err := install.DefaultConfig()
	if err != nil {
		return err
	}

	if err := ensureZen(&cfg); err != nil {
		return err
	}

	profiles, err := install.ListSelectableProfiles(cfg.ZenSupport)
	if err != nil {
		return fmt.Errorf("%s\n%s", err, install.ClassifyError("profile", err).Fix)
	}
	if len(profiles) == 0 {
		return fmt.Errorf("no Zen profiles with prefs.js — open Zen once, then retry")
	}

	selected, err := pickProfiles(profiles)
	if err != nil {
		return err
	}
	cfg.Profiles = selected

	features, err := pickFeatures()
	if err != nil {
		return err
	}
	cfg.Features = features

	if err := runSteps(&cfg); err != nil {
		return err
	}

	printSuccess(cfg)
	return nil
}

func ensureZen(cfg *install.Config) error {
	for {
		if install.ZenInstalled(cfg.Zen) {
			fmt.Println(okStyle.Render("✓ Zen.app found"))
			return nil
		}
		fmt.Println(errStyle.Render("✗ Zen not installed"))
		fmt.Println(install.ZenMissingHints())

		var retry bool
		if err := huh.NewConfirm().
			Title("Installed Zen now — try again?").
			Affirmative("Try again").
			Negative("Abort").
			Value(&retry).
			Run(); err != nil {
			return err
		}
		if !retry {
			return fmt.Errorf("Zen.app not found")
		}
	}
}

func pickProfiles(profiles []install.Profile) ([]install.Profile, error) {
	options := make([]huh.Option[string], 0, len(profiles))
	defaults := []string{}
	byPath := map[string]install.Profile{}
	for _, p := range profiles {
		label := p.Name
		if p.IsDefault {
			label += " (default)"
			defaults = append(defaults, p.Path)
		}
		label += " — " + p.Path
		options = append(options, huh.NewOption(label, p.Path))
		byPath[p.Path] = p
	}
	if len(defaults) == 0 && len(profiles) > 0 {
		defaults = []string{profiles[0].Path}
	}

	var chosen []string
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewMultiSelect[string]().
				Title("Which profiles should get the PiP scripts?").
				Options(options...).
				Value(&chosen).
				Validate(func(v []string) error {
					if len(v) == 0 {
						return fmt.Errorf("select at least one profile")
					}
					return nil
				}),
		),
	)
	// Pre-select defaults by setting chosen before Run when supported —
	// huh MultiSelect uses Value pointer; set initial:
	chosen = append([]string{}, defaults...)
	if err := form.Run(); err != nil {
		return nil, err
	}

	out := make([]install.Profile, 0, len(chosen))
	for _, path := range chosen {
		if p, ok := byPath[path]; ok {
			out = append(out, p)
		}
	}
	return out, nil
}

func pickFeatures() (install.FeatureToggles, error) {
	t := install.DefaultFeatureToggles()
	var (
		pan, pinch, space, lights bool
	)
	pan, pinch, space, lights = t.Pan, t.Pinch, t.AutoSpace, t.HideTrafficLights
	err := huh.NewForm(
		huh.NewGroup(
			huh.NewConfirm().Title("👆 Two-finger swipe (pan)").Value(&pan),
			huh.NewConfirm().Title("🤏 Pinch resize").Value(&pinch),
			huh.NewConfirm().Title("🚪 Auto-PiP on leave Zen / Space").Value(&space),
			huh.NewConfirm().Title("🙈 Hide traffic lights").Value(&lights),
		),
	).Run()
	if err != nil {
		return t, err
	}
	return install.FeatureToggles{
		Pan:               pan,
		Pinch:             pinch,
		AutoSpace:         space,
		HideTrafficLights: lights,
		MasterGestures:    pan || pinch,
	}, nil
}

func runSteps(cfg *install.Config) error {
	steps := install.Steps()
	for i := 0; i < len(steps); {
		step := steps[i]
		fmt.Printf("\n→ %s…\n", step.Name)
		err := step.Run(cfg)
		if err == nil {
			fmt.Println(okStyle.Render("  ✓ " + step.Name))
			i++
			continue
		}

		ce := install.ClassifyError(step.ID+" "+step.Name, err)
		fmt.Println(errStyle.Render("  ✗ " + ce.Summary))
		fmt.Println(mutedStyle.Render("  " + ce.Fix))
		fmt.Println(mutedStyle.Render("  detail: " + err.Error()))

		var action string
		if formErr := huh.NewSelect[string]().
			Title("What next?").
			Options(
				huh.NewOption("Retry this step", "retry"),
				huh.NewOption("Skip this step", "skip"),
				huh.NewOption("Abort install", "abort"),
			).
			Value(&action).
			Run(); formErr != nil {
			return formErr
		}
		switch action {
		case "retry":
			continue
		case "skip":
			fmt.Println(mutedStyle.Render("  (skipped)"))
			i++
		default:
			return fmt.Errorf("aborted at %s", step.Name)
		}
	}
	return nil
}

func printSuccess(cfg install.Config) {
	dst := install.HomeZenAppPath(cfg.Zen)
	fmt.Println()
	fmt.Println(okStyle.Render("🎉 Done!"))
	fmt.Println()
	fmt.Println(titleStyle.Render("Next steps"))
	fmt.Println("  1. open \"" + dst + "\"")
	fmt.Println("  2. Zen → Help → More Troubleshooting Information → Clear startup cache…")
	fmt.Println("  3. Play a video → PiP → two-finger drag / pinch")
	fmt.Println()

	var openNow bool
	_ = huh.NewConfirm().
		Title("Open patched Zen now?").
		Affirmative("Open").
		Negative("Not now").
		Value(&openNow).
		Run()
	if openNow {
		_ = exec.Command("open", dst).Run()
	}
}
