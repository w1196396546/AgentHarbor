package relay

import (
	"errors"
	"slices"
	"strings"
	"time"
)

const maxDevices = 1000

const maxBrowserSessions = 4096

type DeviceInfo struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Online    bool      `json:"online"`
	Revoked   bool      `json:"revoked"`
	CreatedAt time.Time `json:"created_at"`
	LastSeen  time.Time `json:"last_seen"`
}

type storedDevice struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	SecretHash string    `json:"secret_hash"`
	Revoked    bool      `json:"revoked"`
	CreatedAt  time.Time `json:"created_at"`
	LastSeen   time.Time `json:"last_seen"`
}

func (s *Server) Devices() []DeviceInfo {
	s.mu.Lock()
	defer s.mu.Unlock()
	devices := make([]DeviceInfo, 0, len(s.state.Devices))
	for _, d := range s.state.Devices {
		devices = append(devices, DeviceInfo{ID: d.ID, Name: d.Name, Online: s.clients[d.ID] != nil, Revoked: d.Revoked, CreatedAt: d.CreatedAt, LastSeen: d.LastSeen})
	}
	slices.SortFunc(devices, func(a, b DeviceInfo) int { return strings.Compare(a.ID, b.ID) })
	return devices
}

func (s *Server) RevokeDevice(id string) error {
	s.mu.Lock()
	if _, exists := s.state.Devices[id]; !exists {
		s.mu.Unlock()
		return errors.New("device not found")
	}
	next := s.copyState()
	revoked := next.Devices[id]
	revoked.Revoked = true
	next.Devices[id] = revoked
	for key, session := range next.Sessions {
		if session.DeviceID == id {
			delete(next.Sessions, key)
		}
	}
	if err := s.saveState(next); err != nil {
		s.mu.Unlock()
		return err
	}
	active := s.clients[id]
	delete(s.clients, id)
	s.mu.Unlock()
	if active != nil {
		active.close()
	}
	return nil
}
