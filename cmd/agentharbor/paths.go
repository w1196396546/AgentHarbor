package main

import (
	"errors"
	"os"
	"path/filepath"
)

func defaultDataDir(base string) string {
	// Keep existing registrations, grants and private credentials at their original path.
	for _, name := range []string{"codex-remote", "anywhereToAgent"} {
		legacy := filepath.Join(base, name)
		if _, err := os.Lstat(legacy); !errors.Is(err, os.ErrNotExist) {
			return legacy
		}
	}
	return filepath.Join(base, "agentharbor")
}
