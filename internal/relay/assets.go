package relay

import (
	"embed"
)

//go:embed assets/*
var assets embed.FS

func Asset(name string) ([]byte, error) { return assets.ReadFile("assets/" + name) }
