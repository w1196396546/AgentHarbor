package relay

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

type accountTransport func(*http.Request) (*http.Response, error)

func (f accountTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func fixtureJSON(value any) *http.Response {
	data, _ := json.Marshal(value)
	return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(data))}
}
func accountCall(t *testing.T, client *http.Client, origin, path string, body any) *http.Response {
	t.Helper()
	method := http.MethodGet
	var payload []byte
	if body != nil {
		method = http.MethodPost
		payload, _ = json.Marshal(body)
	}
	request, _ := http.NewRequest(method, origin+path, bytes.NewReader(payload))
	request.Header.Set("Origin", origin)
	request.Header.Set("X-Remote-Request", "1")
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func TestFullCupIdentityAndAccountIsolation(t *testing.T) {
	s, ts := testRelay(t, "")
	s.accountHTTP = &http.Client{Transport: accountTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != fullCupAccountURL || r.Header.Get("Authorization") != "Bearer fixture-user-seven" {
			t.Error("unexpected platform identity verification")
		}
		body := map[string]any{"code": 0, "data": map[string]any{"id": 7, "email": "owner@example.test", "username": "Owner", "status": "active"}}
		return fixtureJSON(body), nil
	})}
	client := browser(t)
	result := accountCall(t, client, ts.URL, "/api/account/login", map[string]any{"access_token": "fixture-user-seven"})
	if result.StatusCode != 200 {
		t.Fatalf("login status: %d", result.StatusCode)
	}
	result.Body.Close()
	s.mu.Lock()
	next := s.copyState()
	next.Users[8] = UserInfo{ID: 8, Email: "other@example.test", Status: "active"}
	id := strings.Repeat("a", 32)
	next.Devices[id] = storedDevice{ID: id, UserID: 8, Name: "Other", SecretHash: digest("fixture-secret"), CreatedAt: time.Now()}
	mine := strings.Repeat("b", 32)
	next.Devices[mine] = storedDevice{ID: mine, UserID: 7, Name: "Mine", SecretHash: digest("fixture-secret"), CreatedAt: time.Now()}
	err := s.saveState(next)
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	result = accountCall(t, client, ts.URL, "/api/account", nil)
	var directory struct {
		User    UserInfo
		Devices []DeviceInfo
	}
	if err := json.NewDecoder(result.Body).Decode(&directory); err != nil {
		t.Fatal(err)
	}
	result.Body.Close()
	if directory.User.ID != 7 || len(directory.Devices) != 1 || directory.Devices[0].ID != mine {
		t.Fatal("account directory exposed another user's device")
	}
	result = accountCall(t, client, ts.URL, "/api/account/device", map[string]any{"id": mine, "name": "My laptop"})
	result.Body.Close()
	if result.StatusCode != 200 {
		t.Fatal("owner could not rename its device")
	}
	state, err := os.ReadFile(filepath.Join(s.cfg.DataDir, "relay-state.json"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(state, []byte("fixture-user-seven")) {
		t.Fatal("login credential persisted")
	}
	result = accountCall(t, client, ts.URL, "/api/account/device", map[string]any{"id": id, "name": "stolen"})
	result.Body.Close()
	if result.StatusCode != 404 {
		t.Fatal("account renamed another user's device")
	}
	if err := s.setUserDisabled(7, true); err != nil {
		t.Fatal(err)
	}
	result = accountCall(t, client, ts.URL, "/api/account", nil)
	result.Body.Close()
	if result.StatusCode != 401 {
		t.Fatal("disabled user kept account session")
	}
	s.Close()
	ts.Close()
	restored, _ := testRelay(t, s.cfg.DataDir)
	if len(restored.Users()) != 2 || !restored.Users()[0].Disabled || restored.Devices()[1].Name != "My laptop" {
		t.Fatal("account directory did not persist")
	}
}

func TestBrowserPairingNeverGrantsAccountManagement(t *testing.T) {
	_, ts := testRelay(t, "")
	id := strings.Repeat("d", 32)
	testClient(t, ts, id, strings.Repeat("e", 64), mockClient(id, strings.Repeat("f", 64)))
	client := browser(t)
	pairBrowser(t, client, ts, id)
	response, err := client.Get(ts.URL + "/api/account")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 401 {
		t.Fatal("pairing granted account management")
	}
}

func TestDeviceRegistrationVerifiesFullCupOwner(t *testing.T) {
	s, ts := testRelay(t, "")
	s.accountHTTP = &http.Client{Transport: accountTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != fullCupAccountURL || r.Header.Get("Authorization") != "Bearer fixture-device-token" {
			t.Error("device identity was not independently verified")
		}
		return fixtureJSON(map[string]any{"code": 0, "data": map[string]any{"id": 7, "email": "device@example.test", "status": "active"}}), nil
	})}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	headers := make(http.Header)
	headers.Set("X-Remote-FullCup-Token", "fixture-device-token")
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/api/client/connect", &websocket.DialOptions{HTTPHeader: headers})
	if err != nil {
		t.Fatal(err)
	}
	defer ws.CloseNow()
	id := strings.Repeat("7", 32)
	data, _ := json.Marshal(map[string]any{"type": "register", "protocol": 1, "device_id": id, "device_secret": strings.Repeat("8", 64), "device_name": "My computer"})
	if err := ws.Write(ctx, websocket.MessageText, data); err != nil {
		t.Fatal(err)
	}
	if _, reply, err := ws.Read(ctx); err != nil || !bytes.Contains(reply, []byte("registered")) {
		t.Fatalf("device registration rejected: %s %v", reply, err)
	}
	ws.CloseNow()
	waitOffline(t, s, id)
	if s.Devices()[0].UserID != 7 || len(s.Users()) != 1 {
		t.Fatal("device did not bind to verified platform account")
	}
	data, err = os.ReadFile(filepath.Join(s.cfg.DataDir, "relay-state.json"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte("fixture-device-token")) {
		t.Fatal("platform token persisted")
	}
	peer, done := testClient(t, ts, id, strings.Repeat("8", 64), mockClient(id, strings.Repeat("9", 64)))
	peer.Close()
	<-done
	waitOffline(t, s, id)
	if s.Devices()[0].UserID != 7 {
		t.Fatal("headerless reconnect lost verified owner")
	}
}

func TestDeviceAccountSwitchRevokesOldBrowserSessions(t *testing.T) {
	s, ts := testRelay(t, "")
	s.accountHTTP = &http.Client{Transport: accountTransport(func(r *http.Request) (*http.Response, error) {
		return fixtureJSON(map[string]any{"code": 0, "data": map[string]any{"id": 8, "email": "next@example.test", "status": "active"}}), nil
	})}
	id, secret := strings.Repeat("1", 32), strings.Repeat("2", 64)
	key := digest("old-browser")
	s.mu.Lock()
	next := s.copyState()
	next.Users[7] = UserInfo{ID: 7, Email: "old@example.test", Status: "active"}
	next.Devices[id] = storedDevice{ID: id, UserID: 7, Name: "Computer", SecretHash: digest(secret)}
	next.Sessions[key] = browserSession{ID: strings.Repeat("3", 32), DeviceID: id, Grant: strings.Repeat("3", 32), ExpiresAt: time.Now().Add(time.Hour), Encrypted: true}
	err := s.saveState(next)
	cancelled := make(chan struct{})
	s.requests[key] = map[uint64]context.CancelFunc{1: func() { close(cancelled) }}
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	headers := make(http.Header)
	headers.Set("X-Remote-FullCup-Token", "fixture-new-account")
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/api/client/connect", &websocket.DialOptions{HTTPHeader: headers})
	if err != nil {
		t.Fatal(err)
	}
	defer ws.CloseNow()
	data, _ := json.Marshal(map[string]any{"type": "register", "protocol": 1, "device_id": id, "device_secret": secret, "device_name": "Computer"})
	if err := ws.Write(ctx, websocket.MessageText, data); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ws.Read(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case <-cancelled:
	default:
		t.Fatal("account switch left old browser stream alive")
	}
	s.mu.Lock()
	owner := s.state.Devices[id].UserID
	_, oldGrant := s.state.Sessions[key]
	s.mu.Unlock()
	if owner != 8 || oldGrant {
		t.Fatal("owner transfer kept previous authorization")
	}
}

func TestAccountClaimUsesOnlyCurrentPairedDevice(t *testing.T) {
	s, ts := testRelay(t, "")
	id, secret := strings.Repeat("4", 32), strings.Repeat("5", 64)
	peer, done := testClient(t, ts, id, secret, mockClient(id, strings.Repeat("6", 64)))
	client := browser(t)
	pairBrowser(t, client, ts, id)
	otherID := strings.Repeat("9", 32)
	testClient(t, ts, otherID, strings.Repeat("8", 64), mockClient(otherID, strings.Repeat("7", 64)))
	pairBrowser(t, client, ts, otherID)
	// The default cookie now belongs to another device; claim follows the selected cookie.
	client.Transport = accountTransport(func(r *http.Request) (*http.Response, error) {
		copy := r.Clone(r.Context())
		copy.Header.Set("X-Remote-Device", id)
		return http.DefaultTransport.RoundTrip(copy)
	})
	s.accountHTTP = &http.Client{Transport: accountTransport(func(r *http.Request) (*http.Response, error) {
		return fixtureJSON(map[string]any{"code": 0, "data": map[string]any{"id": 7, "email": "owner@example.test", "status": "active"}}), nil
	})}
	response := accountCall(t, client, ts.URL, "/api/account/claim", map[string]any{})
	response.Body.Close()
	if response.StatusCode != 401 {
		t.Fatal("pairing alone granted owner claim")
	}
	response = accountCall(t, client, ts.URL, "/api/account/login", map[string]any{"access_token": "fixture-owner"})
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal("account login failed")
	}
	unpaired := browser(t)
	response = accountCall(t, unpaired, ts.URL, "/api/account/login", map[string]any{"access_token": "fixture-owner"})
	response.Body.Close()
	response = accountCall(t, unpaired, ts.URL, "/api/account/claim", map[string]any{})
	response.Body.Close()
	if response.StatusCode != 401 {
		t.Fatal("account login claimed a device without pairing")
	}
	response = accountCall(t, client, ts.URL, "/api/account/claim", map[string]any{"id": strings.Repeat("a", 32)})
	response.Body.Close()
	if response.StatusCode != 400 {
		t.Fatal("claim accepted arbitrary device ID")
	}
	response = accountCall(t, client, ts.URL, "/api/account", nil)
	var before struct {
		Current *DeviceInfo `json:"current_device"`
	}
	_ = json.NewDecoder(response.Body).Decode(&before)
	response.Body.Close()
	if before.Current == nil || before.Current.ID != id || before.Current.UserID != 0 {
		t.Fatal("unowned current device was not offered for claim")
	}
	response = accountCall(t, client, ts.URL, "/api/account/claim", map[string]any{})
	response.Body.Close()
	if response.StatusCode != 200 || s.Devices()[0].UserID != 7 {
		t.Fatal("paired device was not bound to account")
	}
	response = accountCall(t, client, ts.URL, "/api/account/claim", map[string]any{})
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal("same-account claim was not idempotent")
	}
	peer.Close()
	<-done
	waitOffline(t, s, id)
	reconnected, reconnectDone := testClient(t, ts, id, secret, mockClient(id, strings.Repeat("6", 64)))
	if s.Devices()[0].UserID != 7 {
		t.Fatal("headerless self-host reconnect lost claimed owner")
	}
	s.mu.Lock()
	next := s.copyState()
	next.Users[8] = UserInfo{ID: 8, Email: "other@example.test", Status: "active"}
	device := next.Devices[id]
	device.UserID = 8
	next.Devices[id] = device
	err := s.saveState(next)
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	response = accountCall(t, client, ts.URL, "/api/account/claim", map[string]any{})
	response.Body.Close()
	if response.StatusCode != 409 {
		t.Fatal("claim transferred a device owned by another account")
	}
	reconnected.Close()
	<-reconnectDone
	waitOffline(t, s, id)
	if err := s.setUserDisabled(8, true); err != nil {
		t.Fatal(err)
	}
	rejectedRegistration(t, ts, id, secret)
}

func TestFullCupPasswordLoginPreservesSecondFactor(t *testing.T) {
	s, ts := testRelay(t, "")
	s.accountHTTP = &http.Client{Transport: accountTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "tobapi.fullcupai.com" {
			t.Fatal("credential origin changed")
		}
		switch r.URL.Path {
		case "/api/v1/auth/login":
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["email"] != "person@example.test" || body["password"] != "fixture-password" {
				t.Error("password login payload changed")
			}
			return fixtureJSON(map[string]any{"code": 0, "data": map[string]any{"requires_2fa": true, "temp_token": "fixture-factor", "user_email_masked": "p***@example.test"}}), nil
		case "/api/v1/auth/login/2fa":
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["temp_token"] != "fixture-factor" || body["totp_code"] != "123456" {
				t.Error("platform TOTP field changed")
			}
			return fixtureJSON(map[string]any{"code": 0, "data": map[string]any{"access_token": "fixture-access", "refresh_token": "fixture-refresh"}}), nil
		case "/api/v1/auth/me":
			if r.Header.Get("Authorization") != "Bearer fixture-access" {
				t.Error("access token not verified")
			}
			return fixtureJSON(map[string]any{"code": 0, "data": map[string]any{"id": 7, "email": "person@example.test", "status": "active"}}), nil
		}
		t.Error("unexpected platform request")
		return fixtureJSON(nil), nil
	})}
	client := browser(t)
	response := accountCall(t, client, ts.URL, "/api/account/login", map[string]any{"email": "person@example.test", "password": "fixture-password"})
	var factor struct {
		Requires2FA bool   `json:"requires_2fa"`
		TempToken   string `json:"temp_token"`
	}
	_ = json.NewDecoder(response.Body).Decode(&factor)
	response.Body.Close()
	if response.StatusCode != 200 || !factor.Requires2FA || factor.TempToken != "fixture-factor" {
		t.Fatal("second factor challenge discarded")
	}
	response = accountCall(t, client, ts.URL, "/api/account", nil)
	response.Body.Close()
	if response.StatusCode != 401 {
		t.Fatal("password bypassed second factor")
	}
	response = accountCall(t, client, ts.URL, "/api/account/login", map[string]any{"temp_token": factor.TempToken, "code": "123456"})
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal("TOTP login rejected")
	}
	data, err := os.ReadFile(filepath.Join(s.cfg.DataDir, "relay-state.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"fixture-password", "fixture-factor", "fixture-access", "fixture-refresh"} {
		if bytes.Contains(data, []byte(secret)) {
			t.Fatal("login secret persisted")
		}
	}
}
