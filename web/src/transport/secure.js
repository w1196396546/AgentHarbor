(() => {
  'use strict';
  const storageKey = 'codex.remote.secure.v1', devicesKey = 'codex.remote.devices.v1', maxDevices = 16;
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal:true});
  const invalid = () => Object.assign(new Error('Encrypted connection could not be verified. Pair this browser again.'), {secureInvalid:true});
  const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  const random = size => hex(crypto.getRandomValues(new Uint8Array(size)));
  function unhex(value, size) {
    if (typeof value !== 'string' || !new RegExp('^[a-f0-9]{' + size * 2 + '}$').test(value)) throw invalid();
    return Uint8Array.from(value.match(/../g), byte => parseInt(byte, 16));
  }
  function base64(bytes) {
    let value = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(value);
  }
  function unbase64(value) {
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw invalid();
    return Uint8Array.from(atob(value), byte => byte.charCodeAt(0));
  }
  async function key(secret, id, purpose) {
    if (!crypto.subtle) throw new Error('Encrypted remote control requires a secure browser.');
    const material = await crypto.subtle.importKey('raw', unhex(secret, 32), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'HKDF', hash:'SHA-256', salt:unhex(id, 16), info:encoder.encode('agentTools remote e2ee v1 ' + purpose)}, material, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
  }
  function parameters(id, purpose, sequence) {
    const iv = new Uint8Array(12);
    new DataView(iv.buffer).setBigUint64(4, BigInt(sequence));
    return {name:'AES-GCM', iv, additionalData:encoder.encode('agentTools/remote/e2ee/v1|' + purpose + '|' + id + '|' + sequence), tagLength:128};
  }
  async function seal(secret, id, purpose, value) {
    const derived = await key(secret, id, purpose);
    return base64(new Uint8Array(await crypto.subtle.encrypt(parameters(id, purpose, 0), derived, encoder.encode(JSON.stringify(value)))));
  }
  async function open(derived, id, purpose, sequence, data) {
    try { return JSON.parse(decoder.decode(await crypto.subtle.decrypt(parameters(id, purpose, sequence), derived, unbase64(data)))); }
    catch { throw invalid(); }
  }
  function validSession(value) {
    unhex(value.id, 16); unhex(value.grant, 32); unhex(value.key, 32);
    if (value.device_id !== undefined) unhex(value.device_id, 16);
    if (!(Date.parse(value.expires_at) > Date.now())) throw invalid();
    return value;
  }
  let currentSession;
  function session() {
    try {
      if (currentSession === undefined) currentSession = JSON.parse(localStorage.getItem(storageKey));
      return validSession(currentSession);
    } catch { return null; }
  }
  function remembered() {
    let values;
    try { values = JSON.parse(localStorage.getItem(devicesKey) || '[]'); } catch { throw invalid(); }
    if (!Array.isArray(values) || values.length > maxDevices) throw invalid();
    const devices = [];
    for (const value of values) {
      try {
        validSession(value); unhex(value.device_id, 16);
        if (!devices.some(device => device.device_id === value.device_id)) devices.push(value);
      } catch {}
    }
    return devices;
  }
  const changed = () => window.dispatchEvent(new Event('remote-devices-changed'));
  function save(value) {
    const devices = remembered(), index = devices.findIndex(device => device.device_id === value.device_id);
    if (index < 0 && devices.length >= maxDevices) throw new Error('This browser remembers 16 computers. Disconnect one before pairing another.');
    if (index < 0) devices.push(value); else devices[index] = value;
    localStorage.setItem(devicesKey, JSON.stringify(devices));
    localStorage.setItem(storageKey, JSON.stringify(value));
    currentSession = value;
    changed();
  }
  function rememberDevice(device) {
    const value = session();
    if (!value || !device || !/^[a-f0-9]{32}$/.test(device.id) || value.device_id && value.device_id !== device.id) return;
    if (value.device_id === device.id && value.name === device.name) return;
    save({...value, device_id:device.id, name:typeof device.name === 'string' ? device.name.slice(0, 128) : ''});
  }
  function select(id) {
    unhex(id, 16);
    const value = remembered().find(device => device.device_id === id);
    if (!value) throw new Error('Pair this browser with this computer first.');
    localStorage.setItem(storageKey, JSON.stringify(value));
    currentSession = value;
    changed();
  }
  function clear() {
    const selected = session();
    if (selected?.device_id) localStorage.setItem(devicesKey, JSON.stringify(remembered().filter(device => device.device_id !== selected.device_id)));
    localStorage.removeItem(storageKey);
    currentSession = null;
    changed();
  }
  async function pair(fullCode) {
    const parts = fullCode.trim().split('.');
    if (parts.length !== 2) throw new Error('Generate a new encrypted pairing key in agentTools.');
    unhex(parts[0], 16); unhex(parts[1], 32);
    const previous = session();
    if (previous && !previous.device_id) {
      const current = await fetch('/api/device', {cache:'no-store'});
      if (current.ok) rememberDevice(await current.json());
      else if (current.status !== 401) throw new Error('The current computer could not be verified. Try again.');
    }
    const devices = remembered();
    if (!devices.some(device => device.device_id === parts[0]) && devices.length >= maxDevices) throw new Error('This browser remembers 16 computers. Disconnect one before pairing another.');
    const id = random(16), sessionKey = random(32);
    const data = await seal(parts[1], id, 'pairing', {code:parts.join('.'), name:navigator.userAgent.slice(0, 128) || 'Remote browser', session_key:sessionKey});
    const response = await fetch('/api/pair', {method:'POST', headers:{'Content-Type':'application/json', 'X-Codex-Remote':'1'}, body:JSON.stringify({device_id:parts[0], id, data}), cache:'no-store'});
    if (!response.ok) throw new Error(response.status === 401 ? 'Authorization code is invalid or expired.' : response.status === 503 ? 'Your computer is offline' : 'Connection failed.');
    const result = await response.json();
    if (result.paired !== true || result.sealed?.id !== id) throw invalid();
    const value = await open(await key(parts[1], id, 'paired'), id, 'paired', 0, result.sealed.data);
    unhex(value.id, 16); unhex(value.grant, 32);
    if (result.id !== value.id || result.expires_at !== value.expires_at || !(Date.parse(value.expires_at) > Date.now())) throw invalid();
    save({id:value.id, grant:value.grant, key:sessionKey, expires_at:value.expires_at, device_id:parts[0]});
    return result;
  }
  async function secureFetch(path, init = {}) {
    const credentials = session();
    if (!credentials) throw new Error('Pair this browser first');
    if (typeof path !== 'string' || path.startsWith('/') || path.includes('#')) throw invalid();
    const method = (init.method || 'GET').toUpperCase();
    const request = new Request(location.origin + '/api/' + path, {...init, method});
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.length > 21 * 1024 * 1024) throw new Error('Attachments must be 20 MB or smaller.');
    const header = {};
    request.headers.forEach((value, name) => { header[name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('-')] = [value]; });
    const id = random(16);
    const data = await seal(credentials.key, id, 'request', {grant:credentials.grant, method, url:'/api/' + path, header, body:base64(body), expires_at:Date.now() + 120000});
    const outer = await fetch('/api/secure', {method:'POST', headers:{'Content-Type':'application/json', 'X-Codex-Remote':'1', ...(credentials.device_id ? {'X-Remote-Device':credentials.device_id} : {})}, body:JSON.stringify({id, data}), cache:'no-store', signal:init.signal});
    if (!outer.ok) { await outer.body?.cancel(); return new Response(null, {status:outer.status}); }
    if (!outer.body || !outer.headers.get('content-type')?.toLowerCase().startsWith('application/x-ndjson')) throw invalid();
    const derived = await key(credentials.key, id, 'response'), reader = outer.body.getReader(), lines = new TextDecoder('utf-8', {fatal:true});
    let pending = '', eof = false, sequence = 0, ended = false;
    async function next() {
      while (!pending.includes('\n')) {
        if (eof) throw invalid();
        const chunk = await reader.read();
        eof = chunk.done;
        try { pending += lines.decode(chunk.value, {stream:!eof}); } catch { throw invalid(); }
        if (pending.indexOf('\n') > 100000 || !pending.includes('\n') && pending.length > 100000) throw invalid();
      }
      const index = pending.indexOf('\n'), line = pending.slice(0, index);
      if (index > 100000) throw invalid();
      pending = pending.slice(index + 1);
      let frame;
      try { frame = JSON.parse(line); } catch { throw invalid(); }
      if (!frame || Object.keys(frame).length !== 1 || typeof frame.data !== 'string') throw invalid();
      return open(derived, id, 'response', sequence++, frame.data);
    }
    async function finish() {
      if (pending) throw invalid();
      if (!eof) { const tail = await reader.read(); if (!tail.done) throw invalid(); }
      ended = true;
    }
    try {
      const head = await next();
      if (head.type !== 'head' || !Number.isInteger(head.status) || head.status < 200 || head.status > 599 || head.header !== undefined && (!head.header || typeof head.header !== 'object' || Array.isArray(head.header))) throw invalid();
      const headers = new Headers();
      try {
        for (const [name, values] of Object.entries(head.header || {})) {
          if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw invalid();
          for (const value of values) headers.append(name, value);
        }
      } catch { throw invalid(); }
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const frame = await next();
            if (frame.type === 'data') { controller.enqueue(unbase64(frame.data)); return; }
            if (frame.type !== 'end') throw invalid();
            await finish(); controller.close();
          } catch (error) { await reader.cancel().catch(() => {}); controller.error(error); }
        },
        cancel(reason) { return reader.cancel(reason); }
      });
      if ([204, 205, 304].includes(head.status)) {
        const empty = stream.getReader();
        while (true) { const chunk = await empty.read(); if (chunk.done) break; if (chunk.value.length) throw invalid(); }
        return new Response(null, {status:head.status, headers});
      }
      return new Response(stream, {status:head.status, headers});
    } catch (error) { if (!ended) await reader.cancel().catch(() => {}); throw error; }
  }
  function events(path, options = {}) {
    const listeners = new Map(), controller = new AbortController();
    let lastEventId = '', retryTimer;
    const source = {readyState:0, onopen:null, onerror:null, addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(listener); }, close() { this.readyState = 2; clearTimeout(retryTimer); controller.abort(); }};
    const dispatch = (name, data) => { try { for (const listener of listeners.get(name) || []) listener({data, lastEventId}); } catch { throw invalid(); } };
    const delay = ms => new Promise(resolve => {
      const done = () => { clearTimeout(retryTimer); controller.signal.removeEventListener('abort', done); resolve(); };
      retryTimer = setTimeout(done, ms);
      controller.signal.addEventListener('abort', done, {once:true});
      if (controller.signal.aborted) done();
    });
    (async () => {
      let retry = 500;
      while (source.readyState !== 2) {
       try {
        const headers = new Headers(options.headers);
        headers.set('Accept', 'text/event-stream');
        if (lastEventId) headers.set('Last-Event-ID', lastEventId);
        else headers.delete('Last-Event-ID');
        const response = await secureFetch(path, {headers, signal:controller.signal});
        if (!response.ok) {
          await response.body?.cancel();
          throw Object.assign(new Error('Connection failed.'), {permanent:response.status < 500, retryable:response.status >= 500});
        }
        if (!response.body || !response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) throw invalid();
        source.readyState = 1; source.onopen?.();
        const reader = response.body.getReader(), text = new TextDecoder('utf-8', {fatal:true});
        let buffer = '', event = '', data = [], eventSize = 0, eventID;
        while (source.readyState !== 2) {
          const chunk = await reader.read();
          if (chunk.done) break;
          try { buffer += text.decode(chunk.value, {stream:true}); } catch { throw invalid(); }
          if (buffer.length > 8 * 1024 * 1024) throw invalid();
          let index;
          while ((index = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, index).replace(/\r$/, ''); buffer = buffer.slice(index + 1);
            if (!line) {
              if (data.length) {
                if (eventID !== undefined) lastEventId = eventID;
                dispatch(event || 'message', data.join('\n'));
                retry = 500;
                if (event === 'archived' || event === 'unavailable') { source.close(); break; }
              }
              event = ''; data = []; eventSize = 0; eventID = undefined; continue;
            }
            if (line.startsWith('event:')) event = line.slice(6).replace(/^ /, '');
            if (line.startsWith('id:')) {
              eventID = line.slice(3).replace(/^ /, '');
              if (eventID.length > 96 || eventID.includes('\0')) throw invalid();
            }
            if (line.startsWith('data:')) { eventSize += line.length; if (eventSize > 8 * 1024 * 1024) throw invalid(); data.push(line.slice(5).replace(/^ /, '')); }
          }
        }
        if (source.readyState === 2) return;
        try { text.decode(); } catch { throw invalid(); }
        if (buffer || data.length) throw invalid();
       } catch (error) {
        if (source.readyState === 2) return;
        if (error.secureInvalid || error.permanent || !error.retryable && !(error instanceof TypeError)) {
          source.close(); source.onerror?.(error); return;
        }
       }
       source.readyState = 0; source.onerror?.(new Error('Connection interrupted. Reconnecting.'));
       await delay(retry); retry = Math.min(10000, retry * 2);
      }
    })();
    return source;
  }
  window.RemoteSecure = {pair, fetch:secureFetch, clear, available:() => !!session(), events, deviceID:() => session()?.device_id || '', devices:() => remembered().map(({device_id, name, expires_at}) => ({device_id, name:name || '', expires_at})), select, rememberDevice};
})();

