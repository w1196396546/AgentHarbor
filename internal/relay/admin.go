package relay

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Admin has credentials and sessions separate from the conversation service.
type Admin struct {
	server     *Server
	tokenHash  [32]byte
	tokenPath  string
	mu         sync.Mutex
	localHosts map[string]bool
	sessions   map[[32]byte]time.Time
	attempts   map[string]adminAttempt
}

func NewAdmin(server *Server, dataDir string) (*Admin, error) {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, err
	}
	path := filepath.Join(dataDir, "admin-token")
	if _, err := os.Lstat(path); errors.Is(err, os.ErrNotExist) {
		f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			return nil, err
		}
		token, tokenErr := adminRandomKey()
		if tokenErr != nil {
			_ = f.Close()
			_ = os.Remove(path)
			return nil, tokenErr
		}
		_, writeErr := f.WriteString(token + "\n")
		if writeErr == nil {
			writeErr = f.Sync()
		}
		closeErr := f.Close()
		if writeErr != nil {
			return nil, writeErr
		}
		if closeErr != nil {
			return nil, closeErr
		}
	} else if err != nil {
		return nil, err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 {
		return nil, errors.New("Admin credential must be a regular file readable only by its owner (0600).")
	}
	if info.Size() > 128 {
		return nil, errors.New("Admin credential is corrupt.")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	token := strings.TrimSpace(string(b))
	if decoded, err := hex.DecodeString(token); err != nil || len(decoded) != 32 {
		return nil, errors.New("Admin credential is corrupt; restore its private backup or explicitly remove the credential file to generate a new one.")
	}
	a := &Admin{server: server, tokenHash: sha256.Sum256([]byte(token)), tokenPath: path, localHosts: map[string]bool{}, sessions: map[[32]byte]time.Time{}, attempts: map[string]adminAttempt{}}
	_ = a.SetListenAddress("127.0.0.1:9090")
	return a, nil
}

func (a *Admin) TokenPath() string { return a.tokenPath }

// SetListenAddress must match the separately bound admin listener.
func (a *Admin) SetListenAddress(address string) error {
	host, port, err := net.SplitHostPort(address)
	if err != nil || port == "" || (host != "127.0.0.1" && host != "::1" && host != "localhost") {
		return errors.New("The admin listener must use an explicit loopback address.")
	}
	a.mu.Lock()
	a.localHosts = map[string]bool{net.JoinHostPort("127.0.0.1", port): true, net.JoinHostPort("localhost", port): true, net.JoinHostPort("::1", port): true}
	a.mu.Unlock()
	return nil
}
