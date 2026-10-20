package relay

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func adminFixture(t *testing.T) (*Server, *Admin, string) {
	t.Helper()
	dir := t.TempDir()
	server, err := New(Config{PublicURL: "https://relay.test", DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(server.Close)
	admin, err := NewAdmin(server, dir)
	if err != nil {
		t.Fatal(err)
	}
	server.SetAdminHandler(admin.Handler())
	token, err := os.ReadFile(admin.TokenPath())
	if err != nil {
		t.Fatal(err)
	}
	return server, admin, strings.TrimSpace(string(token))
}

func adminRequest(handler http.Handler, method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "https://relay.test"+path, strings.NewReader(body))
	req.Header.Set("Origin", "https://relay.test")
	req.Header.Set("X-Codex-Admin", "1")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func TestAdminRelayAuthAndDeviceRevocation(t *testing.T) {
	server, _, token := adminFixture(t)
	handler := server.Handler()
	if response := adminRequest(handler, "GET", "/api/admin/state", "", &http.Cookie{Name: "codex-remote", Value: token}); response.Code != http.StatusUnauthorized {
		t.Fatalf("chat token granted admin: %d", response.Code)
	}
	response := adminRequest(handler, "POST", "/api/admin/login", `{"token":"`+token+`"}`, nil)
	if response.Code != http.StatusOK {
		t.Fatalf("login: %d %s", response.Code, response.Body.String())
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].Secure || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatalf("unsafe admin cookie: %#v", cookies)
	}
	cookie := cookies[0]
	now := time.Now()
	server.state.Devices["device-1"] = storedDevice{ID: "device-1", Name: "My computer", SecretHash: strings.Repeat("a", 64), CreatedAt: now, LastSeen: now}
	response = adminRequest(handler, "GET", "/api/admin/state", "", cookie)
	if response.Code != http.StatusOK {
		t.Fatal(response.Body.String())
	}
	var state map[string]json.RawMessage
	if err := json.Unmarshal(response.Body.Bytes(), &state); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(state["devices"]), "My computer") || strings.Contains(response.Body.String(), "secret_hash") || strings.Contains(response.Body.String(), token) {
		t.Fatalf("unsafe or incomplete state: %s", response.Body.String())
	}
	for _, obsolete := range []string{"projects", "codex_home", "codex_binary", "ssh_host"} {
		if strings.Contains(string(state["config"]), obsolete) {
			t.Errorf("relay exposed client configuration: %s", obsolete)
		}
	}
	response = adminRequest(handler, "POST", "/api/admin/revoke-device", `{"id":"device-1"}`, cookie)
	if response.Code != http.StatusOK || !server.state.Devices["device-1"].Revoked {
		t.Fatalf("revoke: %d %s", response.Code, response.Body.String())
	}
	response = adminRequest(handler, "POST", "/api/admin/logout", `{}`, cookie)
	if response.Code != http.StatusNoContent {
		t.Fatal(response.Code)
	}
	if response = adminRequest(handler, "GET", "/api/admin/state", "", cookie); response.Code != http.StatusUnauthorized {
		t.Fatal("logout left admin session active")
	}
}

func TestAdminTrustBoundaryAndPrivateCredential(t *testing.T) {
	_, admin, token := adminFixture(t)
	info, err := os.Stat(admin.TokenPath())
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("credential permissions: %v %v", info, err)
	}
	for _, origin := range []string{"https://other.test", "null", ""} {
		req := httptest.NewRequest("POST", "https://relay.test/api/admin/login", strings.NewReader(`{"token":"`+token+`"}`))
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		req.Header.Set("X-Codex-Admin", "1")
		w := httptest.NewRecorder()
		admin.Handler().ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Fatalf("accepted origin %q: %d", origin, w.Code)
		}
	}
	if err := admin.SetListenAddress("0.0.0.0:9090"); err == nil {
		t.Fatal("accepted wildcard admin listener")
	}
	req := httptest.NewRequest("POST", "http://127.0.0.1:9090/api/admin/login", strings.NewReader(`{"token":"`+token+`"}`))
	req.Header.Set("Origin", "http://127.0.0.1:9090")
	req.Header.Set("X-Codex-Admin", "1")
	w := httptest.NewRecorder()
	admin.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusOK || w.Result().Cookies()[0].Secure {
		t.Fatalf("local admin login: %d", w.Code)
	}
	req = httptest.NewRequest("POST", "https://relay.test/api/admin/login", strings.NewReader(`{"token":"`+token+`"}`))
	req.Header.Set("Origin", "https://relay.test")
	w = httptest.NewRecorder()
	admin.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatal("accepted missing admin CSRF header")
	}
}
