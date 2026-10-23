package relay

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"
)

const fullCupAccountURL = "https://tobapi.fullcupai.com/api/v1/auth/me"

type UserInfo struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	Username  string    `json:"username"`
	Status    string    `json:"status"`
	Disabled  bool      `json:"disabled,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	LastSeen  time.Time `json:"last_seen"`
}

type accountSession struct {
	UserID    int64     `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
}

func (s *Server) accountCookieName() string {
	if s.public.Scheme == "https" {
		return "__Host-anywhere-account"
	}
	return "anywhere-account"
}

func (s *Server) accountLogin(w http.ResponseWriter, r *http.Request) {
	if !s.allowAttempt("account-login", s.clientIP(r), 10) {
		failure(w, http.StatusTooManyRequests, "Too many sign-in attempts")
		return
	}
	var in struct {
		Token     string `json:"access_token,omitempty"`
		Email     string `json:"email,omitempty"`
		Password  string `json:"password,omitempty"`
		TempToken string `json:"temp_token,omitempty"`
		Code      string `json:"code,omitempty"`
	}
	if decode(w, r, &in) != nil {
		failure(w, http.StatusBadRequest, "Invalid FullCupAI sign-in")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	if in.Token == "" {
		path := "/api/v1/auth/login"
		body := map[string]string{"email": strings.TrimSpace(in.Email), "password": in.Password}
		if in.TempToken != "" {
			path += "/2fa"
			body = map[string]string{"temp_token": in.TempToken, "totp_code": in.Code}
		}
		if in.TempToken == "" && (in.Email == "" || in.Password == "" || len(in.Email) > 320 || len(in.Password) > 4096) || len(in.TempToken) > 4096 || len(in.Code) > 16 {
			failure(w, http.StatusBadRequest, "Enter your FullCupAI email and password")
			return
		}
		data, _ := json.Marshal(body)
		request, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://tobapi.fullcupai.com"+path, bytes.NewReader(data))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Accept", "application/json")
		response, err := s.accountHTTP.Do(request)
		if err != nil {
			failure(w, http.StatusServiceUnavailable, "FullCupAI sign-in is unavailable")
			return
		}
		data, err = io.ReadAll(io.LimitReader(response.Body, 64*1024+1))
		response.Body.Close()
		var result struct {
			Code int `json:"code"`
			Data struct {
				AccessToken string `json:"access_token"`
				Requires2FA bool   `json:"requires_2fa"`
				TempToken   string `json:"temp_token"`
				Email       string `json:"user_email_masked"`
			} `json:"data"`
		}
		if err != nil || len(data) > 64*1024 || response.StatusCode != http.StatusOK || json.Unmarshal(data, &result) != nil || result.Code != 0 {
			failure(w, http.StatusUnauthorized, "FullCupAI sign-in failed. Check your credentials or sign in on the FullCupAI website if verification is required.")
			return
		}
		if result.Data.Requires2FA && result.Data.TempToken != "" && len(result.Data.TempToken) <= 4096 {
			jsonReply(w, http.StatusOK, map[string]any{"requires_2fa": true, "temp_token": result.Data.TempToken, "user_email_masked": result.Data.Email})
			return
		}
		in.Token = result.Data.AccessToken
	}
	user, err := s.verifyFullCupAccount(ctx, in.Token)
	if err != nil {
		failure(w, http.StatusUnauthorized, "FullCupAI sign-in could not be verified")
		return
	}
	cookie, err := randomToken(32)
	if err != nil {
		failure(w, http.StatusInternalServerError, "Unable to create account session")
		return
	}
	now := time.Now().UTC()
	s.mu.Lock()
	previous := s.state.Users[user.ID]
	if previous.Disabled || len(s.state.Users) >= maxDevices && previous.ID == 0 {
		s.mu.Unlock()
		failure(w, http.StatusForbidden, "Account is unavailable")
		return
	}
	next := s.copyState()
	if len(next.AccountSessions) >= maxBrowserSessions {
		s.mu.Unlock()
		failure(w, http.StatusServiceUnavailable, "Account session capacity reached")
		return
	}
	user.CreatedAt = previous.CreatedAt
	if user.CreatedAt.IsZero() {
		user.CreatedAt = now
	}
	user.LastSeen = now
	next.Users[user.ID] = user
	if old, err := r.Cookie(s.accountCookieName()); err == nil {
		delete(next.AccountSessions, digest(old.Value))
	}
	next.AccountSessions[digest(cookie)] = accountSession{UserID: user.ID, ExpiresAt: now.Add(12 * time.Hour)}
	err = s.saveState(next)
	s.mu.Unlock()
	if err != nil {
		failure(w, http.StatusInternalServerError, "Unable to save account session")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: s.accountCookieName(), Value: cookie, Path: "/", Secure: s.public.Scheme == "https", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 12 * 60 * 60})
	jsonReply(w, http.StatusOK, map[string]any{"authenticated": true, "user": user})
}

func (s *Server) accountLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(s.accountCookieName()); err == nil && validHex(cookie.Value, 64) {
		s.mu.Lock()
		next := s.copyState()
		delete(next.AccountSessions, digest(cookie.Value))
		err = s.saveState(next)
		s.mu.Unlock()
		if err != nil {
			failure(w, http.StatusInternalServerError, "Unable to sign out")
			return
		}
	}
	http.SetCookie(w, &http.Cookie{Name: s.accountCookieName(), Path: "/", Secure: s.public.Scheme == "https", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}

func validUser(user UserInfo) bool {
	return user.ID > 0 && user.Status == "active" && validName(user.Email) && len(user.Email) <= 320 && (user.Username == "" || validName(user.Username))
}

// The credential is sent only to the fixed platform origin and is never persisted.
func (s *Server) verifyFullCupAccount(ctx context.Context, token string) (UserInfo, error) {
	if token == "" || len(token) > 16000 || strings.ContainsAny(token, "\r\n\x00") {
		return UserInfo{}, errors.New("invalid FullCupAI credential")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, fullCupAccountURL, nil)
	if err != nil {
		return UserInfo{}, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/json")
	response, err := s.accountHTTP.Do(request)
	if err != nil {
		return UserInfo{}, errors.New("FullCupAI account verification unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return UserInfo{}, errors.New("FullCupAI account verification failed")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 64*1024+1))
	if err != nil || len(data) > 64*1024 {
		return UserInfo{}, errors.New("invalid FullCupAI account response")
	}
	var envelope struct {
		Code int      `json:"code"`
		Data UserInfo `json:"data"`
	}
	if json.Unmarshal(data, &envelope) != nil || envelope.Code != 0 || !validUser(envelope.Data) {
		return UserInfo{}, errors.New("invalid FullCupAI account response")
	}
	// Only profile fields issued by the platform are accepted.
	return UserInfo{ID: envelope.Data.ID, Email: envelope.Data.Email, Username: envelope.Data.Username, Status: envelope.Data.Status}, nil
}

func (s *Server) Users() []UserInfo {
	s.mu.Lock()
	defer s.mu.Unlock()
	users := make([]UserInfo, 0, len(s.state.Users))
	for _, user := range s.state.Users {
		users = append(users, user)
	}
	slices.SortFunc(users, func(a, b UserInfo) int {
		if a.ID < b.ID {
			return -1
		}
		if a.ID > b.ID {
			return 1
		}
		return 0
	})
	return users
}

func (s *Server) accountUser(r *http.Request) (UserInfo, bool) {
	cookie, err := r.Cookie(s.accountCookieName())
	if err != nil || !validHex(cookie.Value, 64) {
		return UserInfo{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.state.AccountSessions[digest(cookie.Value)]
	user, found := s.state.Users[session.UserID]
	return user, ok && found && !user.Disabled && session.ExpiresAt.After(time.Now())
}

func (s *Server) account(w http.ResponseWriter, r *http.Request) {
	user, ok := s.accountUser(r)
	if !ok {
		failure(w, http.StatusUnauthorized, "Sign in with your FullCupAI account")
		return
	}
	devices := s.Devices()
	devices = slices.DeleteFunc(devices, func(device DeviceInfo) bool { return device.UserID != user.ID })
	var current *DeviceInfo
	if paired, ok := s.session(r); ok {
		s.mu.Lock()
		device, exists := s.state.Devices[paired.DeviceID]
		if exists {
			current = &DeviceInfo{ID: device.ID, UserID: device.UserID, Name: deviceName(device), Online: s.clients[device.ID] != nil, Revoked: device.Revoked, CreatedAt: device.CreatedAt, LastSeen: device.LastSeen}
		}
		s.mu.Unlock()
	}
	jsonReply(w, http.StatusOK, map[string]any{"user": user, "devices": devices, "current_device": current})
}

func (s *Server) claimAccountDevice(w http.ResponseWriter, r *http.Request) {
	user, ok := s.accountUser(r)
	if !ok {
		failure(w, http.StatusUnauthorized, "Sign in with your FullCupAI account")
		return
	}
	paired, ok := s.session(r)
	if !ok {
		failure(w, http.StatusUnauthorized, "Pair this browser with the device first")
		return
	}
	var in struct{}
	if decode(w, r, &in) != nil {
		failure(w, http.StatusBadRequest, "Invalid device claim")
		return
	}
	cookie, _, cookieErr := s.sessionCookie(r)
	if cookieErr != nil || !validHex(cookie.Value, 64) {
		failure(w, http.StatusUnauthorized, "Device authorization is unavailable")
		return
	}
	s.mu.Lock()
	device, exists := s.state.Devices[paired.DeviceID]
	current, authorized := s.state.Sessions[digest(cookie.Value)]
	if !exists || device.Revoked || !authorized || current.ID != paired.ID || !current.ExpiresAt.After(time.Now()) || s.state.Users[user.ID].Disabled {
		s.mu.Unlock()
		failure(w, http.StatusUnauthorized, "Device authorization is unavailable")
		return
	}
	if device.UserID != 0 && device.UserID != user.ID {
		s.mu.Unlock()
		failure(w, http.StatusConflict, "This device belongs to another account")
		return
	}
	if device.UserID == user.ID {
		s.mu.Unlock()
		s.account(w, r)
		return
	}
	next := s.copyState()
	device.UserID = user.ID
	next.Devices[device.ID] = device
	err := s.saveState(next)
	s.mu.Unlock()
	if err != nil {
		failure(w, http.StatusInternalServerError, "Unable to bind this device")
		return
	}
	s.account(w, r)
}

func (s *Server) manageAccountDevice(w http.ResponseWriter, r *http.Request) {
	user, ok := s.accountUser(r)
	if !ok {
		failure(w, http.StatusUnauthorized, "FullCupAI device authorization required")
		return
	}
	var in struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Revoke bool   `json:"revoke"`
	}
	if decode(w, r, &in) != nil || !validHex(in.ID, 32) || !in.Revoke && !validName(strings.TrimSpace(in.Name)) {
		failure(w, http.StatusBadRequest, "Invalid device details")
		return
	}
	s.mu.Lock()
	device, exists := s.state.Devices[in.ID]
	if !exists || device.UserID != user.ID || s.state.Users[user.ID].Disabled {
		s.mu.Unlock()
		failure(w, http.StatusNotFound, "Device not found")
		return
	}
	next := s.copyState()
	revokedKeys := []string{}
	if in.Revoke {
		device.Revoked = true
		for key, session := range next.Sessions {
			if session.DeviceID == device.ID {
				revokedKeys = append(revokedKeys, key)
				delete(next.Sessions, key)
			}
		}
	} else {
		device.Alias = strings.TrimSpace(in.Name)
	}
	next.Devices[device.ID] = device
	err := s.saveState(next)
	active := s.clients[device.ID]
	if err == nil && in.Revoke {
		for _, key := range revokedKeys {
			s.cancelRequests(key)
		}
		delete(s.clients, device.ID)
	}
	s.mu.Unlock()
	if err != nil {
		failure(w, http.StatusInternalServerError, "Unable to save device")
		return
	}
	if in.Revoke && active != nil {
		active.close()
	}
	jsonReply(w, http.StatusOK, map[string]bool{"saved": true})
}

func (s *Server) setUserDisabled(id int64, disabled bool) error {
	s.mu.Lock()
	user, exists := s.state.Users[id]
	if !exists {
		s.mu.Unlock()
		return errors.New("user not found")
	}
	next := s.copyState()
	user.Disabled = disabled
	next.Users[id] = user
	active := []*connection{}
	if disabled {
		for key, session := range next.AccountSessions {
			if session.UserID == id {
				delete(next.AccountSessions, key)
			}
		}
		for key, session := range next.Sessions {
			if next.Devices[session.DeviceID].UserID == id {
				delete(next.Sessions, key)
			}
		}
		for deviceID, device := range next.Devices {
			if device.UserID == id && s.clients[deviceID] != nil {
				active = append(active, s.clients[deviceID])
			}
		}
	}
	err := s.saveState(next)
	if err == nil && disabled {
		for key := range s.requests {
			if _, valid := next.Sessions[key]; !valid {
				s.cancelRequests(key)
			}
		}
		for deviceID, device := range next.Devices {
			if device.UserID == id {
				delete(s.clients, deviceID)
			}
		}
	}
	s.mu.Unlock()
	if err == nil {
		for _, client := range active {
			client.close()
		}
	}
	return err
}
