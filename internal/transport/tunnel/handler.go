package tunnel

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (p *Peer) data(x *exchange, id, side string, data []byte, deadline time.Time) error {
	ctx := x.ctx
	if !deadline.IsZero() {
		var cancel context.CancelFunc
		ctx, cancel = context.WithDeadline(ctx, deadline)
		defer cancel()
	}
	select {
	case <-x.credit:
	case <-ctx.Done():
		return ctx.Err()
	}
	return p.send(ctx, frame{Type: "data", ID: id, Side: side, Data: data})
}

func (p *Peer) accept(f frame) error {
	p.mu.Lock()
	_, incoming := p.in[f.ID]
	_, outgoing := p.out[f.ID]
	p.mu.Unlock()
	if incoming || outgoing {
		return errors.New("duplicate remote tunnel request")
	}
	u, err := url.ParseRequestURI(f.URL)
	if err != nil || u.IsAbs() || u.Host != "" || !strings.HasPrefix(f.URL, "/") || strings.HasPrefix(f.URL, "//") {
		p.reject(f.ID, http.StatusBadRequest)
		return nil
	}
	x := newExchange(p.ctx)
	reader, writer := io.Pipe()
	x.body = writer
	r, err := http.NewRequestWithContext(x.ctx, f.Method, f.URL, reader)
	if err != nil {
		x.cancel()
		_ = reader.Close()
		_ = writer.Close()
		p.reject(f.ID, http.StatusBadRequest)
		return nil
	}
	r.Host, r.Header, r.ContentLength, r.RequestURI = f.Host, cleanHeaders(f.Header), f.Length, f.URL
	if !p.reserve(f.ID, x, true) {
		x.cancel()
		_ = reader.Close()
		_ = writer.Close()
		p.reject(f.ID, http.StatusServiceUnavailable)
		return nil
	}
	go p.serve(x, f.ID, r, reader)
	return nil
}

func (p *Peer) reject(id string, status int) {
	p.control(frame{Type: "head", ID: id, Side: "response", Status: status})
	p.control(frame{Type: "end", ID: id, Side: "response"})
}

func (p *Peer) serve(x *exchange, id string, r *http.Request, body *io.PipeReader) {
	defer p.release(id, x, true)
	defer body.Close()
	stop := context.AfterFunc(x.ctx, func() { _ = x.body.CloseWithError(context.Canceled) })
	defer stop()
	go p.feed(x, id)
	w := &responseWriter{p: p, x: x, id: id, header: http.Header{}}
	defer func() {
		f := frame{Type: "end", ID: id, Side: "response"}
		if recover() != nil {
			f.Error = "remote handler failed"
		} else if err := w.head(http.StatusOK); err != nil {
			f.Error = "remote response failed"
		}
		_ = p.send(x.ctx, f)
	}()
	p.handler.ServeHTTP(w, r)
}

func (p *Peer) feed(x *exchange, id string) {
	for {
		select {
		case <-x.ctx.Done():
			return
		case f := <-x.frames:
			switch f.Type {
			case "data":
				if _, err := x.body.Write(f.Data); err != nil {
					return
				}
				p.control(frame{Type: "data", ID: id, Side: "request", Ack: true})
			case "end":
				var err error
				if f.Error != "" {
					err = errors.New("remote request body failed")
				}
				_ = x.body.CloseWithError(err)
				return
			}
		}
	}
}
