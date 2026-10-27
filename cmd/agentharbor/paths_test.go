package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultDataDirKeepsExistingIdentity(t *testing.T) {
	base := t.TempDir()
	if got := defaultDataDir(base); got != filepath.Join(base, "agentharbor") {
		t.Fatalf("new installation data directory: %s", got)
	}
	legacy := filepath.Join(base, "codex-remote")
	if err := os.Mkdir(legacy, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(base, "anywhereToAgent"), 0700); err != nil {
		t.Fatal(err)
	}
	if got := defaultDataDir(base); got != legacy {
		t.Fatalf("existing authorization state would be abandoned: %s", got)
	}
	if err := os.Remove(legacy); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacy, nil, 0600); err != nil {
		t.Fatal(err)
	}
	if got := defaultDataDir(base); got != legacy {
		t.Fatalf("invalid legacy state must remain visible to startup validation: %s", got)
	}
}

func TestDefaultDataDirKeepsAnywhereToAgent(t *testing.T) {
	base := t.TempDir()
	legacy := filepath.Join(base, "anywhereToAgent")
	if err := os.Mkdir(legacy, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(base, "agentharbor"), 0700); err != nil {
		t.Fatal(err)
	}
	if got := defaultDataDir(base); got != legacy {
		t.Fatalf("existing authorization state would be abandoned: %s", got)
	}
	if err := os.Remove(legacy); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacy, nil, 0600); err != nil {
		t.Fatal(err)
	}
	if got := defaultDataDir(base); got != legacy {
		t.Fatalf("invalid legacy state must remain visible to startup validation: %s", got)
	}
}
