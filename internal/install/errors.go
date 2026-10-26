package install

import "strings"

// CommonError maps a failed step to README-style recovery text.
type CommonError struct {
	Code    string
	Summary string
	Fix     string
}

// ClassifyError returns a CommonError for a failed install step.
func ClassifyError(step string, err error) CommonError {
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	low := strings.ToLower(step + " " + msg)

	switch {
	case strings.Contains(low, "zen.app not found"), strings.Contains(low, "not installed"):
		return CommonError{
			Code:    "zen-missing",
			Summary: "Zen.app not found in /Applications or ~/Applications",
			Fix:     "Install Zen from https://zen-browser.app or: brew install --cask zen-browser — then retry.",
		}
	case strings.Contains(low, "profile"):
		return CommonError{
			Code:    "profile-missing",
			Summary: "Could not find / use the selected Zen profile",
			Fix:     "Open Zen once, then about:support → Profile Folder. Re-run and select that profile.",
		}
	case strings.Contains(low, "fx-autoconfig"), strings.Contains(low, "download"), strings.Contains(low, "network"):
		return CommonError{
			Code:    "network",
			Summary: "Could not download fx-autoconfig",
			Fix:     "Check internet / GitHub access and retry this step.",
		}
	case strings.Contains(low, "unpack"), strings.Contains(low, "zip"):
		return CommonError{
			Code:    "unpack",
			Summary: "Failed to unpack fx-autoconfig",
			Fix:     "Retry; free disk space if the zip is corrupt.",
		}
	case strings.Contains(low, "codesign"):
		return CommonError{
			Code:    "codesign",
			Summary: "codesign failed",
			Fix:     "Install Xcode Command Line Tools: xcode-select --install — then retry.",
		}
	case strings.Contains(low, "launchagent"), strings.Contains(low, "launchctl"):
		return CommonError{
			Code:    "launchagent",
			Summary: "LaunchAgent install failed",
			Fix:     "You can skip and later run scripts/install-launch-agent.sh from the data dir.",
		}
	default:
		return CommonError{
			Code:    "unknown",
			Summary: "Step failed: " + step,
			Fix:     msg + "\nSee README → Troubleshooting / Common errors.",
		}
	}
}
