package relay

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"
)

const maxRememberedDevices = 16

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

func (s *Server) deviceCookieName(id string) string { return s.cookieName() + "-" + id }

func (s *Server) setSessionCookie(w http.ResponseWriter, name, value string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", Secure: s.public.Scheme == "https", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: int(time.Until(expires).Seconds()), Expires: expires})
}

func (s *Server) clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{Name: name, Path: "/", Secure: s.public.Scheme == "https", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
}

func (s *Server) sessionCookie(r *http.Request) (*http.Cookie, string, error) {
	values := r.Header.Values("X-Remote-Device")
	if len(values) == 0 {
		cookie, err := r.Cookie(s.cookieName())
		return cookie, "", err
	}
	if len(values) != 1 || !validHex(values[0], 32) {
		return nil, "", errors.New("invalid selected device")
	}
	cookie, err := r.Cookie(s.deviceCookieName(values[0]))
	if errors.Is(err, http.ErrNoCookie) {
		// Legacy browsers still use the generic cookie until their next pairing.
		cookie, err = r.Cookie(s.cookieName())
	}
	return cookie, values[0], err
}

// Call with mu held; only existing grants count toward the browser's device limit.
func (s *Server) browserCookies(r *http.Request) map[string]*http.Cookie {
	devices := make(map[string]*http.Cookie)
	for _, cookie := range r.Cookies() {
		if !validHex(cookie.Value, 64) {
			continue
		}
		session, ok := s.state.Sessions[digest(cookie.Value)]
		if !ok || !session.ExpiresAt.After(time.Now()) || s.state.Devices[session.DeviceID].Revoked {
			continue
		}
		if cookie.Name == s.deviceCookieName(session.DeviceID) || cookie.Name == s.cookieName() && devices[session.DeviceID] == nil {
			devices[session.DeviceID] = cookie
		}
	}
	return devices
}

func (s *Server) session(r *http.Request) (browserSession, bool) {
	cookie, selected, err := s.sessionCookie(r)
	if err != nil || !validHex(cookie.Value, 64) {
		return browserSession{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.state.Sessions[digest(cookie.Value)]
	device, exists := s.state.Devices[session.DeviceID]
	return session, ok && (selected == "" || selected == session.DeviceID) && exists && !device.Revoked && !s.state.Users[device.UserID].Disabled && session.ExpiresAt.After(time.Now()) && !s.closed
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	cookie, selected, err := s.sessionCookie(r)
	if err != nil && !errors.Is(err, http.ErrNoCookie) {
		failure(w, http.StatusBadRequest, "Invalid selected device")
		return
	}
	if err == nil && validHex(cookie.Value, 64) {
		s.mu.Lock()
		next := s.copyState()
		key := digest(cookie.Value)
		session, exists := next.Sessions[key]
		if exists && selected != "" && session.DeviceID != selected {
			s.mu.Unlock()
			failure(w, http.StatusUnauthorized, "Pair this browser first")
			return
		}
		delete(next.Sessions, key)
		err = s.saveState(next)
		if err == nil {
			s.cancelRequests(key)
		}
		s.mu.Unlock()
		if err != nil {
			failure(w, http.StatusInternalServerError, "Unable to revoke browser authorization")
			return
		}
		if exists {
			selected = session.DeviceID
		}
	}
	if selected != "" {
		s.clearCookie(w, s.deviceCookieName(selected))
	}
	if generic, genericErr := r.Cookie(s.cookieName()); genericErr == nil && (cookie == nil || generic.Value == cookie.Value) {
		s.clearCookie(w, s.cookieName())
	}
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
