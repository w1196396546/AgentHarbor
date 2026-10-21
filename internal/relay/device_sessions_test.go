package relay

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func selectedRequest(t *testing.T, client *http.Client, ts *httptest.Server, device, method, path, body string) *http.Response {
	t.Helper()
	r, err := http.NewRequest(method, ts.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	r.Header.Set("X-Remote-Request", "1")
	r.Header.Set("X-Remote-Device", device)
	response, err := client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func assertSelectedDevice(t *testing.T, client *http.Client, ts *httptest.Server, id string) {
	t.Helper()
	res := selectedRequest(t, client, ts, id, http.MethodPost, "/api/secure", secureBody("GET", "/api/sessions", ""))
	defer res.Body.Close()
	var sealed sealedEnvelope
	var value map[string]string
	if json.NewDecoder(res.Body).Decode(&sealed) != nil || openTest(sealed, &value) != nil || res.StatusCode != http.StatusOK || value["device"] != id {
		t.Fatalf("selected device isolation failed: %d %v", res.StatusCode, value)
	}
}

func TestOneBrowserKeepsDeviceGrantsThroughSwitchRepairAndLogout(t *testing.T) {
	s, ts := testRelay(t, "")
	idA, idB := strings.Repeat("a", 32), strings.Repeat("b", 32)
	testClient(t, ts, idA, strings.Repeat("1", 64), mockClient(idA, strings.Repeat("3", 32)))
	testClient(t, ts, idB, strings.Repeat("2", 64), mockClient(idB, strings.Repeat("4", 32)))
	client := browser(t)
	oldA := pairBrowser(t, client, ts, idA)
	cookieB := pairBrowser(t, client, ts, idB)
	assertDevice(t, client, ts, idB)
	assertSelectedDevice(t, client, ts, idA)
	assertSelectedDevice(t, client, ts, idB)

	for _, id := range []string{idA, idB, strings.Repeat("c", 32), "../invalid"} {
		res := selectedRequest(t, browser(t), ts, id, http.MethodGet, "/api/device", "")
		res.Body.Close()
		if res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("public device ID authorized access: %d", res.StatusCode)
		}
	}
	for _, values := range [][]string{{""}, {"../invalid"}, {idA, idA}} {
		r := httptest.NewRequest(http.MethodGet, "/api/device", nil)
		r.AddCookie(oldA)
		r.Header["X-Remote-Device"] = values
		if _, authorized := s.session(r); authorized {
			t.Fatal("malformed or ambiguous device header used a valid generic cookie")
		}
	}
	for _, path := range []string{"/api/device", "/api/logout"} {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		r.Header.Set("X-Remote-Device", idB)
		r.AddCookie(&http.Cookie{Name: s.deviceCookieName(idB), Value: oldA.Value})
		w := httptest.NewRecorder()
		if path == "/api/device" {
			s.device(w, r)
		} else {
			s.logout(w, r)
		}
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("mismatched cookie accepted by %s: %d", path, w.Code)
		}
	}

	newA := pairBrowser(t, client, ts, idA)
	s.mu.Lock()
	_, oldPresent := s.state.Sessions[digest(oldA.Value)]
	_, otherPresent := s.state.Sessions[digest(cookieB.Value)]
	count := len(s.state.Sessions)
	s.mu.Unlock()
	if oldPresent || !otherPresent || count != 2 || newA.Value == oldA.Value {
		t.Fatal("re-pairing did not replace only the selected device's grant")
	}
	assertSelectedDevice(t, client, ts, idB)
	assertSelectedDevice(t, client, ts, idA)
	pairBrowser(t, client, ts, idB)

	res := selectedRequest(t, client, ts, idA, http.MethodPost, "/api/logout", `{}`)
	res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("selected logout: %d", res.StatusCode)
	}
	res = selectedRequest(t, client, ts, idA, http.MethodGet, "/api/device", "")
	res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatal("selected logout retained its grant")
	}
	assertSelectedDevice(t, client, ts, idB)
	assertDevice(t, client, ts, idB)
}

func TestPairingAnotherDevicePreservesLegacyGenericCookie(t *testing.T) {
	s, ts := testRelay(t, "")
	idA, idB := strings.Repeat("a", 32), strings.Repeat("b", 32)
	testClient(t, ts, idA, strings.Repeat("1", 64), mockClient(idA, strings.Repeat("3", 32)))
	testClient(t, ts, idB, strings.Repeat("2", 64), mockClient(idB, strings.Repeat("4", 32)))
	client := browser(t)
	pairBrowser(t, client, ts, idA)
	origin, _ := url.Parse(ts.URL)
	client.Jar.SetCookies(origin, []*http.Cookie{{Name: s.deviceCookieName(idA), Path: "/", MaxAge: -1}})
	assertSelectedDevice(t, client, ts, idA)
	res := request(t, client, http.MethodPost, ts.URL+"/api/pair", pairBody(idB))
	res.Body.Close()
	if res.StatusCode != http.StatusOK || len(res.Cookies()) != 3 {
		t.Fatalf("legacy cookie was not retained per device: %d", res.StatusCode)
	}
	assertDevice(t, client, ts, idB)
	assertSelectedDevice(t, client, ts, idA)
	assertSelectedDevice(t, client, ts, idB)
}

func TestPairingPreservesClientExpiryAndCapsRelaySession(t *testing.T) {
	const lifetime = 30 * 24 * time.Hour
	for _, tc := range []struct {
		name     string
		duration time.Duration
		status   int
	}{
		{"client clock ahead", lifetime + time.Minute, http.StatusOK},
		{"shorter client grant", time.Hour, http.StatusOK},
		{"expired client grant", -time.Minute, http.StatusBadGateway},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ts := testRelay(t, "")
			id, grant := strings.Repeat("a", 32), strings.Repeat("3", 32)
			clientExpiry := time.Now().In(time.FixedZone("UTC+8", 8*60*60)).Add(tc.duration)
			testClient(t, ts, id, strings.Repeat("1", 64), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var in sealedEnvelope
				if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
					t.Error(err)
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				sealed := sealTest(map[string]any{"id": grant, "expires_at": clientExpiry})
				sealed.ID = in.ID
				jsonReply(w, http.StatusOK, map[string]any{"grant": grant, "id": grant, "sealed": sealed, "expires_at": clientExpiry})
			}))
			before := time.Now()
			res := request(t, browser(t), http.MethodPost, ts.URL+"/api/pair", pairBody(id))
			defer res.Body.Close()
			after := time.Now()
			if res.StatusCode != tc.status {
				t.Fatalf("pair status = %d, want %d", res.StatusCode, tc.status)
			}
			if tc.status != http.StatusOK {
				s.mu.Lock()
				count := len(s.state.Sessions)
				s.mu.Unlock()
				if len(res.Cookies()) != 0 || count != 0 {
					t.Fatal("expired client grant created a relay session")
				}
				return
			}
			var result struct {
				ExpiresAt string         `json:"expires_at"`
				Sealed    sealedEnvelope `json:"sealed"`
			}
			if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
				t.Fatal(err)
			}
			var encrypted struct {
				ExpiresAt string `json:"expires_at"`
			}
			if err := openTest(result.Sealed, &encrypted); err != nil {
				t.Fatal(err)
			}
			if result.ExpiresAt != encrypted.ExpiresAt || result.ExpiresAt != clientExpiry.Format(time.RFC3339Nano) {
				t.Fatal("relay changed the client expiry authenticated by the encrypted pairing reply")
			}
			cookies := res.Cookies()
			if len(cookies) != 2 {
				t.Fatal("pairing did not set both browser cookies")
			}
			for _, cookie := range cookies {
				if cookie.MaxAge <= 0 || cookie.MaxAge > int(lifetime.Seconds()) || cookie.Expires.After(after.Add(lifetime)) || cookie.Expires.After(clientExpiry) {
					t.Fatal("browser cookie exceeded the relay or client lifetime")
				}
			}
			s.mu.Lock()
			session := s.state.Sessions[digest(cookies[0].Value)]
			s.mu.Unlock()
			if session.ExpiresAt.After(after.Add(lifetime)) || session.ExpiresAt.After(clientExpiry) {
				t.Fatal("relay session exceeded the relay or client lifetime")
			}
			if tc.duration > lifetime && session.ExpiresAt.Before(before.Add(lifetime)) || tc.duration < lifetime && !session.ExpiresAt.Equal(clientExpiry) {
				t.Fatal("relay session did not retain the earlier expiry")
			}
		})
	}
}

func TestPairingLimitsRememberedDevicesBeforeConsumingAuthorizationCode(t *testing.T) {
	s, ts := testRelay(t, "")
	r := httptest.NewRequest(http.MethodPost, ts.URL+"/api/pair", nil)
	for i := range maxRememberedDevices {
		id, value := fmt.Sprintf("%032x", i+1), fmt.Sprintf("%064x", i+1)
		s.state.Devices[id] = storedDevice{ID: id}
		s.state.Sessions[digest(value)] = browserSession{DeviceID: id, ExpiresAt: time.Now().Add(time.Hour)}
		r.AddCookie(&http.Cookie{Name: s.deviceCookieName(id), Value: value})
	}
	for _, tc := range []struct {
		id   string
		want int
	}{
		{fmt.Sprintf("%032x", maxRememberedDevices+1), http.StatusConflict},
		{fmt.Sprintf("%032x", 1), http.StatusServiceUnavailable},
	} {
		request := httptest.NewRequest(http.MethodPost, ts.URL+"/api/pair", strings.NewReader(pairBody(tc.id)))
		request.Header.Set("Cookie", r.Header.Get("Cookie"))
		w := httptest.NewRecorder()
		s.pair(w, request)
		if w.Code != tc.want {
			t.Fatalf("device cap for %s: %d want %d", tc.id, w.Code, tc.want)
		}
	}
}
