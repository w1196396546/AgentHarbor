package relay

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

type persistedState struct {
	Version  int                       `json:"version"`
	Devices  map[string]storedDevice   `json:"devices"`
	Sessions map[string]browserSession `json:"sessions"`
}

func validHex(value string, size int) bool {
	if len(value) != size || value != strings.ToLower(value) {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func digest(secret string) string {
	value := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(value[:])
}

func (s *Server) loadState() error {
	if err := os.MkdirAll(s.cfg.DataDir, 0700); err != nil {
		return err
	}
	if err := os.Chmod(s.cfg.DataDir, 0700); err != nil {
		return err
	}
	s.state = persistedState{Version: 1, Devices: map[string]storedDevice{}, Sessions: map[string]browserSession{}}
	name := filepath.Join(s.cfg.DataDir, "relay-state.json")
	info, err := os.Lstat(name)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("relay state must be a regular private file")
	}
	file, err := os.Open(name)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err = file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > 4*1024*1024 {
		return errors.New("relay state is not a bounded regular file")
	}
	decoder := json.NewDecoder(io.LimitReader(file, 4*1024*1024+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&s.state); err != nil {
		return fmt.Errorf("read private relay state: %w", err)
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF || s.state.Version != 1 || s.state.Devices == nil || s.state.Sessions == nil || len(s.state.Devices) > maxDevices || len(s.state.Sessions) > maxBrowserSessions {
		return errors.New("invalid private relay state")
	}
	for id, device := range s.state.Devices {
		if !validHex(id, 32) || device.ID != id || !validHex(device.SecretHash, 64) || !validName(device.Name) {
			return errors.New("invalid device in private relay state")
		}
	}
	removed := false
	for key, session := range s.state.Sessions {
		if !validHex(key, 64) || !validHex(session.ID, 32) || !validHex(session.DeviceID, 32) || !validGrant(session.Grant) || session.ExpiresAt.IsZero() {
			return errors.New("invalid browser in private relay state")
		}
		if session.Encrypted && (session.Grant != session.ID || !validHex(session.Grant, 32)) {
			return errors.New("invalid encrypted browser in private relay state")
		}
		if _, exists := s.state.Devices[session.DeviceID]; !session.Encrypted || !exists || !session.ExpiresAt.After(time.Now()) {
			delete(s.state.Sessions, key)
			removed = true
		}
	}
	if removed {
		if err := file.Close(); err != nil {
			return err
		}
		return s.saveState(s.copyState())
	}
	return os.Chmod(name, 0600)
}

func validName(value string) bool {
	return value != "" && len(value) <= 512 && utf8.RuneCountInString(value) <= 128 && utf8.ValidString(value) && strings.IndexFunc(value, func(r rune) bool { return r < 32 || r == 127 }) < 0
}

// Call with mu held; memory changes are committed only after the atomic write succeeds.
func (s *Server) saveState(next persistedState) error {
	data, err := json.Marshal(next)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(s.cfg.DataDir, ".relay-state-*")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err := os.Rename(name, filepath.Join(s.cfg.DataDir, "relay-state.json")); err != nil {
		return err
	}
	s.state = next
	return nil
}

func (s *Server) copyState() persistedState {
	next := persistedState{Version: 1, Devices: make(map[string]storedDevice, len(s.state.Devices)), Sessions: make(map[string]browserSession, len(s.state.Sessions))}
	for key, value := range s.state.Devices {
		next.Devices[key] = value
	}
	for key, value := range s.state.Sessions {
		if value.ExpiresAt.After(time.Now()) {
			next.Sessions[key] = value
		}
	}
	return next
}
