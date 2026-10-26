# Spec catalog — Business Rules & Use Cases

Every behavioral claim in the wiki has a row here before implementation. The
test named in the row is written in the same step, and it fails until the
behavior exists.

| Kind | Meaning |
| ---- | ------- |
| `asserted-integration` | Across modules, or UI to domain |
| `asserted-unit` | One module |
| `asserted-loopback` | Live protocol on loopback |
| `fail-closed` | Deferred or refused; the test proves refusal |

**ID scheme**

| Prefix | Meaning |
| ------ | ------- |
| `BR-<area>-<nn>` | Invariant |
| `UC-<area>-<nn>` | Acceptance journey |

## Catalog

| ID | Rule (one line) | Source | Owner | Test | Kind |
| -- | --------------- | ------ | ----- | ---- | ---- |
| BR-install-01 | Zen is considered installed only if Zen.app exists under `/Applications` or `~/Applications` | product | install | `TestZenInstalled` | asserted-unit |
| BR-install-02 | `IsPatched` is true only when both `config.js` and `defaults/pref/config-prefs.js` exist under Resources | product | install | `TestIsPatched` | asserted-unit |
| BR-install-03 | `ParseProfilesIni` returns every Profile section with resolved absolute path; Default=1 is marked | product | install | `TestParseProfilesIni` | asserted-unit |
| BR-install-04 | Profiles without `prefs.js` are omitted from selectable list | product | install | `TestListSelectableProfiles` | asserted-unit |
| UC-install-01 | Missing Zen → official install hints; retry re-checks filesystem | product | install | `TestZenMissingHints` | asserted-unit |
| BR-toolbar-01 | Main chrome forces `--zen-toolbar-height` / `--zen-toolbar-height-with-bookmarks` to 8px and hides titlebar buttons | product | chrome | manual (Browser Toolbox) | fail-closed |
| BR-toolbar-02 | Hover must not apply negative `margin-top` on `.browserContainer` (`has-toolbar-hovered`) | product | chrome | manual + `zen.view.shift-down-site-on-hover=true` | fail-closed |
