// Package tunnel carries bounded, streaming HTTP exchanges over one WebSocket.
package tunnel

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"sync/atomic"

	"github.com/coder/websocket"
)

var errClosed = errors.New("remote tunnel closed")

type writeJob struct {
	ctx  context.Context
	data []byte
	done chan error
}

type exchange struct {
	ctx    context.Context
	cancel context.CancelFunc
	frames chan frame
	credit chan struct{}
	body   *io.PipeWriter
}

func newExchange(ctx context.Context) *exchange {
	ctx, cancel := context.WithCancel(ctx)
	x := &exchange{ctx: ctx, cancel: cancel, frames: make(chan frame, windowSize+2), credit: make(chan struct{}, windowSize)}
	for range windowSize {
		x.credit <- struct{}{}
	}
	return x
}

// Peer serves only its supplied handler; it never dials a URL from a request.
// Run must be called once to read frames. Close also unblocks active requests.
type Peer struct {
	conn    *websocket.Conn
	handler http.Handler
	ctx     context.Context
	cancel  context.CancelFunc
	writes  chan writeJob
	prefix  string
	next    atomic.Uint64
	running atomic.Bool
	once    sync.Once
	mu      sync.Mutex
	out     map[string]*exchange
	in      map[string]*exchange
}

func New(conn *websocket.Conn, inbound http.Handler) *Peer {
	ctx, cancel := context.WithCancel(context.Background())
	if inbound == nil {
		inbound = http.NotFoundHandler()
	}
	p := &Peer{conn: conn, handler: inbound, ctx: ctx, cancel: cancel, writes: make(chan writeJob, maxStreams*(windowSize+2)), prefix: rand.Text(), out: map[string]*exchange{}, in: map[string]*exchange{}}
	conn.SetReadLimit(maxMessage)
	go p.writeLoop()
	return p
}

func (p *Peer) Close() {
	p.once.Do(func() {
		p.cancel()
		p.mu.Lock()
		for _, m := range []map[string]*exchange{p.out, p.in} {
			for _, x := range m {
				x.cancel()
				if x.body != nil {
					_ = x.body.CloseWithError(errClosed)
				}
			}
		}
		p.mu.Unlock()
		_ = p.conn.CloseNow()
	})
}

func (p *Peer) Run(ctx context.Context) error {
	if !p.running.CompareAndSwap(false, true) {
		return errors.New("remote tunnel Run called twice")
	}
	stop := context.AfterFunc(ctx, p.Close)
	defer stop()
	defer p.Close()
	for {
		typ, data, err := p.conn.Read(p.ctx)
		if err != nil {
			return err
		}
		var f frame
		if typ != websocket.MessageText || json.Unmarshal(data, &f) != nil || !validFrame(f) {
			return errors.New("invalid remote tunnel frame")
		}
		if f.Type == "req" {
			if err := p.accept(f); err != nil {
				return err
			}
			continue
		}
		p.mu.Lock()
		x := p.out[f.ID]
		if f.Side == "request" || (f.Type == "data" && f.Ack && f.Side == "response") {
			x = p.in[f.ID]
		}
		if f.Type == "data" && f.Ack && f.Side == "request" {
			x = p.out[f.ID]
		}
		if f.Type == "cancel" {
			if x == nil {
				x = p.in[f.ID]
			}
			if x != nil {
				x.cancel()
			}
			p.mu.Unlock()
			continue
		}
		p.mu.Unlock()
		if x == nil {
			continue // A cancelled exchange can still have frames in flight.
		}
		if f.Ack {
			select {
			case x.credit <- struct{}{}:
			default:
				return errors.New("invalid remote tunnel credit")
			}
			continue
		}
		select {
		case x.frames <- f:
		case <-x.ctx.Done():
		default:
			return errors.New("remote tunnel stream exceeded its window")
		}
	}
}

func (p *Peer) writeLoop() {
	for {
		select {
		case <-p.ctx.Done():
			return
		case job := <-p.writes:
			if err := job.ctx.Err(); err != nil {
				job.done <- err
				continue
			}
			ctx, cancel := context.WithTimeout(job.ctx, writeWait)
			err := p.conn.Write(ctx, websocket.MessageText, job.data)
			cancel()
			job.done <- err
			if err != nil {
				p.Close()
				return
			}
		}
	}
}

func (p *Peer) send(ctx context.Context, f frame) error {
	data, err := json.Marshal(f)
	if err != nil {
		return err
	}
	if len(data) > maxMessage {
		return errors.New("remote tunnel headers too large")
	}
	job := writeJob{ctx: ctx, data: data, done: make(chan error, 1)}
	select {
	case p.writes <- job:
	case <-ctx.Done():
		return ctx.Err()
	case <-p.ctx.Done():
		return errClosed
	}
	select {
	case err := <-job.done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	case <-p.ctx.Done():
		return errClosed
	}
}

// Control frames are never allowed to stall the shared reader.
func (p *Peer) control(f frame) {
	data, err := json.Marshal(f)
	if err != nil || len(data) > maxMessage {
		p.Close()
		return
	}
	job := writeJob{ctx: p.ctx, data: data, done: make(chan error, 1)}
	select {
	case <-p.ctx.Done():
	case p.writes <- job:
	default:
		p.Close()
	}
}

func (p *Peer) reserve(id string, x *exchange, incoming bool) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.ctx.Err() != nil || len(p.out)+len(p.in) >= maxStreams || p.out[id] != nil || p.in[id] != nil {
		return false
	}
	if incoming {
		p.in[id] = x
	} else {
		p.out[id] = x
	}
	return true
}

func (p *Peer) release(id string, x *exchange, incoming bool) {
	x.cancel()
	if x.body != nil {
		_ = x.body.CloseWithError(context.Canceled)
	}
	p.mu.Lock()
	if incoming {
		delete(p.in, id)
	} else {
		delete(p.out, id)
	}
	p.mu.Unlock()
}
