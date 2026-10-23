package relay

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"anywheretoagent/internal/transport/tunnel"
	"github.com/coder/websocket"
)

func testRelay(t *testing.T, dir string) (*Server, *httptest.Server) {
	t.Helper()
	if dir == "" {
		dir = t.TempDir()
	}
	ts := httptest.NewUnstartedServer(nil)
	s, err := New(Config{PublicURL: "http://" + ts.Listener.Addr().String(), DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	ts.Config.Handler = s.Handler()
	ts.Start()
	t.Cleanup(func() { s.Close(); ts.Close() })
	return s, ts
}

func TestRateLimitUsesForwardedIPOnlyFromTrustedProxies(t *testing.T) {
	s := &Server{
		attempts:       map[string]attemptWindow{},
		trustedProxies: []netip.Prefix{netip.MustParsePrefix("127.0.0.1/32")},
	}
	request := func(remote, forwarded string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "http://relay.test/", nil)
		r.RemoteAddr = remote
		r.Header.Set("X-Forwarded-For", forwarded)
		return r
	}
	for i := 0; i < 2; i++ {
		if !s.allowAttempt("pair", s.clientIP(request("127.0.0.1:8080", "198.51.100.10")), 2) {
			t.Fatal("first client exhausted its limit too early")
		}
	}
	if !s.allowAttempt("pair", s.clientIP(request("127.0.0.1:8080", "198.51.100.11")), 2) {
		t.Fatal("a second client behind the proxy shared the first client's limit")
	}
	if s.allowAttempt("pair", s.clientIP(request("127.0.0.1:8080", "198.51.100.10")), 2) {
		t.Fatal("the first client's limit was not enforced")
	}
	if got := s.clientIP(request("192.0.2.8:1234", "203.0.113.9")); got != "192.0.2.8" {
		t.Fatalf("untrusted forwarded header changed client IP: %s", got)
	}
}

func TestNewRejectsMalformedTrustedProxyCIDR(t *testing.T) {
	_, err := New(Config{
		PublicURL:      "http://127.0.0.1:8080",
		DataDir:        t.TempDir(),
		TrustedProxies: []string{"127.0.0.1"},
	})
	if err == nil {
		t.Fatal("invalid trusted proxy entry was accepted")
	}
}

func testClient(t *testing.T, ts *httptest.Server, id, secret string, handler http.Handler) (*tunnel.Peer, <-chan struct{}) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/api/client/connect", nil)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(map[string]any{"type": "register", "protocol": 1, "device_id": id, "device_secret": secret, "device_name": "Test " + id[:4]})
	if err = ws.Write(ctx, websocket.MessageText, data); err != nil {
		t.Fatal(err)
	}
	_, reply, err := ws.Read(ctx)
	if err != nil {
		ws.CloseNow()
		t.Fatal(err)
	}
	if string(reply) != `{"type":"registered","protocol":1}` {
		t.Fatalf("registration: %s", reply)
	}
	peer := tunnel.New(ws, handler)
	done := make(chan struct{})
	go func() { defer close(done); _ = peer.Run(context.Background()) }()
	t.Cleanup(func() { peer.Close(); <-done })
	return peer, done
}

func sealTest(value any) sealedEnvelope {
	body, _ := json.Marshal(value)
	block, _ := aes.NewCipher(make([]byte, 32))
	aead, _ := cipher.NewGCM(block)
	nonce := make([]byte, aead.NonceSize())
	_, _ = rand.Read(nonce)
	id, _ := randomToken(16)
	return sealedEnvelope{ID: id, Data: base64.StdEncoding.EncodeToString(aead.Seal(nonce, nonce, body, nil))}
}

func openTest(envelope sealedEnvelope, value any) error {
	data, err := base64.StdEncoding.DecodeString(envelope.Data)
	if err != nil {
		return err
	}
	block, _ := aes.NewCipher(make([]byte, 32))
	aead, _ := cipher.NewGCM(block)
	if len(data) < aead.NonceSize() {
		return io.ErrUnexpectedEOF
	}
	body, err := aead.Open(nil, data[:aead.NonceSize()], data[aead.NonceSize():], nil)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, value)
}

func pairBody(id string) string {
	sealed := sealTest(map[string]string{"code": "browser-only-pairing-secret"})
	body, _ := json.Marshal(map[string]any{"device_id": id, "id": sealed.ID, "data": sealed.Data})
	return string(body)
}

func secureBody(method, path, body string) string {
	sealed := sealTest(map[string]string{"method": method, "path": path, "body": body})
	data, _ := json.Marshal(sealed)
	return string(data)
}

func secureRequest(t *testing.T, client *http.Client, ts *httptest.Server, method, path, body string) *http.Response {
	t.Helper()
	return request(t, client, http.MethodPost, ts.URL+"/api/secure", secureBody(method, path, body))
}

func mockClient(id, grant string) http.Handler {
	grant = grant[:32]
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/_remote/pair" {
			var in sealedEnvelope
			var value map[string]string
			if json.NewDecoder(r.Body).Decode(&in) != nil || openTest(in, &value) != nil || value["code"] != "browser-only-pairing-secret" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			sealed := sealTest(map[string]string{"key": "browser-only-session-key"})
			sealed.ID = in.ID
			jsonReply(w, http.StatusOK, map[string]any{"grant": grant, "id": grant, "name": "Remote browser", "sealed": sealed, "expires_at": time.Now().UTC().Add(30 * 24 * time.Hour)})
			return
		}
		if r.URL.Path != "/_remote/secure" || r.Header.Get("X-Remote-Grant") != grant {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/x-ndjson")
		_ = json.NewEncoder(w).Encode(map[string]string{"data": sealTest(map[string]string{"device": id}).Data})
	})
}

func browser(t *testing.T) *http.Client {
	t.Helper()
	jar, _ := cookiejar.New(nil)
	return &http.Client{Jar: jar, Timeout: 4 * time.Second}
}
func request(t *testing.T, client *http.Client, method, url, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Codex-Remote", "1")
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}
func pairBrowser(t *testing.T, client *http.Client, ts *httptest.Server, id string) *http.Cookie {
	t.Helper()
	res := request(t, client, http.MethodPost, ts.URL+"/api/pair", pairBody(id))
	defer res.Body.Close()
	if res.StatusCode != 200 {
		b, _ := io.ReadAll(res.Body)
		t.Fatalf("pair: %d %s", res.StatusCode, b)
	}
	cookies := res.Cookies()
	if len(cookies) != 2 || cookies[0].Name != "codex-remote" || cookies[1].Name != "codex-remote-"+id || cookies[0].Value != cookies[1].Value {
		t.Fatal("missing browser cookie")
	}
	return cookies[0]
}
func assertDevice(t *testing.T, client *http.Client, ts *httptest.Server, id string) {
	t.Helper()
	res := secureRequest(t, client, ts, "GET", "/api/sessions", "")
	defer res.Body.Close()
	var sealed sealedEnvelope
	var value map[string]string
	if json.NewDecoder(res.Body).Decode(&sealed) != nil || openTest(sealed, &value) != nil || res.StatusCode != 200 || value["device"] != id {
		t.Fatalf("device isolation failed: %d %v", res.StatusCode, value)
	}
}

func TestPairingDeviceIsolationAndPersistentAuthorization(t *testing.T) {
	s, ts := testRelay(t, "")
	idA, idB := strings.Repeat("a", 32), strings.Repeat("b", 32)
	secretA, secretB := strings.Repeat("1", 64), strings.Repeat("2", 64)
	testClient(t, ts, idA, secretA, mockClient(idA, strings.Repeat("3", 64)))
	testClient(t, ts, idB, secretB, mockClient(idB, strings.Repeat("4", 64)))
	a, b := browser(t), browser(t)
	cookie := pairBrowser(t, a, ts, idA)
	pairBrowser(t, b, ts, idB)
	if !cookie.HttpOnly || cookie.Secure || cookie.SameSite != http.SameSiteStrictMode || cookie.MaxAge < 29*24*60*60 {
		t.Fatalf("weak cookie attributes: %+v", cookie)
	}
	assertDevice(t, a, ts, idA)
	assertDevice(t, b, ts, idB)
	name := filepath.Join(s.cfg.DataDir, "relay-state.json")
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{secretA, secretB, cookie.Value, idA + ".ABCDEFGHIJKL"} {
		if bytes.Contains(data, []byte(secret)) {
			t.Fatal("state stores a credential that must be hashed or omitted")
		}
	}
	info, _ := os.Stat(name)
	if info.Mode().Perm() != 0600 {
		t.Fatal("state is not private")
	}
	s.Close()
	ts.Close()
	restarted, newHTTP := testRelay(t, s.cfg.DataDir)
	req, _ := http.NewRequest("GET", newHTTP.URL+"/api/device", nil)
	req.AddCookie(cookie)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var state struct {
		ID     string `json:"id"`
		Online bool   `json:"online"`
	}
	_ = json.NewDecoder(res.Body).Decode(&state)
	res.Body.Close()
	if res.StatusCode != 200 || state.ID != idA || state.Online {
		t.Fatalf("remembered device: %d %+v", res.StatusCode, state)
	}
	req, _ = http.NewRequest("POST", newHTTP.URL+"/api/secure", strings.NewReader(secureBody("GET", "/api/sessions", "")))
	req.AddCookie(cookie)
	req.Header.Set("X-Codex-Remote", "1")
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 503 {
		t.Fatalf("offline must fail promptly: %d", res.StatusCode)
	}
	testClient(t, newHTTP, idA, secretA, mockClient(idA, strings.Repeat("3", 64)))
	if len(restarted.Devices()) != 2 {
		t.Fatal("devices lost after restart")
	}
	u, _ := http.NewRequest("GET", newHTTP.URL, nil)
	a.Jar.SetCookies(u.URL, []*http.Cookie{cookie})
	assertDevice(t, a, newHTTP, idA)
}

func TestCSRFOriginsAndUnknownAPI(t *testing.T) {
	_, ts := testRelay(t, "")
	for _, tc := range []struct {
		method, path, origin, host string
		header                     bool
		want                       int
	}{
		{"POST", "/api/pair", "", "", false, 403},
		{"POST", "/api/pair", "https://evil.invalid", "", true, 403},
		{"PATCH", "/api/threads/chat/queue/message", "https://evil.invalid", "", true, 403},
		{"GET", "/healthz", "", "evil.invalid", false, 403},
		{"GET", "/api/client/connect", ts.URL, "", false, 403},
		{"GET", "/api/sessions", "", "", false, 426},
		{"GET", "/api/agents", "", "", false, 426},
		{"POST", "/api/admin/not-exposed", "", "", true, 404},
		{"POST", "/api/shell", "", "", true, 405},
	} {
		req, _ := http.NewRequest(tc.method, ts.URL+tc.path, strings.NewReader(`{}`))
		if tc.origin != "" {
			req.Header.Set("Origin", tc.origin)
		}
		if tc.host != "" {
			req.Host = tc.host
		}
		if tc.header {
			req.Header.Set("X-Codex-Remote", "1")
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != tc.want {
			t.Errorf("%s %s: %d want %d", tc.method, tc.path, res.StatusCode, tc.want)
		}
	}
}

func TestMessageQueueRoutesKeepClientAuthorization(t *testing.T) {
	_, ts := testRelay(t, "")
	id, grant := strings.Repeat("a", 32), strings.Repeat("3", 64)
	testClient(t, ts, id, strings.Repeat("1", 64), mockClient(id, grant))
	paired, unpaired := browser(t), browser(t)
	pairBrowser(t, paired, ts, id)
	for _, route := range []struct{ method, path string }{
		{"GET", "/api/threads/chat/queue"},
		{"POST", "/api/threads/chat/queue"},
		{"POST", "/api/threads/chat/queue/resume"},
		{"POST", "/api/threads/chat/queue/message/steer"},
		{"PATCH", "/api/threads/chat/queue/message"},
		{"DELETE", "/api/threads/chat/queue/message"},
	} {
		t.Run(route.method+route.path, func(t *testing.T) {
			res := secureRequest(t, unpaired, ts, route.method, route.path, `{}`)
			res.Body.Close()
			if res.StatusCode != http.StatusUnauthorized {
				t.Fatalf("unpaired queue request: %d", res.StatusCode)
			}
			res = secureRequest(t, paired, ts, route.method, route.path, `{}`)
			defer res.Body.Close()
			var value map[string]string
			var sealed sealedEnvelope
			if json.NewDecoder(res.Body).Decode(&sealed) != nil || openTest(sealed, &value) != nil || res.StatusCode != http.StatusOK || value["device"] != id {
				t.Fatalf("queue request was not forwarded to the authorized client: %d %v", res.StatusCode, value)
			}
		})
	}
}

func TestLogoutCancelsLiveStream(t *testing.T) {
	_, ts := testRelay(t, "")
	id := strings.Repeat("a", 32)
	grant := strings.Repeat("4", 64)
	stopped := make(chan struct{})
	base := mockClient(id, grant)
	testClient(t, ts, id, strings.Repeat("1", 64), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/_remote/secure" {
			w.Header().Set("Content-Type", "application/x-ndjson")
			_, _ = io.WriteString(w, `{"data":"opaque-first-record"}`+"\n")
			w.(http.Flusher).Flush()
			<-r.Context().Done()
			close(stopped)
			return
		}
		base.ServeHTTP(w, r)
	}))
	client := browser(t)
	pairBrowser(t, client, ts, id)
	res := secureRequest(t, client, ts, "GET", "/api/sessions/thread/events", "")
	defer res.Body.Close()
	buf := make([]byte, 13)
	if _, err := io.ReadFull(res.Body, buf); err != nil {
		t.Fatal(err)
	}
	logout := request(t, client, "POST", ts.URL+"/api/logout", `{}`)
	logout.Body.Close()
	if logout.StatusCode != 204 {
		t.Fatal("logout failed")
	}
	select {
	case <-stopped:
	case <-time.After(2 * time.Second):
		t.Fatal("logout left authorized stream open")
	}
	unauth := secureRequest(t, client, ts, "GET", "/api/sessions", "")
	unauth.Body.Close()
	if unauth.StatusCode != 401 {
		t.Fatal("logout did not revoke browser")
	}
}

func TestPairResponseIsBoundedAndClientCannotSetCookies(t *testing.T) {
	_, ts := testRelay(t, "")
	id := strings.Repeat("b", 32)
	grant := strings.Repeat("5", 64)
	base := mockClient(id, grant)
	testClient(t, ts, id, strings.Repeat("2", 64), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/_remote/pair" {
			w.Header()["set-cookie"] = []string{"admin=forged; Path=/"}
			w.Header()["content-security-policy"] = []string{"script-src *"}
		}
		base.ServeHTTP(w, r)
	}))
	client := browser(t)
	pairBrowser(t, client, ts, id)
	actual := secureRequest(t, client, ts, "GET", "/api/sessions", "")
	actual.Body.Close()
	if len(actual.Cookies()) != 0 || !strings.Contains(actual.Header.Get("Content-Security-Policy"), "sandbox") {
		t.Fatal("rogue client altered relay cookies/policy")
	}
	// The writer is used before any forwarded body reaches the browser.
	recorder := httptest.NewRecorder()
	writer := &relayResponse{ResponseWriter: recorder}
	writer.Header()["set-cookie"] = []string{"admin=forged; Path=/"}
	writer.Header()["content-security-policy"] = []string{"script-src *"}
	writer.WriteHeader(200)
	for key := range recorder.Header() {
		if strings.EqualFold(key, "Set-Cookie") {
			t.Fatal("case-variant cookie survived")
		}
		if strings.EqualFold(key, "Content-Security-Policy") && key != "Content-Security-Policy" {
			t.Fatal("case-variant policy survived")
		}
	}
	if len(recorder.Result().Cookies()) != 0 || !strings.Contains(recorder.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Fatal("device can overwrite relay policy")
	}
	response := &pairResponse{header: make(http.Header)}
	for range 10 {
		_, _ = response.Write(make([]byte, 4096))
	}
	if !response.overflow || response.body.Len() > 8192 {
		t.Fatal("pair response buffer is unbounded")
	}
}
