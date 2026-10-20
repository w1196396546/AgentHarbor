package main

import (
	"errors"
	"os"
	"path/filepath"
)

func defaultDataDir(base string) string {
	legacy := filepath.Join(base, "codex-remote")
	// Keep existing registrations, grants and private credentials at their original path.
	if _, err := os.Lstat(legacy); !errors.Is(err, os.ErrNotExist) {
		return legacy
	}
	return filepath.Join(base, "anywhereToAgent")
}
