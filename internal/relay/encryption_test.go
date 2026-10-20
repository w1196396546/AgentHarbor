package relay

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestPlaintextPairAndOperationsNeverReachClient(t *testing.T) {
	s, ts := testRelay(t, "")
	id, grant := strings.Repeat("a", 32), strings.Repeat("3", 32)
	var calls atomic.Int32
	base := mockClient(id, grant)
	testClient(t, ts, id, strings.Repeat("1", 64), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		base.ServeHTTP(w, r)
	}))
	client := browser(t)
	res := request(t, client, "POST", ts.URL+"/api/pair", `{"key":"`+id+`.ABCDEFGHIJKL"}`)
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest || calls.Load() != 0 {
		t.Fatal("plaintext pairing reached client")
	}
	cookie := pairBrowser(t, client, ts, id)
	before := calls.Load()
	for _, operation := range []struct{ method, path string }{
		{"GET", "/api/sessions"}, {"GET", "/api/sessions/id/history"}, {"GET", "/api/sessions/id/events"},
		{"POST", "/api/threads"}, {"POST", "/api/threads/id/turn"}, {"POST", "/api/threads/id/connect"},
		{"POST", "/api/threads/id/settings"}, {"POST", "/api/threads/id/interrupt"}, {"POST", "/api/threads/id/answer"},
		{"GET", "/api/threads/id/queue"}, {"PATCH", "/api/threads/id/queue/message"}, {"DELETE", "/api/threads/id/queue/message"},
		{"GET", "/api/options"}, {"GET", "/api/files"}, {"GET", "/api/project-file"}, {"GET", "/api/attachments/id"}, {"POST", "/api/attachments"},
	} {
		res := request(t, client, operation.method, ts.URL+operation.path, `{"text":"private command"}`)
		res.Body.Close()
		if res.StatusCode != http.StatusUpgradeRequired {
			t.Errorf("plaintext %s %s: %d", operation.method, operation.path, res.StatusCode)
		}
	}
	if calls.Load() != before {
		t.Fatal("plaintext operation reached client")
	}
	s.mu.Lock()
	old := s.state.Sessions[digest(cookie.Value)]
	old.Encrypted = false
	s.state.Sessions[digest(cookie.Value)] = old
	s.mu.Unlock()
	res = secureRequest(t, client, ts, "GET", "/api/options", "")
	res.Body.Close()
	if res.StatusCode != http.StatusUpgradeRequired || calls.Load() != before {
		t.Fatal("legacy cookie used encrypted routing without re-pairing")
	}
}

func TestStartupRemovesLegacyPlaintextGrantsFromDisk(t *testing.T) {
	s, ts := testRelay(t, "")
	id, grant := strings.Repeat("c", 32), strings.Repeat("5", 32)
	testClient(t, ts, id, strings.Repeat("3", 64), mockClient(id, grant))
	pairBrowser(t, browser(t), ts, id)
	s.Close()
	ts.Close()
	statePath := filepath.Join(s.cfg.DataDir, "relay-state.json")
	data, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	var state persistedState
	if err := json.Unmarshal(data, &state); err != nil {
		t.Fatal(err)
	}
	legacySecret := strings.Repeat("e", 64)
	state.Sessions[digest("legacy browser cookie")] = browserSession{ID: strings.Repeat("d", 32), DeviceID: id, Grant: legacySecret, Name: "Legacy browser", ExpiresAt: time.Now().Add(time.Hour)}
	data, err = json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(statePath, data, 0600); err != nil {
		t.Fatal(err)
	}
	restarted, _ := testRelay(t, s.cfg.DataDir)
	if len(restarted.state.Sessions) != 1 || len(restarted.state.Devices) != 1 {
		t.Fatal("migration lost encrypted browser or device registration")
	}
	data, err = os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte(legacySecret)) || bytes.Contains(data, []byte("Legacy browser")) {
		t.Fatal("legacy plaintext authorization remains on disk")
	}
	info, err := os.Stat(statePath)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatal("migrated state is not private")
	}
}

func TestStartupRejectsMalformedEncryptedGrantWithoutRewritingState(t *testing.T) {
	s, ts := testRelay(t, "")
	id, grant := strings.Repeat("c", 32), strings.Repeat("5", 32)
	testClient(t, ts, id, strings.Repeat("3", 64), mockClient(id, grant))
	pairBrowser(t, browser(t), ts, id)
	s.Close()
	ts.Close()
	statePath := filepath.Join(s.cfg.DataDir, "relay-state.json")
	data, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	var state persistedState
	if err := json.Unmarshal(data, &state); err != nil {
		t.Fatal(err)
	}
	for key, session := range state.Sessions {
		session.Grant = strings.Repeat("6", 32)
		state.Sessions[key] = session
	}
	data, err = json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(statePath, data, 0600); err != nil {
		t.Fatal(err)
	}
	if broken, err := New(s.cfg); err == nil {
		broken.Close()
		t.Fatal("malformed encrypted grant accepted")
	}
	after, err := os.ReadFile(statePath)
	if err != nil || !bytes.Equal(after, data) {
		t.Fatal("malformed private state was overwritten")
	}
}

func TestRelayKeepsPairingAndCommandCiphertextOpaque(t *testing.T) {
	s, ts := testRelay(t, "")
	id, grant := strings.Repeat("b", 32), strings.Repeat("4", 32)
	base := mockClient(id, grant)
	private := []string{"browser-only-pairing-secret", "private command", "/private/workspace", "browser-only-session-key"}
	testClient(t, ts, id, strings.Repeat("2", 64), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		for _, value := range private {
			if bytes.Contains(body, []byte(value)) {
				t.Errorf("relay received plaintext %s", value)
			}
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		if r.URL.Path == "/_remote/secure" && (r.URL.RawQuery != "" || len(r.Header) != 5 || r.Header.Get("X-Remote-Request") != "1" || r.Header.Get("X-Codex-Remote") != "1" || r.Header.Get("X-Remote-Agent") != "" || r.Header.Get("X-Remote-Owner-Epoch") != "") {
			t.Error("relay forwarded browser-controlled plaintext headers or query")
		}
		base.ServeHTTP(w, r)
	}))
	client := browser(t)
	pairBrowser(t, client, ts, id)
	r, _ := http.NewRequest("POST", ts.URL+"/api/secure?project=/private/workspace", strings.NewReader(secureBody("POST", "/api/threads", `{"text":"private command"}`)))
	r.Header.Set("X-Codex-Remote", "1")
	r.Header.Set("X-Codex-Owner-Epoch", "private owner")
	r.Header.Set("X-Remote-Owner-Epoch", "private owner")
	r.Header.Set("X-Remote-Agent", "private agent")
	r.Header.Set("X-Remote-Device", id)
	r.Header.Set("Last-Event-ID", "private event")
	res, err := client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("encrypted request: %d", res.StatusCode)
	}
	data, err := os.ReadFile(filepath.Join(s.cfg.DataDir, "relay-state.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range private {
		if bytes.Contains(data, []byte(value)) {
			t.Errorf("relay persisted plaintext %s", value)
		}
	}
	var state persistedState
	if err := json.Unmarshal(data, &state); err != nil {
		t.Fatal(err)
	}
	for _, session := range state.Sessions {
		if !session.Encrypted || session.ID != grant || session.Grant != grant {
			t.Fatal("relay persisted reusable secret instead of routing ID")
		}
	}
}
