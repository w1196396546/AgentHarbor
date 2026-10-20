package relay

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRemoteRequestHeadersKeepCompatibilityAndOriginChecks(t *testing.T) {
	server, admin, token := adminFixture(t)
	for _, tc := range []struct {
		path, body, header string
		want               int
	}{
		{"/api/pair", `{}`, "X-Remote-Request", http.StatusBadRequest},
		{"/api/pair", `{}`, "X-Codex-Remote", http.StatusBadRequest},
		{"/api/pair", `{}`, "", http.StatusForbidden},
		{"/api/admin/login", `{"token":"` + token + `"}`, "X-Remote-Admin", http.StatusOK},
		{"/api/admin/login", `{"token":"` + token + `"}`, "X-Codex-Admin", http.StatusOK},
		{"/api/admin/login", `{}`, "", http.StatusForbidden},
	} {
		for _, origin := range []string{"https://relay.test", "https://other.test"} {
			req := httptest.NewRequest(http.MethodPost, "https://relay.test"+tc.path, strings.NewReader(tc.body))
			req.Header.Set("Origin", origin)
			if tc.header != "" {
				req.Header.Set(tc.header, "1")
			}
			response := httptest.NewRecorder()
			handler := server.Handler()
			if strings.HasPrefix(tc.path, "/api/admin/") {
				handler = admin.Handler()
			}
			handler.ServeHTTP(response, req)
			want := tc.want
			if origin != "https://relay.test" {
				want = http.StatusForbidden
			}
			if response.Code != want {
				t.Errorf("%s with %q and origin %s: %d, want %d", tc.path, tc.header, origin, response.Code, want)
			}
		}
	}
}
