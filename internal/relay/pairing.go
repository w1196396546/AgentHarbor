package relay

import (
	"anywheretoagent/internal/transport/tunnel"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

func (s *Server) pair(w http.ResponseWriter, r *http.Request) {
	if !s.allowAttempt("pair", r.RemoteAddr, 12) {
		failure(w, http.StatusTooManyRequests, "Too many pairing attempts; try again later")
		return
	}
	var in struct {
		DeviceID string `json:"device_id"`
		sealedEnvelope
	}
	if decode(w, r, &in) != nil || !validHex(in.DeviceID, 32) || !in.sealedEnvelope.valid() {
		failure(w, http.StatusBadRequest, "Use an encrypted authorization code from an updated agentTools client")
		return
	}
	id := in.DeviceID
	s.mu.Lock()
	remembered := s.browserCookies(r)
	if remembered[id] == nil && len(remembered) >= maxRememberedDevices {
		s.mu.Unlock()
		failure(w, http.StatusConflict, "This browser remembers 16 devices; disconnect one before pairing another")
		return
	}
	c := s.clients[id]
	s.mu.Unlock()
	var peer *tunnel.Peer
	if c != nil {
		peer = c.getPeer()
	}
	if peer == nil {
		failure(w, http.StatusServiceUnavailable, "The agentTools client is offline")
		return
	}
	name := strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, r.UserAgent()))
	if len(name) > 128 {
		name = name[:128]
		for !utf8.ValidString(name) {
			name = name[:len(name)-1]
		}
	}
	if name == "" {
		name = "Remote browser"
	}
	body, _ := json.Marshal(in.sealedEnvelope)
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	request, _ := http.NewRequestWithContext(ctx, http.MethodPost, "http://client/_remote/pair", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := &pairResponse{header: make(http.Header)}
	aborted := false
	func() {
		defer func() {
			if value := recover(); value != nil {
				if value != http.ErrAbortHandler {
					panic(value)
				}
				aborted = true
			}
		}()
		peer.ServeHTTP(response, request)
	}()
	if aborted {
		failure(w, http.StatusServiceUnavailable, "The client disconnected while authorizing")
		return
	}
	if response.status != http.StatusOK {
		if response.status == http.StatusUnauthorized || response.status == http.StatusForbidden {
			failure(w, http.StatusUnauthorized, "The authorization code expired or was already used")
		} else {
			failure(w, http.StatusServiceUnavailable, "The client could not authorize this browser")
		}
		return
	}
	var result struct {
		Grant     string         `json:"grant"`
		ID        string         `json:"id"`
		Name      string         `json:"name"`
		ExpiresAt time.Time      `json:"expires_at"`
		Sealed    sealedEnvelope `json:"sealed"`
	}
	if response.overflow || json.Unmarshal(response.body.Bytes(), &result) != nil || !validHex(result.Grant, 32) || result.Grant != result.ID || !result.Sealed.valid() || result.Sealed.ID != in.ID || !result.ExpiresAt.After(time.Now()) {
		failure(w, http.StatusBadGateway, "Invalid authorization response from client")
		return
	}
	cookie, err := randomToken(32)
	if err != nil {
		failure(w, http.StatusInternalServerError, "Unable to create browser authorization")
		return
	}
	expires := time.Now().UTC().Add(30 * 24 * time.Hour)
	if result.ExpiresAt.Before(expires) {
		expires = result.ExpiresAt
	}
	s.mu.Lock()
	device, exists := s.state.Devices[id]
	next := s.copyState()
	if !exists || device.Revoked || s.clients[id] != c || s.closed {
		s.mu.Unlock()
		failure(w, http.StatusServiceUnavailable, "The client disconnected while authorizing")
		return
	}
	// Re-pairing replaces only this device's authorization after the new grant succeeds.
	oldKeys := make(map[string]bool)
	for _, old := range r.Cookies() {
		key := digest(old.Value)
		if session, ok := next.Sessions[key]; ok && session.DeviceID == id && (old.Name == s.cookieName() || old.Name == s.deviceCookieName(id)) {
			delete(next.Sessions, key)
			oldKeys[key] = true
		}
	}
	if len(next.Sessions) >= maxBrowserSessions {
		s.mu.Unlock()
		failure(w, http.StatusServiceUnavailable, "Browser authorization capacity reached")
		return
	}
	next.Sessions[digest(cookie)] = browserSession{ID: result.ID, DeviceID: id, Grant: result.ID, Name: name, ExpiresAt: expires, Encrypted: true}
	var legacyCookie *http.Cookie
	var legacySession browserSession
	if old, err := r.Cookie(s.cookieName()); err == nil {
		previous, ok := next.Sessions[digest(old.Value)]
		rememberedCookie := remembered[previous.DeviceID]
		if ok && previous.DeviceID != id && rememberedCookie != nil && rememberedCookie.Name == s.cookieName() && rememberedCookie.Value == old.Value {
			legacyCookie, legacySession = old, previous
		}
	}
	err = s.saveState(next)
	if err == nil {
		for key := range oldKeys {
			s.cancelRequests(key)
		}
	}
	s.mu.Unlock()
	if err != nil {
		failure(w, http.StatusInternalServerError, "Unable to remember browser authorization")
		return
	}
	if legacyCookie != nil {
		s.setSessionCookie(w, s.deviceCookieName(legacySession.DeviceID), legacyCookie.Value, legacySession.ExpiresAt)
	}
	s.setSessionCookie(w, s.cookieName(), cookie, expires)
	s.setSessionCookie(w, s.deviceCookieName(id), cookie, expires)
	// Keep the client expiry identical to its authenticated reply; cap only relay state and cookies.
	jsonReply(w, http.StatusOK, map[string]any{"paired": true, "device_id": id, "id": result.ID, "sealed": result.Sealed, "expires_at": result.ExpiresAt})
}

// Pair replies are small control messages, never streamed into unbounded memory.
type pairResponse struct {
	header   http.Header
	status   int
	body     bytes.Buffer
	overflow bool
}

func (p *pairResponse) Header() http.Header { return p.header }

func (p *pairResponse) WriteHeader(status int) {
	if p.status == 0 {
		p.status = status
	}
}

func (p *pairResponse) Write(data []byte) (int, error) {
	if p.status == 0 {
		p.status = http.StatusOK
	}
	if p.body.Len()+len(data) > 8*1024 {
		p.overflow = true
		return 0, errors.New("pairing response exceeds limit")
	}
	return p.body.Write(data)
}
