package tunnel

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

func (p *Peer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	controller := http.NewResponseController(w)
	_ = controller.EnableFullDuplex()
	id := fmt.Sprintf("%s-%d", p.prefix, p.next.Add(1))
	x := newExchange(p.ctx)
	stop := context.AfterFunc(r.Context(), x.cancel)
	defer stop()
	if !p.reserve(id, x, false) {
		x.cancel()
		http.Error(w, "Remote connection is busy or offline.", http.StatusServiceUnavailable)
		return
	}
	defer p.release(id, x, false)
	defer p.control(frame{Type: "cancel", ID: id})
	f := frame{Type: "req", ID: id, Method: r.Method, URL: r.URL.RequestURI(), Host: r.Host, Header: cleanHeaders(r.Header), Length: r.ContentLength}
	if err := p.send(x.ctx, f); err != nil {
		http.Error(w, "Remote connection failed.", http.StatusBadGateway)
		return
	}
	go p.upload(x, id, r.Body)
	wrote := false
	for {
		select {
		case <-x.ctx.Done():
			if r.Context().Err() != nil {
				return
			}
			if wrote {
				panic(http.ErrAbortHandler)
			}
			http.Error(w, "Remote connection closed.", http.StatusBadGateway)
			return
		case f := <-x.frames:
			switch f.Type {
			case "head":
				if wrote {
					panic(http.ErrAbortHandler)
				}
				for k, values := range cleanHeaders(f.Header) {
					w.Header()[k] = values
				}
				w.WriteHeader(f.Status)
				wrote = f.Status >= 200
				if wrote {
					_ = controller.SetWriteDeadline(time.Now().Add(writeWait))
					err := controller.Flush()
					_ = controller.SetWriteDeadline(time.Time{})
					if err != nil && !errors.Is(err, http.ErrNotSupported) {
						return
					}
				}
			case "data":
				if !wrote {
					panic(http.ErrAbortHandler)
				}
				_ = controller.SetWriteDeadline(time.Now().Add(writeWait))
				_, err := w.Write(f.Data)
				if err == nil {
					err = controller.Flush()
				}
				_ = controller.SetWriteDeadline(time.Time{})
				if err != nil && !errors.Is(err, http.ErrNotSupported) {
					return
				}
				p.control(frame{Type: "data", ID: id, Side: "response", Ack: true})
			case "end":
				if f.Error != "" || !wrote {
					if wrote {
						panic(http.ErrAbortHandler)
					}
					http.Error(w, "Remote response failed.", http.StatusBadGateway)
				}
				return
			}
		}
	}
}

func (p *Peer) upload(x *exchange, id string, body io.ReadCloser) {
	if body == nil {
		_ = p.send(x.ctx, frame{Type: "end", ID: id, Side: "request"})
		return
	}
	stop := context.AfterFunc(x.ctx, func() { _ = body.Close() })
	defer stop()
	defer body.Close()
	buf := make([]byte, chunkSize)
	for {
		n, err := body.Read(buf)
		if n > 0 {
			if e := p.data(x, id, "request", buf[:n], time.Time{}); e != nil {
				return
			}
		}
		if err != nil {
			f := frame{Type: "end", ID: id, Side: "request"}
			if !errors.Is(err, io.EOF) {
				f.Error = "request body failed"
			}
			_ = p.send(x.ctx, f)
			return
		}
	}
}
