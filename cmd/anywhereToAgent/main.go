// Command anywhereToAgent serves the public web UI and relay for agentTools clients.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"anywheretoagent/internal/relay"
)

func main() {
	if err := run(); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}

func run() error {
	base, err := os.UserConfigDir()
	if err != nil {
		return err
	}
	dataDir := flag.String("data-dir", defaultDataDir(base), "private device and browser authorization state directory")
	listen := flag.String("listen", "127.0.0.1:8080", "HTTP relay listener; place behind an HTTPS proxy")
	publicURL := flag.String("public-url", "http://127.0.0.1:8080", "browser-visible HTTPS origin (HTTP allowed on loopback only)")
	adminListen := flag.String("admin-listen", "127.0.0.1:9090", "independent administration listener")
	configFile := flag.String("config", "", "relay configuration JSON; explicit CLI flags override it")
	flag.Parse()
	if flag.NArg() != 0 {
		return errors.New("unexpected argument; use --help for relay options")
	}
	cfg := relay.Config{DataDir: *dataDir, ListenAddress: *listen, PublicURL: *publicURL}
	if *configFile != "" {
		file, err := os.Open(*configFile)
		if err != nil {
			return err
		}
		decoder := json.NewDecoder(io.LimitReader(file, 128*1024))
		decoder.DisallowUnknownFields()
		err = decoder.Decode(&cfg)
		var extra any
		if err == nil && decoder.Decode(&extra) != io.EOF {
			err = errors.New("config must contain exactly one JSON object")
		}
		closeErr := file.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
	}
	flag.Visit(func(f *flag.Flag) {
		switch f.Name {
		case "data-dir":
			cfg.DataDir = *dataDir
		case "listen":
			cfg.ListenAddress = *listen
		case "public-url":
			cfg.PublicURL = *publicURL
		}
	})
	server, err := relay.New(cfg)
	if err != nil {
		return err
	}
	defer server.Close()
	admin, err := relay.NewAdmin(server, cfg.DataDir)
	if err != nil {
		return err
	}
	if err := admin.SetListenAddress(*adminListen); err != nil {
		return err
	}
	adminListener, err := net.Listen("tcp", *adminListen)
	if err != nil {
		return err
	}
	defer adminListener.Close()
	if err := admin.SetListenAddress(adminListener.Addr().String()); err != nil {
		return err
	}
	listener, err := net.Listen("tcp", cfg.ListenAddress)
	if err != nil {
		return err
	}
	defer listener.Close()
	server.SetAdminHandler(admin.Handler())
	newHTTP := func(handler http.Handler) *http.Server {
		return &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 * 1024}
	}
	// SSE and large attachments are streamed; per-frame tunnel deadlines bound stalled peers.
	httpServer, adminServer := newHTTP(server.Handler()), newHTTP(admin.Handler())
	defer httpServer.Close()
	defer adminServer.Close()
	serveErrors := make(chan error, 2)
	go func() { serveErrors <- httpServer.Serve(listener) }()
	go func() { serveErrors <- adminServer.Serve(adminListener) }()
	log.Printf("Relay: %s (listening on %s)", server.Config().PublicURL, listener.Addr())
	log.Printf("Administration: http://%s/admin/", adminListener.Addr())
	log.Printf("Private admin credential file: %s", admin.TokenPath())
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	select {
	case <-ctx.Done():
		return nil
	case err := <-serveErrors:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("relay listener: %w", err)
	}
}
