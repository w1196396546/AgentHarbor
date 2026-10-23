package relay

import (
	"anywheretoagent/internal/transport/tunnel"
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type connection struct {
	mu     sync.Mutex
	ws     *websocket.Conn
	peer   *tunnel.Peer
	closed bool
}

func (c *connection) close() {
	c.mu.Lock()
	c.closed = true
	peer := c.peer
	c.mu.Unlock()
	if peer != nil {
		peer.Close()
	} else {
		_ = c.ws.CloseNow()
	}
}

func (c *connection) setPeer(peer *tunnel.Peer) {
	c.mu.Lock()
	c.peer = peer
	closed := c.closed
	c.mu.Unlock()
	if closed {
		peer.Close()
	}
}

func (c *connection) getPeer() *tunnel.Peer {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return nil
	}
	return c.peer
}

func (s *Server) connect(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		failure(w, http.StatusServiceUnavailable, "Relay is stopping")
		return
	}
	s.wg.Add(1)
	s.mu.Unlock()
	defer s.wg.Done()
	if !s.allowAttempt("connect", s.clientIP(r), 30) {
		failure(w, http.StatusTooManyRequests, "Too many client connections; try again later")
		return
	}
	ws, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer ws.CloseNow()
	ws.SetReadLimit(4 * 1024)
	ctx, cancel := context.WithTimeout(s.ctx, 10*time.Second)
	stop := context.AfterFunc(r.Context(), cancel)
	typ, data, err := ws.Read(ctx)
	stop()
	cancel()
	if err != nil {
		return
	}
	var registration struct {
		Type         string `json:"type"`
		Protocol     int    `json:"protocol"`
		DeviceID     string `json:"device_id"`
		DeviceSecret string `json:"device_secret"`
		DeviceName   string `json:"device_name"`
	}
	if typ != websocket.MessageText || json.Unmarshal(data, &registration) != nil || registration.Type != "register" || registration.Protocol != 1 || !validHex(registration.DeviceID, 32) || !validHex(registration.DeviceSecret, 64) || !validName(registration.DeviceName) {
		_ = ws.Close(websocket.StatusPolicyViolation, "Invalid client registration")
		return
	}
	var account UserInfo
	if token := r.Header.Get("X-Remote-FullCup-Token"); token != "" {
		verifyCtx, stop := context.WithTimeout(r.Context(), 8*time.Second)
		account, err = s.verifyFullCupAccount(verifyCtx, token)
		stop()
		if err != nil {
			_ = ws.Close(websocket.StatusPolicyViolation, "FullCupAI account verification failed")
			return
		}
	}
	c := &connection{ws: ws}
	s.mu.Lock()
	device, exists := s.state.Devices[registration.DeviceID]
	providedHash := digest(registration.DeviceSecret)
	allowedNew := s.cfg.RegistrationEnabled == nil || *s.cfg.RegistrationEnabled
	ownerID := account.ID
	if ownerID == 0 {
		ownerID = device.UserID
	}
	if s.closed || ownerID != 0 && s.state.Users[ownerID].Disabled || account.ID != 0 && s.state.Users[account.ID].ID == 0 && len(s.state.Users) >= maxDevices || s.clients[registration.DeviceID] != nil || (exists && (device.Revoked || subtle.ConstantTimeCompare([]byte(providedHash), []byte(device.SecretHash)) != 1)) || (!exists && (!allowedNew || len(s.state.Devices) >= maxDevices)) {
		s.mu.Unlock()
		_ = ws.Close(websocket.StatusPolicyViolation, "Device cannot connect")
		return
	}
	now := time.Now().UTC()
	if !exists {
		device = storedDevice{ID: registration.DeviceID, SecretHash: providedHash, CreatedAt: now}
	}
	device.Name, device.LastSeen = registration.DeviceName, now
	next := s.copyState()
	revokedKeys := []string{}
	if account.ID != 0 {
		if device.UserID != account.ID {
			for key, session := range next.Sessions {
				if session.DeviceID == device.ID {
					delete(next.Sessions, key)
					revokedKeys = append(revokedKeys, key)
				}
			}
		}
		previous := next.Users[account.ID]
		account.CreatedAt = previous.CreatedAt
		if account.CreatedAt.IsZero() {
			account.CreatedAt = now
		}
		account.LastSeen = now
		next.Users[account.ID] = account
		device.UserID = account.ID
	}
	next.Devices[device.ID] = device
	if err := s.saveState(next); err != nil {
		s.mu.Unlock()
		_ = ws.Close(websocket.StatusInternalError, "Unable to persist device registration")
		return
	}
	for _, key := range revokedKeys {
		s.cancelRequests(key)
	}
	s.clients[device.ID] = c
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		if s.clients[device.ID] == c {
			delete(s.clients, device.ID)
			if current, ok := s.state.Devices[device.ID]; ok {
				next := s.copyState()
				current.LastSeen = time.Now().UTC()
				next.Devices[device.ID] = current
				_ = s.saveState(next)
			}
		}
		s.mu.Unlock()
	}()
	ctx, cancel = context.WithTimeout(r.Context(), 10*time.Second)
	err = ws.Write(ctx, websocket.MessageText, []byte(`{"type":"registered","protocol":1}`))
	cancel()
	if err != nil {
		return
	}
	peer := tunnel.New(ws, nil)
	c.setPeer(peer)
	heartbeatCtx, stopHeartbeat := context.WithCancel(s.ctx)
	heartbeatDone := make(chan struct{})
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-heartbeatCtx.Done():
				return
			case <-ticker.C:
				pingCtx, cancel := context.WithTimeout(heartbeatCtx, 8*time.Second)
				err := ws.Ping(pingCtx)
				cancel()
				if err != nil {
					c.close()
					return
				}
			}
		}
	}()
	_ = peer.Run(s.ctx)
	stopHeartbeat()
	<-heartbeatDone
}
