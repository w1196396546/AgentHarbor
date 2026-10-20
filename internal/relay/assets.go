package relay

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"embed"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed assets/*
var assets embed.FS

func Asset(name string) ([]byte, error) { return assets.ReadFile("assets/" + name) }

var publicAssets = sync.OnceValue(func() http.Handler {
	files, _ := fs.Sub(assets, "assets")
	fallback := http.FileServerFS(files)
	type bundle struct {
		raw, compressed []byte
		etag            string
	}
	bundles := map[string]bundle{}
	for _, name := range []string{"remote.js", "remote.css", "admin.js", "admin.css"} {
		raw, err := Asset(name)
		if err != nil {
			continue
		}
		var compressed bytes.Buffer
		writer := gzip.NewWriter(&compressed)
		_, _ = writer.Write(raw)
		_ = writer.Close()
		bundles["/"+name] = bundle{raw: raw, compressed: compressed.Bytes(), etag: fmt.Sprintf("W/\"%x\"", sha256.Sum256(raw))}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asset, ok := bundles[r.URL.Path]
		if !ok {
			fallback.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=0, must-revalidate")
		w.Header().Set("ETag", asset.etag)
		w.Header().Set("Vary", "Accept-Encoding")
		data := asset.raw
		for _, encoding := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
			kind, params, err := mime.ParseMediaType(strings.TrimSpace(encoding))
			if err != nil || kind != "gzip" {
				continue
			}
			quality := 1.0
			if value, exists := params["q"]; exists {
				quality, err = strconv.ParseFloat(value, 64)
			}
			if err == nil && quality > 0 && quality <= 1 {
				data = asset.compressed
				w.Header().Set("Content-Encoding", "gzip")
			}
			break
		}
		w.Header().Set("Content-Type", mime.TypeByExtension(r.URL.Path[strings.LastIndex(r.URL.Path, "."):]))
		http.ServeContent(w, r, r.URL.Path, time.Time{}, bytes.NewReader(data))
	})
})
