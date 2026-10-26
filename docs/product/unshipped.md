# Unshipped

Decisions explicitly out of scope for now:

- Linux / Windows installer binaries
- Full Go port of `repatch-on-update.sh` (shell remains; TUI installs the agent)
- Changing PiP gesture JS behavior beyond prefs already shipped

## Blocked on auth (local file ready)

- `.github/workflows/release.yml` exists locally but the GitHub OAuth token
  used by this environment lacks the `workflow` scope, so CI cannot be pushed
  yet. Releases are created manually (`go build` + `gh release create`) until
  someone with `workflow` scope pushes that file.
