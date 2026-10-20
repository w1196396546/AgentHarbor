package relay

import (
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

func jsonReply(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func decode(w http.ResponseWriter, r *http.Request, value any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 8*1024)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return errors.New("expected one JSON object")
	}
	return nil
}

func failure(w http.ResponseWriter, status int, message string) {
	jsonReply(w, status, map[string]string{"error": message})
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { jsonReply(w, http.StatusOK, map[string]bool{"ok": true}) })
	mux.HandleFunc("GET /api/client/connect", s.connect)
	mux.HandleFunc("POST /api/pair", s.pair)
	mux.HandleFunc("POST /api/logout", s.logout)
	mux.HandleFunc("POST /api/secure", s.secure)
	mux.HandleFunc("GET /api/device", s.device)
	for _, route := range []string{
		"GET /api/sessions", "GET /api/sessions/{id}", "GET /api/sessions/{id}/history", "GET /api/sessions/{id}/events",
		"POST /api/threads", "POST /api/threads/{id}/turn", "POST /api/threads/{id}/interrupt", "POST /api/threads/{id}/answer", "POST /api/threads/{id}/steer", "POST /api/threads/{id}/connect", "POST /api/threads/{id}/settings",
		"GET /api/threads/{id}/plan", "POST /api/threads/{id}/execute-plan", "GET /api/threads/{id}/changes",
		"GET /api/threads/{id}/queue", "POST /api/threads/{id}/queue", "POST /api/threads/{id}/queue/resume",
		"POST /api/threads/{id}/queue/{messageID}/steer", "PATCH /api/threads/{id}/queue/{messageID}", "DELETE /api/threads/{id}/queue/{messageID}",
		"GET /api/agents", "GET /api/options", "GET /api/files", "GET /api/project-file",
		"POST /api/attachments", "GET /api/attachments/{id}", "DELETE /api/attachments/{id}",
	} {
		mux.HandleFunc(route, func(w http.ResponseWriter, r *http.Request) {
			failure(w, http.StatusUpgradeRequired, "End-to-end encryption is required; update agentTools and pair this browser again")
		})
	}
	mux.Handle("GET /", publicAssets())
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		if !strings.EqualFold(r.Host, s.public.Host) {
			failure(w, http.StatusForbidden, "Forbidden host")
			return
		}
		origins, hasOrigin := r.Header["Origin"]
		if hasOrigin && (len(origins) != 1 || origins[0] != s.cfg.PublicURL) {
			failure(w, http.StatusForbidden, "Forbidden origin")
			return
		}
		if r.URL.Path == "/api/client/connect" && hasOrigin {
			failure(w, http.StatusForbidden, "Client connections require a native client")
			return
		}
		if r.URL.Path == "/admin" || strings.HasPrefix(r.URL.Path, "/admin/") || strings.HasPrefix(r.URL.Path, "/api/admin/") {
			s.mu.Lock()
			admin := s.admin
			s.mu.Unlock()
			if admin == nil {
				http.NotFound(w, r)
				return
			}
			admin.ServeHTTP(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Header.Get("X-Remote-Request") != "1" && r.Header.Get("X-Codex-Remote") != "1" {
			failure(w, http.StatusForbidden, "Forbidden request")
			return
		}
		mux.ServeHTTP(w, r)
	})
}

// The map is bounded so arbitrary unauthenticated addresses cannot exhaust memory.
func (s *Server) allowAttempt(kind, remote string, limit int) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		host = remote
	}
	key := kind + ":" + host
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.attempts) >= 2048 {
		for k, value := range s.attempts {
			if now.Sub(value.start) >= time.Minute {
				delete(s.attempts, k)
			}
		}
	}
	window, present := s.attempts[key]
	if !present && len(s.attempts) >= 2048 {
		return false
	}
	if now.Sub(window.start) >= time.Minute {
		window = attemptWindow{start: now}
	}
	window.count++
	s.attempts[key] = window
	return window.count <= limit
}
