package relay

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPublicBundlesCompressAndRevalidateWithoutCachingPrivateResponses(t *testing.T) {
	s, ts := testRelay(t, "")
	handler := s.Handler()
	get := func(path, encoding, etag string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, ts.URL+path, nil)
		req.Header.Set("Accept-Encoding", encoding)
		req.Header.Set("If-None-Match", etag)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		return w
	}
	for _, path := range []string{"/remote.js", "/remote.css"} {
		t.Run(path, func(t *testing.T) {
			plain := get(path, "", "")
			compressed := get(path, "gzip, br", "")
			if plain.Code != http.StatusOK || compressed.Code != http.StatusOK || compressed.Header().Get("Content-Encoding") != "gzip" {
				t.Fatalf("bundle was not compressed: %d %v", compressed.Code, compressed.Header())
			}
			reader, err := gzip.NewReader(bytes.NewReader(compressed.Body.Bytes()))
			if err != nil {
				t.Fatal(err)
			}
			raw, err := io.ReadAll(reader)
			_ = reader.Close()
			if err != nil || !bytes.Equal(raw, plain.Body.Bytes()) || compressed.Body.Len() >= plain.Body.Len()/2 {
				t.Fatal("compressed bundle differs or does not reduce transfer size", err)
			}
			etag := compressed.Header().Get("ETag")
			if etag == "" || etag != plain.Header().Get("ETag") || compressed.Header().Get("Vary") != "Accept-Encoding" || compressed.Header().Get("Cache-Control") != "public, max-age=0, must-revalidate" {
				t.Fatal("bundle cache must revalidate the current embedded content")
			}
			unchanged := get(path, "gzip", etag)
			if unchanged.Code != http.StatusNotModified || unchanged.Body.Len() != 0 {
				t.Fatal("unchanged bundle was downloaded again", unchanged.Code)
			}
			if get(path, "gzip", "\"old-build\"").Code != http.StatusOK {
				t.Fatal("a changed build did not return fresh content")
			}
			disabled := get(path, "gzip;q=0, br", "")
			if disabled.Header().Get("Content-Encoding") != "" || !bytes.Equal(disabled.Body.Bytes(), plain.Body.Bytes()) {
				t.Fatal("gzip was used despite explicit refusal")
			}
		})
	}
	for _, path := range []string{"/", "/api/device", "/api/sessions"} {
		w := get(path, "gzip", "")
		if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("Content-Encoding") != "" {
			t.Fatalf("%s lost private response policy: %v", path, w.Header())
		}
	}
}
