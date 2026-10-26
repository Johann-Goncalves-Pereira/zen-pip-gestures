package assets

import "embed"

// Scripts holds shell helpers extracted next to the data dir for LaunchAgent.
//
//go:embed all:scripts
var Scripts embed.FS
