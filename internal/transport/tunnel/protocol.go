package tunnel

import (
	"net/http"
	"strings"
	"time"
)

const (
	maxStreams = 32
	chunkSize  = 32 << 10
	windowSize = 8
	maxMessage = 100 << 10
	writeWait  = 15 * time.Second
)

// Data frames with ack=true return one chunk of credit after its consumption.
// This keeps a slow upload or SSE reader from blocking the shared read loop.
type frame struct {
	Type   string      `json:"type"`
	ID     string      `json:"id"`
	Side   string      `json:"side,omitempty"`
	Method string      `json:"method,omitempty"`
	URL    string      `json:"url,omitempty"`
	Host   string      `json:"host,omitempty"`
	Header http.Header `json:"header,omitempty"`
	Length int64       `json:"length,omitempty"`
	Status int         `json:"status,omitempty"`
	Data   []byte      `json:"data,omitempty"`
	Ack    bool        `json:"ack,omitempty"`
	Error  string      `json:"error,omitempty"`
}

func validFrame(f frame) bool {
	if f.ID == "" || len(f.ID) > 96 || len(f.Data) > chunkSize || len(f.Error) > 1024 {
		return false
	}
	switch f.Type {
	case "req":
		return f.Side == "" && !f.Ack && len(f.Data) == 0 && f.Length >= -1 && len(f.URL) <= 16<<10 && len(f.Host) <= 1024
	case "head":
		return f.Side == "response" && !f.Ack && len(f.Data) == 0 && f.Status >= 100 && f.Status <= 599
	case "data":
		return (f.Side == "request" || f.Side == "response") && (!f.Ack || len(f.Data) == 0)
	case "end":
		return (f.Side == "request" || f.Side == "response") && !f.Ack && len(f.Data) == 0
	case "cancel":
		return f.Side == "" && !f.Ack && len(f.Data) == 0
	}
	return false
}

func cleanHeaders(header http.Header) http.Header {
	h := header.Clone()
	blocked := map[string]bool{"connection": true, "proxy-connection": true, "keep-alive": true, "proxy-authenticate": true, "proxy-authorization": true, "te": true, "trailer": true, "transfer-encoding": true, "upgrade": true}
	for key, values := range h {
		if strings.EqualFold(key, "Connection") {
			for _, value := range values {
				for _, key := range strings.Split(value, ",") {
					blocked[strings.ToLower(strings.TrimSpace(key))] = true
				}
			}
		}
	}
	for key := range h {
		if blocked[strings.ToLower(key)] {
			delete(h, key)
		}
	}
	return h
}
