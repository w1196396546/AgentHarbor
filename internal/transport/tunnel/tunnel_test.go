package tunnel

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

type tunnelPair struct {
	outgoing *Peer
	incoming *Peer
	url      string
	client   *http.Client
}

func newTunnelPair(t *testing.T, handler http.Handler) *tunnelPair {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	accepted := make(chan *Peer, 1)
	serverDone := make(chan error, 1)
	clientDone := make(chan error, 1)
	wsServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			serverDone <- err
			return
		}
		peer := New(conn, handler)
		accepted <- peer
		serverDone <- peer.Run(ctx)
	}))
	dialCtx, dialCancel := context.WithTimeout(ctx, 5*time.Second)
	conn, _, err := websocket.Dial(dialCtx, "ws"+strings.TrimPrefix(wsServer.URL, "http"), nil)
	dialCancel()
	if err != nil {
		cancel()
		wsServer.Close()
		t.Fatal(err)
	}
	var incoming *Peer
	select {
	case incoming = <-accepted:
	case err := <-serverDone:
		cancel()
		wsServer.Close()
		t.Fatalf("accept websocket: %v", err)
	case <-time.After(5 * time.Second):
		cancel()
		wsServer.Close()
		t.Fatal("websocket peer was not accepted")
	}
	outgoing := New(conn, http.NotFoundHandler())
	go func() { clientDone <- outgoing.Run(ctx) }()
	proxy := httptest.NewServer(outgoing)
	t.Cleanup(func() {
		cancel()
		outgoing.Close()
		incoming.Close()
		proxy.CloseClientConnections()
		proxy.Close()
		wsServer.CloseClientConnections()
		wsServer.Close()
		for _, done := range []<-chan error{clientDone, serverDone} {
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				t.Error("tunnel Run did not exit after Close")
			}
		}
	})
	return &tunnelPair{outgoing, incoming, proxy.URL, &http.Client{Timeout: 15 * time.Second}}
}

func newRawTunnelPeer(t *testing.T, handler http.Handler) (*websocket.Conn, <-chan error) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	finished := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(finished)
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			done <- err
			return
		}
		done <- New(conn, handler).Run(ctx)
	}))
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		cancel()
		server.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cancel()
		_ = conn.CloseNow()
		server.CloseClientConnections()
		server.Close()
		select {
		case <-finished:
		case <-time.After(5 * time.Second):
			t.Error("raw websocket peer did not stop")
		}
	})
	return conn, done
}

func TestAbsoluteRequestTargetRejected(t *testing.T) {
	var called atomic.Bool
	conn, _ := newRawTunnelPeer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called.Store(true)
		w.WriteHeader(http.StatusOK)
	}))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	data := []byte(`{"type":"req","id":"absolute-target","method":"GET","url":"https://example.invalid/private"}`)
	if err := conn.Write(ctx, websocket.MessageText, data); err != nil {
		t.Fatal(err)
	}
	head := false
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var response struct {
			Type   string `json:"type"`
			Status int    `json:"status"`
		}
		if err := json.Unmarshal(data, &response); err != nil {
			t.Fatal(err)
		}
		if response.Type == "head" {
			head = true
			if response.Status != http.StatusBadRequest {
				t.Fatalf("absolute request target returned %d, want 400", response.Status)
			}
		}
		if response.Type == "end" {
			break
		}
	}
	if !head {
		t.Error("absolute request target ended without HTTP 400")
	}
	if called.Load() {
		t.Fatal("absolute request target reached local handler")
	}
}

func TestOversizedFrameClosesPeer(t *testing.T) {
	var called atomic.Bool
	conn, done := newRawTunnelPeer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called.Store(true)
		w.WriteHeader(http.StatusOK)
	}))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// A valid request with oversized headers must fail before local dispatch.
	data, err := json.Marshal(map[string]any{
		"type": "req", "id": "oversized", "method": "GET", "url": "/private",
		"header": map[string][]string{"X-Large": {strings.Repeat("x", 105<<10)}},
	})
	if err != nil {
		t.Fatal(err)
	}
	// The sender may observe the receiver closing before its write finishes.
	_ = conn.Write(ctx, websocket.MessageText, data)
	select {
	case err := <-done:
		if err == nil {
			t.Error("oversized frame did not fail Run")
		}
	case <-ctx.Done():
		t.Fatal("oversized frame left peer running")
	}
	if _, _, err := conn.Read(ctx); err == nil {
		t.Error("oversized frame left websocket connection open")
	}
	if called.Load() {
		t.Fatal("oversized frame reached local handler")
	}
}

func TestCancelRequestUnblocksStalledResponseAndKeepsPeer(t *testing.T) {
	cancelRequest := make(chan func(), 1)
	written := make(chan error, 1)
	conn, _ := newRawTunnelPeer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/stall-response" {
			_, _ = io.WriteString(w, "next request succeeded")
			return
		}
		controller, ok := w.(interface{ CancelRequest() })
		if !ok {
			written <- fmt.Errorf("response writer does not implement CancelRequest")
			return
		}
		cancelRequest <- controller.CancelRequest
		_, err := w.Write(bytes.Repeat([]byte("x"), 9*32768))
		written <- err
	}))
	conn.SetReadLimit(100 << 10)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"req","id":"stalled-response","method":"GET","url":"/stall-response"}`)); err != nil {
		t.Fatal(err)
	}
	var cancelStream func()
	select {
	case cancelStream = <-cancelRequest:
	case err := <-written:
		t.Fatal(err)
	case <-ctx.Done():
		t.Fatal("request did not reach the streaming handler")
	}
	type responseFrame struct {
		Type   string `json:"type"`
		ID     string `json:"id"`
		Status int    `json:"status"`
		Data   []byte `json:"data"`
	}
	readFrame := func() responseFrame {
		t.Helper()
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var f responseFrame
		if err := json.Unmarshal(data, &f); err != nil {
			t.Fatal(err)
		}
		return f
	}
	chunks := 0
	for chunks < 8 {
		f := readFrame()
		if f.ID != "stalled-response" {
			t.Fatalf("unexpected response ID %q", f.ID)
		}
		switch f.Type {
		case "head":
			if f.Status != http.StatusOK {
				t.Fatalf("streaming response status = %d", f.Status)
			}
		case "data":
			if len(f.Data) != 32768 {
				t.Fatalf("response chunk size = %d", len(f.Data))
			}
			chunks++
		default:
			t.Fatalf("response ended before its credit window filled: %q", f.Type)
		}
	}
	// No ACKs: the ninth chunk cannot be sent until cancellation releases it.
	select {
	case err := <-written:
		t.Fatalf("response write did not block at its credit window: %v", err)
	default:
	}
	cancelled := make(chan struct{})
	go func() {
		cancelStream()
		close(cancelled)
	}()
	select {
	case <-cancelled:
	case <-ctx.Done():
		t.Fatal("CancelRequest blocked behind the stalled response")
	}
	select {
	case err := <-written:
		if err == nil {
			t.Error("cancelled response Write succeeded")
		}
	case <-ctx.Done():
		t.Fatal("CancelRequest did not unblock response Write")
	}
	for {
		f := readFrame()
		if f.ID == "stalled-response" && f.Type == "cancel" {
			break
		}
	}
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"req","id":"next-request","method":"GET","url":"/next-request"}`)); err != nil {
		t.Fatal(err)
	}
	var body strings.Builder
	head := false
	for {
		f := readFrame()
		if f.ID != "next-request" {
			continue
		}
		switch f.Type {
		case "head":
			head = true
			if f.Status != http.StatusOK {
				t.Fatalf("next response status = %d", f.Status)
			}
		case "data":
			body.Write(f.Data)
		case "end":
			if !head || body.String() != "next request succeeded" {
				t.Fatalf("next response = head %v, body %q", head, body.String())
			}
			return
		}
	}
}

func TestRequestRoundTrip(t *testing.T) {
	pair := newTunnelPair(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("X-Request-Target", r.RequestURI)
		w.Header().Set("X-Request-Method", r.Method)
		w.Header().Set("X-Request-Agent", r.Header.Get("X-Remote-Agent"))
		w.Header().Set("X-Request-Owner", r.Header.Get("X-Remote-Owner-Epoch"))
		w.Header()["X-Repeated"] = r.Header.Values("X-Repeated")
		w.WriteHeader(http.StatusCreated)
		_, _ = io.Copy(w, r.Body)
	}))
	req, err := http.NewRequest(http.MethodPost, pair.url+"/files/hello?x=a&x=b", strings.NewReader("hello from browser"))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Add("X-Repeated", "one")
	req.Header.Add("X-Repeated", "two")
	req.Header.Set("X-Remote-Agent", "codex")
	req.Header.Set("X-Remote-Owner-Epoch", "owner-1")
	resp, err := pair.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusCreated || string(body) != "hello from browser" {
		t.Fatalf("response = %d %q", resp.StatusCode, body)
	}
	if got := resp.Header.Get("X-Request-Target"); got != "/files/hello?x=a&x=b" {
		t.Errorf("request target = %q", got)
	}
	if got := resp.Header.Get("X-Request-Method"); got != http.MethodPost {
		t.Errorf("request method = %q", got)
	}
	if got := resp.Header.Get("X-Request-Agent"); got != "codex" {
		t.Errorf("agent selector = %q", got)
	}
	if got := resp.Header.Get("X-Request-Owner"); got != "owner-1" {
		t.Errorf("owner epoch = %q", got)
	}
	if got := strings.Join(resp.Header.Values("X-Repeated"), ","); got != "one,two" {
		t.Errorf("repeated response headers = %q", got)
	}
}

func TestSSEFlushesBeforeHandlerCompletes(t *testing.T) {
	release := make(chan struct{})
	releaseAll := sync.OnceFunc(func() { close(release) })
	finished := make(chan struct{})
	pair := newTunnelPair(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(finished)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: first\n\n")
		if err := http.NewResponseController(w).Flush(); err != nil {
			return
		}
		select {
		case <-release:
			_, _ = io.WriteString(w, "data: second\n\n")
		case <-r.Context().Done():
		}
	}))
	defer releaseAll()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pair.url+"/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := pair.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	reader := bufio.NewReader(resp.Body)
	line, err := reader.ReadString('\n')
	if err != nil || line != "data: first\n" {
		t.Fatalf("first streamed event = %q, %v", line, err)
	}
	select {
	case <-finished:
		t.Fatal("handler finished before the first event was read")
	default:
	}
	releaseAll()
	rest, err := io.ReadAll(reader)
	if err != nil || string(rest) != "\ndata: second\n\n" {
		t.Fatalf("remaining events = %q, %v", rest, err)
	}
}

type repeatedByteReader byte

func (b repeatedByteReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = byte(b)
	}
	return len(p), nil
}

func TestLargeChunkedUpload(t *testing.T) {
	const size = 23<<20 + 7
	wantHash := sha256.New()
	_, _ = io.Copy(wantHash, io.LimitReader(repeatedByteReader('Z'), size))
	want := fmt.Sprintf("%d:%x", size, wantHash.Sum(nil))
	pair := newTunnelPair(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hash := sha256.New()
		n, err := io.Copy(hash, r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_, _ = fmt.Fprintf(w, "%d:%x", n, hash.Sum(nil))
	}))
	// An opaque reader leaves the length unknown, forcing HTTP chunked encoding.
	req, err := http.NewRequest(http.MethodPost, pair.url+"/attachment", io.LimitReader(repeatedByteReader('Z'), size))
	if err != nil {
		t.Fatal(err)
	}
	resp, err := pair.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK || string(body) != want {
		t.Fatalf("large upload response = %d %q, want %q", resp.StatusCode, body, want)
	}
}

type observedUpload struct {
	reads     atomic.Int64
	readChunk chan struct{}
	closed    chan struct{}
	closeOnce sync.Once
}

func (b *observedUpload) Read(p []byte) (int, error) {
	select {
	case <-b.closed:
		return 0, io.ErrClosedPipe
	default:
	}
	b.reads.Add(1)
	select {
	case b.readChunk <- struct{}{}:
	default:
	}
	return repeatedByteReader('Z').Read(p)
}

func (b *observedUpload) Close() error {
	b.closeOnce.Do(func() { close(b.closed) })
	return nil
}

func TestStalledUploadDoesNotBlockOtherRequests(t *testing.T) {
	canceled := make(chan struct{})
	pair := newTunnelPair(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/stalled" {
			<-r.Context().Done() // Deliberately leave the upload body unread.
			close(canceled)
			return
		}
		_, _ = io.WriteString(w, "independent response")
	}))
	body := &observedUpload{readChunk: make(chan struct{}, 64), closed: make(chan struct{})}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req := httptest.NewRequest(http.MethodPost, "/stalled", body).WithContext(ctx)
	req.ContentLength = -1
	done := make(chan struct{})
	// Direct dispatch keeps HTTP socket buffers out of the upload read count.
	go func() {
		defer close(done)
		pair.outgoing.ServeHTTP(httptest.NewRecorder(), req)
	}()
	for i := 0; i < 8; i++ {
		select {
		case <-body.readChunk:
		case <-time.After(5 * time.Second):
			t.Fatalf("stalled upload only read %d chunks", i)
		}
	}
	fastCtx, fastCancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer fastCancel()
	fast, err := http.NewRequestWithContext(fastCtx, http.MethodGet, pair.url+"/independent", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := pair.client.Do(fast)
	if err != nil {
		t.Fatalf("stalled upload blocked another stream: %v", err)
	}
	data, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil || resp.StatusCode != http.StatusOK || string(data) != "independent response" {
		t.Fatalf("independent response = %d %q, %v", resp.StatusCode, data, err)
	}
	// Eight credits may retain one extra chunk already read while waiting for credit.
	if n := body.reads.Load(); n > 9 {
		t.Errorf("unread upload consumed %d chunks, want bounded window <= 9", n)
	}
	cancel()
	for _, ch := range []<-chan struct{}{done, body.closed, canceled} {
		select {
		case <-ch:
		case <-time.After(3 * time.Second):
			t.Fatal("canceling stalled upload did not release its request, body, and handler")
		}
	}
}

func TestRequestCancellationReachesHandler(t *testing.T) {
	started := make(chan struct{})
	canceled := make(chan error, 1)
	pair := newTunnelPair(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-r.Context().Done()
		canceled <- r.Context().Err()
	}))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pair.url+"/waiting", nil)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		resp, err := pair.client.Do(req)
		if resp != nil {
			resp.Body.Close()
		}
		done <- err
	}()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("request did not reach client handler")
	}
	cancel()
	select {
	case err := <-canceled:
		if err != context.Canceled {
			t.Errorf("handler context error = %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("request cancellation did not reach client handler")
	}
	select {
	case err := <-done:
		if err == nil {
			t.Error("canceled browser request unexpectedly succeeded")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("canceled browser request remained blocked")
	}
}

func TestDisconnectUnblocksPendingRequest(t *testing.T) {
	started := make(chan struct{})
	canceled := make(chan struct{})
	pair := newTunnelPair(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-r.Context().Done()
		close(canceled)
	}))
	done := make(chan error, 1)
	go func() {
		resp, err := pair.client.Get(pair.url + "/waiting")
		if resp != nil {
			if err == nil && resp.StatusCode < 500 {
				err = fmt.Errorf("disconnect returned successful status %d", resp.StatusCode)
			}
			resp.Body.Close()
		}
		done <- err
	}()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("request did not reach client handler")
	}
	pair.incoming.Close()
	select {
	case err := <-done:
		if err != nil && strings.Contains(err.Error(), "successful status") {
			t.Error(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("peer disconnect left the browser request blocked")
	}
	select {
	case <-canceled:
	case <-time.After(3 * time.Second):
		t.Fatal("peer disconnect did not cancel the client handler")
	}
}

func TestConcurrentRequestLimit(t *testing.T) {
	const limit = 32
	started := make(chan struct{}, limit+1)
	release := make(chan struct{})
	releaseAll := sync.OnceFunc(func() { close(release) })
	pair := newTunnelPair(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started <- struct{}{}
		select {
		case <-release:
			_, _ = io.WriteString(w, "done")
		case <-r.Context().Done():
		}
	}))
	defer releaseAll()
	results := make(chan error, limit)
	for i := 0; i < limit; i++ {
		go func() {
			resp, err := pair.client.Get(pair.url + "/hold")
			if resp != nil {
				_, readErr := io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
				if err == nil {
					err = readErr
				}
				if err == nil && resp.StatusCode != http.StatusOK {
					err = fmt.Errorf("pending request returned %d", resp.StatusCode)
				}
			}
			results <- err
		}()
	}
	for i := 0; i < limit; i++ {
		select {
		case <-started:
		case err := <-results:
			t.Fatalf("only %d requests reached handler before completion: %v", i, err)
		case <-time.After(5 * time.Second):
			t.Fatalf("only %d of %d requests reached handler", i, limit)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pair.url+"/overflow", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := pair.client.Do(req)
	if err != nil {
		t.Fatalf("request over the concurrency limit did not return promptly: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("request over the concurrency limit returned %d, want 503", resp.StatusCode)
	}
	releaseAll()
	for i := 0; i < limit; i++ {
		select {
		case err := <-results:
			if err != nil {
				t.Error(err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("accepted request did not complete")
		}
	}
}
