package relay

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"
)

type browserSession struct {
	ID        string    `json:"id"`
	DeviceID  string    `json:"device_id"`
	Grant     string    `json:"grant"`
	Name      string    `json:"name"`
	ExpiresAt time.Time `json:"expires_at"`
	Encrypted bool      `json:"encrypted,omitempty"`
}

func randomToken(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func validGrant(value string) bool {
	return len(value) >= 32 && len(value) <= 256 && strings.IndexFunc(value, func(r rune) bool { return r < 33 || r > 126 }) < 0
}

func (s *Server) cookieName() string {
	if s.public.Scheme == "https" {
		return "__Host-codex-remote"
	}
	return "codex-remote"
}

func (s *Server) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: s.cookieName(), Path: "/", Secure: s.public.Scheme == "https", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
}

func (s *Server) session(r *http.Request) (browserSession, bool) {
	cookie, err := r.Cookie(s.cookieName())
	if err != nil || !validHex(cookie.Value, 64) {
		return browserSession{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.state.Sessions[digest(cookie.Value)]
	device, exists := s.state.Devices[session.DeviceID]
	return session, ok && exists && !device.Revoked && !s.state.Users[device.UserID].Disabled && session.ExpiresAt.After(time.Now()) && !s.closed
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(s.cookieName())
	if err == nil && validHex(cookie.Value, 64) {
		s.mu.Lock()
		next := s.copyState()
		delete(next.Sessions, digest(cookie.Value))
		err = s.saveState(next)
		if err == nil {
			s.cancelRequests(digest(cookie.Value))
		}
		s.mu.Unlock()
		if err != nil {
			failure(w, http.StatusInternalServerError, "Unable to revoke browser authorization")
			return
		}
	}
	s.clearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) device(w http.ResponseWriter, r *http.Request) {
	session, ok := s.session(r)
	if !ok {
		failure(w, http.StatusUnauthorized, "Pair this browser first")
		return
	}
	s.mu.Lock()
	device := s.state.Devices[session.DeviceID]
	online := s.clients[session.DeviceID] != nil
	s.mu.Unlock()
	jsonReply(w, http.StatusOK, map[string]any{"id": device.ID, "name": deviceName(device), "online": online})
}

// Call with mu held. Cancellation does not wait for the streaming handler.
func (s *Server) cancelRequests(key string) {
	for _, cancel := range s.requests[key] {
		cancel()
	}
	delete(s.requests, key)
}
