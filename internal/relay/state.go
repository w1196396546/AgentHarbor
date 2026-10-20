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
	Version         int                       `json:"version"`
	Users           map[int64]UserInfo        `json:"users,omitempty"`
	AccountSessions map[string]accountSession `json:"account_sessions,omitempty"`
	Devices         map[string]storedDevice   `json:"devices"`
	Sessions        map[string]browserSession `json:"sessions"`
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
	s.state = persistedState{Version: 1, Devices: map[string]storedDevice{}, Users: map[int64]UserInfo{}, Sessions: map[string]browserSession{}, AccountSessions: map[string]accountSession{}}
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
	if s.state.Users == nil {
		s.state.Users = map[int64]UserInfo{}
	}
	if s.state.AccountSessions == nil {
		s.state.AccountSessions = map[string]accountSession{}
	}
	if len(s.state.AccountSessions) > maxBrowserSessions {
		return errors.New("invalid account session directory")
	}
	for key, session := range s.state.AccountSessions {
		if !validHex(key, 64) || session.UserID <= 0 || session.ExpiresAt.IsZero() || s.state.Users[session.UserID].ID == 0 {
			return errors.New("invalid account session")
		}
	}
	if len(s.state.Users) > maxDevices {
		return errors.New("invalid user directory")
	}
	for id, user := range s.state.Users {
		if id != user.ID || !validUser(user) {
			return errors.New("invalid user in private relay state")
		}
	}
	for id, device := range s.state.Devices {
		if !validHex(id, 32) || device.ID != id || !validHex(device.SecretHash, 64) || !validName(device.Name) || device.Alias != "" && !validName(device.Alias) || device.UserID < 0 {
			return errors.New("invalid device in private relay state")
		}
		if device.UserID != 0 {
			if _, exists := s.state.Users[device.UserID]; !exists {
				return errors.New("device owner missing from private relay state")
			}
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
	if len(data) > 4*1024*1024 {
		return errors.New("private relay state capacity reached")
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
	next := persistedState{Version: 1, Devices: make(map[string]storedDevice, len(s.state.Devices)), Users: make(map[int64]UserInfo, len(s.state.Users)), Sessions: make(map[string]browserSession, len(s.state.Sessions)), AccountSessions: make(map[string]accountSession, len(s.state.AccountSessions))}
	for key, value := range s.state.AccountSessions {
		if value.ExpiresAt.After(time.Now()) {
			next.AccountSessions[key] = value
		}
	}
	for key, value := range s.state.Users {
		next.Users[key] = value
	}
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
