package tunnel

import (
	"context"
	"net/http"
	"time"
)

type responseWriter struct {
	p        *Peer
	x        *exchange
	id       string
	header   http.Header
	wrote    bool
	err      error
	deadline time.Time
}

func (w *responseWriter) Header() http.Header { return w.header }

// CancelRequest also interrupts a write already waiting on the peer's credit.
func (w *responseWriter) CancelRequest() {
	w.x.cancel()
	w.p.control(frame{Type: "cancel", ID: w.id})
}

func (w *responseWriter) head(status int) error {
	if w.wrote || w.err != nil {
		return w.err
	}
	if status < 100 || status > 599 {
		panic("invalid remote HTTP status")
	}
	ctx := w.x.ctx
	if !w.deadline.IsZero() {
		var cancel context.CancelFunc
		ctx, cancel = context.WithDeadline(ctx, w.deadline)
		defer cancel()
	}
	w.err = w.p.send(ctx, frame{Type: "head", ID: w.id, Side: "response", Status: status, Header: cleanHeaders(w.header)})
	w.wrote = status >= 200
	return w.err
}

func (w *responseWriter) WriteHeader(status int) { _ = w.head(status) }

func (w *responseWriter) Write(data []byte) (int, error) {
	if err := w.head(http.StatusOK); err != nil {
		return 0, err
	}
	n := 0
	for len(data) > 0 {
		size := min(len(data), chunkSize)
		if err := w.p.data(w.x, w.id, "response", data[:size], w.deadline); err != nil {
			w.err = err
			return n, err
		}
		n += size
		data = data[size:]
	}
	return n, nil
}

func (w *responseWriter) Flush() { _ = w.FlushError() }

func (w *responseWriter) FlushError() error { return w.head(http.StatusOK) }

func (w *responseWriter) SetWriteDeadline(deadline time.Time) error {
	w.deadline = deadline
	return nil
}

func (w *responseWriter) EnableFullDuplex() error { return nil }
