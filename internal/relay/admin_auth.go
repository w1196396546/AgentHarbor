package relay

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const adminCookieName = "codex-relay-admin"

type adminAttempt struct {
	count int
	start time.Time
}

func (a *Admin) validOrigin(r *http.Request) bool {
	a.mu.Lock()
	local := a.localHosts[strings.ToLower(r.Host)]
	a.mu.Unlock()
	origin := ""
	if local {
		origin = "http://" + strings.ToLower(r.Host)
	}
	if cfg := a.server.Config(); !local {
		if public, err := url.Parse(cfg.PublicURL); err == nil && public.Host != "" && strings.EqualFold(public.Host, r.Host) {
			origin = cfg.PublicURL
		}
	}
	if origin == "" {
		return false
	}
	origins, present := r.Header["Origin"]
	if present {
		return len(origins) == 1 && origins[0] == origin
	}
	return r.Method == http.MethodGet || r.Method == http.MethodHead
}

func (a *Admin) secureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	cfg := a.server.Config()
	u, err := url.Parse(cfg.PublicURL)
	return err == nil && u.Scheme == "https" && strings.EqualFold(u.Host, r.Host)
}

func (a *Admin) authenticated(r *http.Request) bool {
	cookie, err := r.Cookie(adminCookieName)
	if err != nil || len(cookie.Value) != 64 {
		return false
	}
	hash := sha256.Sum256([]byte(cookie.Value))
	a.mu.Lock()
	defer a.mu.Unlock()
	expires, ok := a.sessions[hash]
	if !ok {
		return false
	}
	if !time.Now().Before(expires) {
		delete(a.sessions, hash)
		return false
	}
	return true
}

func (a *Admin) login(w http.ResponseWriter, r *http.Request) {
	ip := a.server.clientIP(r)
	now := time.Now()
	a.mu.Lock()
	attempt := a.attempts[ip]
	if now.Sub(attempt.start) >= 10*time.Minute {
		attempt = adminAttempt{start: now}
	}
	if attempt.count >= 10 {
		a.mu.Unlock()
		w.Header().Set("Retry-After", "600")
		http.Error(w, "Too many sign-in attempts. Try again in 10 minutes.", http.StatusTooManyRequests)
		return
	}
	if _, exists := a.attempts[ip]; !exists && len(a.attempts) >= 128 {
		for key, v := range a.attempts {
			if now.Sub(v.start) >= 10*time.Minute {
				delete(a.attempts, key)
			}
		}
		if len(a.attempts) >= 128 {
			a.mu.Unlock()
			http.Error(w, "Sign-in temporarily unavailable", http.StatusTooManyRequests)
			return
		}
	}
	attempt.count++
	a.attempts[ip] = attempt
	a.mu.Unlock()
	var in struct {
		Token string `json:"token"`
	}
	if adminDecode(w, r, &in) != nil {
		http.Error(w, "Invalid admin credential", http.StatusUnauthorized)
		return
	}
	hash := sha256.Sum256([]byte(strings.TrimSpace(in.Token)))
	if subtle.ConstantTimeCompare(hash[:], a.tokenHash[:]) != 1 {
		http.Error(w, "Invalid admin credential", http.StatusUnauthorized)
		return
	}
	session, err := adminRandomKey()
	if err != nil {
		http.Error(w, "Credential generation failed", http.StatusInternalServerError)
		return
	}
	a.mu.Lock()
	for key, expires := range a.sessions {
		if !now.Before(expires) {
			delete(a.sessions, key)
		}
	}
	if len(a.sessions) >= 64 {
		a.mu.Unlock()
		http.Error(w, "Too many active admin sessions", http.StatusTooManyRequests)
		return
	}
	a.sessions[sha256.Sum256([]byte(session))] = now.Add(12 * time.Hour)
	delete(a.attempts, ip)
	a.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: adminCookieName, Value: session, Path: "/", Secure: a.secureRequest(r), HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 12 * 60 * 60})
	adminJSON(w, map[string]bool{"authenticated": true})
}

func adminRandomKey() (string, error) {
	var value [32]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(value[:]), nil
}
