package relay

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func rejectedRegistration(t *testing.T, ts *httptest.Server, id, secret string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/api/client/connect", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.CloseNow()
	data, _ := json.Marshal(map[string]any{"type": "register", "protocol": 1, "device_id": id, "device_secret": secret, "device_name": "Rejected"})
	if err := ws.Write(ctx, websocket.MessageText, data); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ws.Read(ctx); err == nil {
		t.Fatal("unsafe registration accepted")
	}
}

func waitOffline(t *testing.T, s *Server, id string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		for _, device := range s.Devices() {
			if device.ID == id && !device.Online {
				return
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("client did not go offline")
}

func TestDeviceCredentialsReconnectAndAdministrativeRevocation(t *testing.T) {
	s, ts := testRelay(t, "")
	id := strings.Repeat("c", 32)
	secret := strings.Repeat("6", 64)
	grant := strings.Repeat("7", 64)
	peer, done := testClient(t, ts, id, secret, mockClient(id, grant))
	rejectedRegistration(t, ts, id, secret) // concurrent replacement cannot take an active tunnel
	rejectedRegistration(t, ts, id, strings.Repeat("8", 64))
	peer.Close()
	<-done
	waitOffline(t, s, id)
	second, _ := testClient(t, ts, id, secret, mockClient(id, grant))
	client := browser(t)
	pairBrowser(t, client, ts, id)
	assertDevice(t, client, ts, id)
	if err := s.RevokeDevice(id); err != nil {
		t.Fatal(err)
	}
	res := secureRequest(t, client, ts, "GET", "/api/sessions", "")
	res.Body.Close()
	if res.StatusCode != 401 {
		t.Fatal("device revoke kept browser grant")
	}
	second.Close()
	rejectedRegistration(t, ts, id, secret) // revocation survives an automatic reconnect attempt
	for _, device := range s.Devices() {
		if device.ID == id && (!device.Revoked || device.Online) {
			t.Fatal("revocation was not retained")
		}
	}
	s.Close()
	ts.Close()
	newRelay, newHTTP := testRelay(t, s.cfg.DataDir)
	rejectedRegistration(t, newHTTP, id, secret)
	if !newRelay.Devices()[0].Revoked {
		t.Fatal("revocation lost after restart")
	}
}

func TestDisabledRegistrationStillAllowsKnownDevice(t *testing.T) {
	s, ts := testRelay(t, "")
	id := strings.Repeat("d", 32)
	secret := strings.Repeat("9", 64)
	peer, done := testClient(t, ts, id, secret, mockClient(id, strings.Repeat("0", 64)))
	peer.Close()
	<-done
	waitOffline(t, s, id)
	s.Close()
	ts.Close()
	newHTTP := httptest.NewUnstartedServer(nil)
	disabled := false
	newRelay, err := New(Config{PublicURL: "http://" + newHTTP.Listener.Addr().String(), DataDir: s.cfg.DataDir, RegistrationEnabled: &disabled})
	if err != nil {
		t.Fatal(err)
	}
	newHTTP.Config.Handler = newRelay.Handler()
	newHTTP.Start()
	t.Cleanup(func() { newRelay.Close(); newHTTP.Close() })
	testClient(t, newHTTP, id, secret, mockClient(id, strings.Repeat("0", 64)))
	rejectedRegistration(t, newHTTP, strings.Repeat("e", 32), secret)
}

func TestUnresponsiveDeviceReleasesRegistrationWithoutDisconnectingHealthyDevice(t *testing.T) {
	s, ts := testRelay(t, "")
	id, secret := strings.Repeat("a", 32), strings.Repeat("b", 64)
	healthyID, healthySecret := strings.Repeat("1", 32), strings.Repeat("2", 64)
	testClient(t, ts, healthyID, healthySecret, mockClient(healthyID, strings.Repeat("3", 64)))
	browser := browser(t)
	pairBrowser(t, browser, ts, healthyID)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/api/client/connect", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.CloseNow()
	registration, _ := json.Marshal(map[string]any{"type": "register", "protocol": 1, "device_id": id, "device_secret": secret, "device_name": "Unresponsive device"})
	if err := ws.Write(ctx, websocket.MessageText, registration); err != nil {
		t.Fatal(err)
	}
	if _, reply, err := ws.Read(ctx); err != nil || string(reply) != `{"type":"registered","protocol":1}` {
		t.Fatalf("registration: %s %v", reply, err)
	}
	// Leave the proxy-side transport open, but stop reading so no pongs reach the relay.
	rejectedRegistration(t, ts, id, secret)
	deadline := time.NewTimer(45 * time.Second) // Allows scheduling slack beyond the 20s interval and 8s timeout.
	defer deadline.Stop()
	poll := time.NewTicker(20 * time.Millisecond)
	defer poll.Stop()
	for {
		online := false
		for _, device := range s.Devices() {
			if device.ID == id {
				online = device.Online
			}
		}
		if !online {
			break
		}
		select {
		case <-poll.C:
		case <-deadline.C:
			t.Fatal("unresponsive device still owns registration after heartbeat deadline")
		}
	}
	assertDevice(t, browser, ts, healthyID)
	rejectedRegistration(t, ts, healthyID, healthySecret)
	rejectedRegistration(t, ts, id, strings.Repeat("f", 64))
	testClient(t, ts, id, secret, mockClient(id, strings.Repeat("4", 64)))
	for _, device := range s.Devices() {
		if !device.Online || device.Revoked {
			t.Fatalf("device did not remain available after stale connection cleanup: %+v", device)
		}
	}
	s.mu.Lock()
	sessions := len(s.state.Sessions)
	s.mu.Unlock()
	if sessions != 1 {
		t.Fatalf("heartbeat cleanup changed browser authorization count: %d", sessions)
	}
}

func TestOversizedPairResponseStopsAtLimit(t *testing.T) {
	_, ts := testRelay(t, "")
	id := strings.Repeat("f", 32)
	stopped := make(chan struct{})
	testClient(t, ts, id, strings.Repeat("a", 64), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/_remote/pair" {
			w.WriteHeader(404)
			return
		}
		defer close(stopped)
		w.Header().Set("Content-Type", "application/json")
		for range 10000 {
			select {
			case <-r.Context().Done():
				return
			default:
			}
			if _, err := io.WriteString(w, strings.Repeat("x", 4096)); err != nil {
				return
			}
		}
	}))
	res := request(t, browser(t), "POST", ts.URL+"/api/pair", pairBody(id))
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadGateway {
		t.Fatalf("oversized pair response: %d", res.StatusCode)
	}
	select {
	case <-stopped:
	case <-time.After(2 * time.Second):
		t.Fatal("pair overflow did not cancel the stream")
	}
}
