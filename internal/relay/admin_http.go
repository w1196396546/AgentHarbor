package relay

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

func (a *Admin) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/admin/", http.StatusTemporaryRedirect)
	})
	mux.HandleFunc("GET /admin/{$}", func(w http.ResponseWriter, r *http.Request) { a.asset(w, r, "admin.html", "text/html; charset=utf-8") })
	mux.HandleFunc("GET /admin/admin.js", func(w http.ResponseWriter, r *http.Request) {
		a.asset(w, r, "admin.js", "text/javascript; charset=utf-8")
	})
	mux.HandleFunc("GET /admin/admin.css", func(w http.ResponseWriter, r *http.Request) { a.asset(w, r, "admin.css", "text/css; charset=utf-8") })
	mux.HandleFunc("GET /icon.svg", func(w http.ResponseWriter, r *http.Request) { a.asset(w, r, "icon.svg", "image/svg+xml") })
	mux.HandleFunc("POST /api/admin/login", a.login)
	mux.HandleFunc("POST /api/admin/logout", func(w http.ResponseWriter, r *http.Request) {
		if cookie, err := r.Cookie(adminCookieName); err == nil {
			a.mu.Lock()
			delete(a.sessions, sha256.Sum256([]byte(cookie.Value)))
			a.mu.Unlock()
		}
		http.SetCookie(w, &http.Cookie{Name: adminCookieName, Path: "/", Secure: a.secureRequest(r), HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /api/admin/state", a.state)
	mux.HandleFunc("POST /api/admin/user", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			ID       int64 `json:"id"`
			Disabled bool  `json:"disabled"`
		}
		if adminDecode(w, r, &in) != nil || in.ID <= 0 {
			http.Error(w, "Invalid user", http.StatusBadRequest)
			return
		}
		if a.server.setUserDisabled(in.ID, in.Disabled) != nil {
			http.Error(w, "Unable to update user", http.StatusBadRequest)
			return
		}
		a.state(w, r)
	})
	mux.HandleFunc("POST /api/admin/revoke-device", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			ID string `json:"id"`
		}
		if err := adminDecode(w, r, &in); err != nil || in.ID == "" {
			http.Error(w, "Invalid device", http.StatusBadRequest)
			return
		}
		if err := a.server.RevokeDevice(in.ID); err != nil {
			http.Error(w, "Device could not be revoked", http.StatusBadRequest)
			return
		}
		a.state(w, r)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
		if !a.validOrigin(r) {
			http.Error(w, "Forbidden origin or host", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Header.Get("X-Remote-Admin") != "1" && r.Header.Get("X-Codex-Admin") != "1" {
			http.Error(w, "Forbidden request", http.StatusForbidden)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/admin/") && r.URL.Path != "/api/admin/login" && !a.authenticated(r) {
			http.Error(w, "Admin sign-in required", http.StatusUnauthorized)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func (a *Admin) asset(w http.ResponseWriter, r *http.Request, name, contentType string) {
	b, err := Asset(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType)
	_, _ = w.Write(b)
}

func (a *Admin) state(w http.ResponseWriter, r *http.Request) {
	devices := a.server.Devices()
	online := 0
	for _, device := range devices {
		if device.Online {
			online++
		}
	}
	adminJSON(w, map[string]any{"config": a.server.Config(), "devices": devices, "users": a.server.Users(), "status": map[string]any{"running": true, "online": online, "registered": len(devices)}, "credential_path": a.tokenPath})
}

func adminDecode(w http.ResponseWriter, r *http.Request, value any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	if decoder.Decode(new(any)) != io.EOF {
		return errors.New("Expected one JSON object")
	}
	return nil
}

func adminJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}
