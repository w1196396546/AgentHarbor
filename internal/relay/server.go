// Package relay serves the public web UI and forwards authorized requests to clients.
package relay

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Config struct {
	PublicURL           string `json:"public_url"`
	ListenAddress       string `json:"listen_address"`
	DataDir             string `json:"data_dir"`
	RegistrationEnabled *bool  `json:"registration_enabled,omitempty"`
}

type Server struct {
	mu          sync.Mutex
	cfg         Config
	public      *url.URL
	state       persistedState
	clients     map[string]*connection
	attempts    map[string]attemptWindow
	requests    map[string]map[uint64]context.CancelFunc
	nextRequest uint64
	admin       http.Handler
	ctx         context.Context
	cancel      context.CancelFunc
	closed      bool
	wg          sync.WaitGroup
	closeDone   chan struct{}
}

type attemptWindow struct {
	start time.Time
	count int
}

func New(cfg Config) (*Server, error) {
	if cfg.ListenAddress == "" {
		cfg.ListenAddress = "127.0.0.1:8080"
	}
	if _, _, err := net.SplitHostPort(cfg.ListenAddress); err != nil {
		return nil, errors.New("listen_address must include host and port")
	}
	public, err := url.Parse(cfg.PublicURL)
	if err != nil || public.Host == "" || public.User != nil || public.RawQuery != "" || public.Fragment != "" || (public.Path != "" && public.Path != "/") {
		return nil, errors.New("public_url must be an HTTPS origin without a path")
	}
	if public.Scheme != "https" && !(public.Scheme == "http" && loopback(public.Hostname())) {
		return nil, errors.New("public_url requires HTTPS except on loopback")
	}
	public.Path = ""
	cfg.PublicURL = public.String()
	if cfg.DataDir == "" || !filepath.IsAbs(cfg.DataDir) {
		return nil, errors.New("data_dir must be an absolute private directory")
	}
	cfg.DataDir = filepath.Clean(cfg.DataDir)
	if cfg.RegistrationEnabled != nil {
		value := *cfg.RegistrationEnabled
		cfg.RegistrationEnabled = &value
	}
	ctx, cancel := context.WithCancel(context.Background())
	s := &Server{cfg: cfg, public: public, clients: map[string]*connection{}, attempts: map[string]attemptWindow{}, requests: map[string]map[uint64]context.CancelFunc{}, closeDone: make(chan struct{}), ctx: ctx, cancel: cancel}
	if err := s.loadState(); err != nil {
		cancel()
		return nil, err
	}
	return s, nil
}

func loopback(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (s *Server) Config() Config {
	cfg := s.cfg
	if cfg.RegistrationEnabled != nil {
		value := *cfg.RegistrationEnabled
		cfg.RegistrationEnabled = &value
	}
	return cfg
}

func (s *Server) SetAdminHandler(handler http.Handler) {
	s.mu.Lock()
	s.admin = handler
	s.mu.Unlock()
}

func (s *Server) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		<-s.closeDone
		return
	}
	s.closed = true
	active := make([]*connection, 0, len(s.clients))
	for _, c := range s.clients {
		active = append(active, c)
	}
	s.mu.Unlock()
	s.cancel()
	for _, c := range active {
		c.close()
	}
	s.wg.Wait()
	close(s.closeDone)
}
