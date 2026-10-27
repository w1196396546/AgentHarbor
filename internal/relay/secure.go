package relay

import (
	"agentharbor/internal/transport/tunnel"
	"context"
	"encoding/base64"
	"net/http"
	"time"
)

type sealedEnvelope struct {
	ID   string `json:"id"`
	Data string `json:"data"`
}

func (e sealedEnvelope) valid() bool {
	if !validHex(e.ID, 32) || len(e.Data) > 6*1024 {
		return false
	}
	data, err := base64.StdEncoding.Strict().DecodeString(e.Data)
	return err == nil && len(data) >= 16
}

func (s *Server) secure(w http.ResponseWriter, r *http.Request) {
	session, ok := s.session(r)
	if !ok {
		failure(w, http.StatusUnauthorized, "Pair this browser first")
		return
	}
	if !session.Encrypted || session.Grant != session.ID || !validHex(session.Grant, 32) {
		failure(w, http.StatusUpgradeRequired, "Pair again with an updated agentTools client to enable end-to-end encryption")
		return
	}
	cookie, _, _ := s.sessionCookie(r)
	key := digest(cookie.Value)
	s.mu.Lock()
	current, authorized := s.state.Sessions[key]
	client := s.clients[session.DeviceID]
	var peer *tunnel.Peer
	if client != nil {
		peer = client.getPeer()
	}
	if !authorized || current.ID != session.ID || !current.ExpiresAt.After(time.Now()) {
		s.mu.Unlock()
		failure(w, http.StatusUnauthorized, "Pair this browser first")
		return
	}
	if peer == nil {
		s.mu.Unlock()
		failure(w, http.StatusServiceUnavailable, "The agentTools client is offline; reconnect it to continue")
		return
	}
	ctx, cancel := context.WithDeadline(r.Context(), current.ExpiresAt)
	s.nextRequest++
	requestID := s.nextRequest
	if s.requests[key] == nil {
		s.requests[key] = map[uint64]context.CancelFunc{}
	}
	s.requests[key][requestID] = cancel
	s.mu.Unlock()
	defer func() {
		cancel()
		s.mu.Lock()
		delete(s.requests[key], requestID)
		if len(s.requests[key]) == 0 {
			delete(s.requests, key)
		}
		s.mu.Unlock()
	}()
	request := r.Clone(ctx)
	request.URL.Path, request.URL.RawPath, request.URL.RawQuery = "/_remote/secure", "", ""
	request.RequestURI = "/_remote/secure"
	request.Body = http.MaxBytesReader(w, r.Body, 48<<20)
	request.Header = make(http.Header)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/x-ndjson")
	request.Header.Set("X-Remote-Grant", session.Grant)
	request.Header.Set("X-Remote-Request", "1")
	request.Header.Set("X-Codex-Remote", "1")
	// The client verifies and decrypts every operation; the relay only routes ciphertext.
	peer.ServeHTTP(&relayResponse{ResponseWriter: w}, request)
}

// A connected device cannot set cookies or change the relay origin's policy.
type relayResponse struct {
	http.ResponseWriter
	wrote bool
}

func (w *relayResponse) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *relayResponse) WriteHeader(status int) {
	if w.wrote {
		return
	}
	w.wrote = true
	allowed := map[string]bool{"Content-Type": true, "Content-Disposition": true, "Content-Length": true, "Accept-Ranges": true, "Etag": true, "Last-Modified": true, "X-Accel-Buffering": true, "Retry-After": true}
	clean := make(http.Header)
	for key, values := range w.Header() {
		canonical := http.CanonicalHeaderKey(key)
		if allowed[canonical] {
			clean[canonical] = values
		}
		delete(w.Header(), key)
	}
	for key, values := range clean {
		w.Header()[key] = values
	}
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox; frame-ancestors 'none'")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	w.ResponseWriter.WriteHeader(status)
}

func (w *relayResponse) Write(data []byte) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(data)
}
