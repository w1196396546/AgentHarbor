package relay

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestNativeAndBackgroundOperationsRemainOpaqueToRelay(t *testing.T) {
	_, ts := testRelay(t, "")
	id, grant := strings.Repeat("a", 32), strings.Repeat("4", 32)
	base := mockClient(id, grant)
	testClient(t, ts, id, strings.Repeat("1", 64), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/_remote/secure" {
			base.ServeHTTP(w, r)
			return
		}
		if r.Header.Get("X-Remote-Grant") != grant || r.Header.Get("X-Codex-Owner-Epoch") != "" || r.URL.RawQuery != "" {
			t.Error("relay mixed plaintext control metadata into the encrypted request")
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		for _, private := range []string{"original-thread", "original-owner-epoch", "/work/shared", "background"} {
			if strings.Contains(string(body), private) {
				t.Errorf("relay request contains plaintext %s", private)
			}
		}
		var sealed sealedEnvelope
		var operation map[string]string
		if json.Unmarshal(body, &sealed) != nil || openTest(sealed, &operation) != nil {
			t.Error("client could not decrypt forwarded operation")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/x-ndjson")
		_ = json.NewEncoder(w).Encode(map[string]string{"data": sealTest(operation).Data})
	}))
	client := browser(t)
	pairBrowser(t, client, ts, id)
	for _, operation := range []struct{ method, path, body string }{
		{"POST", "/api/threads/original-thread/connect", `{"executor":"background","epoch":"original-owner-epoch"}`},
		{"POST", "/api/threads/original-thread/turn", `{"text":"private prompt"}`},
		{"POST", "/api/threads/original-thread/settings", `{"epoch":"original-owner-epoch"}`},
		{"PATCH", "/api/threads/original-thread/queue/message", `{"text":"private followup"}`},
		{"POST", "/api/threads", `{"executor":"background","project":"/work/shared"}`},
	} {
		res := secureRequest(t, browser(t), ts, operation.method, operation.path, operation.body)
		res.Body.Close()
		if res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("unpaired secure operation: %d", res.StatusCode)
		}
		res = secureRequest(t, client, ts, operation.method, operation.path, operation.body)
		var sealed sealedEnvelope
		var got map[string]string
		err := json.NewDecoder(res.Body).Decode(&sealed)
		res.Body.Close()
		if err != nil || openTest(sealed, &got) != nil || res.StatusCode != http.StatusOK || got["method"] != operation.method || got["path"] != operation.path || got["body"] != operation.body {
			t.Fatalf("encrypted native/background payload lost: %d %v %v", res.StatusCode, got, err)
		}
	}
}
