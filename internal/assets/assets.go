package assets

import "embed"

// Chrome holds the PiP userChromeJS / CSS shipped inside the installer binary.
//
//go:embed all:chrome
var Chrome embed.FS
