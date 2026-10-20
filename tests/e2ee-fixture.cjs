const assert = require('node:assert/strict');
const {createCipheriv, createDecipheriv, hkdfSync} = require('node:crypto');

const deviceID = '11'.repeat(16), secret = '22'.repeat(32);
const pairCode = deviceID + '.' + secret;
const grantID = '33'.repeat(16), grant = '44'.repeat(32), sessionKey = '55'.repeat(32);
const storageKey = 'codex.remote.secure.v1';
const expires = '2099-01-01T00:00:00Z';

function crypt(key, id, purpose, seq, value, decrypt = false) {
  const derived = Buffer.from(hkdfSync('sha256', Buffer.from(key, 'hex'), Buffer.from(id, 'hex'), 'agentTools remote e2ee v1 ' + purpose, 32));
  const nonce = Buffer.alloc(12); nonce.writeBigUInt64BE(BigInt(seq), 4);
  const aad = Buffer.from('agentTools/remote/e2ee/v1|' + purpose + '|' + id + '|' + seq);
  if (decrypt) {
    const data = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', derived, nonce);
    cipher.setAAD(aad); cipher.setAuthTag(data.subarray(-16));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(0, -16)), cipher.final()]).toString());
  }
  const cipher = createCipheriv('aes-256-gcm', derived, nonce); cipher.setAAD(aad);
  return Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString('base64');
}

// UI mocks keep their local HTTP contract while exercising the encrypted browser transport.
async function encryptedFixture(page, options = {}) {
  const state = {sessionKey, requests: [], pairs: []};
  const decoded = new WeakMap(), results = new WeakMap();
  const nativeRoute = page.route.bind(page), nativeWait = page.waitForResponse.bind(page), nativeOn = page.on.bind(page), nativeEvent = page.waitForEvent.bind(page);
  if (options.paired) await page.addInitScript(({storageKey, value}) => localStorage.setItem(storageKey, JSON.stringify(value)), {storageKey, value: {id: grantID, grant, key: sessionKey, expires_at: expires}});
  const decode = request => {
    if (decoded.has(request)) return decoded.get(request);
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) assert(['/api/secure', '/api/pair', '/api/device', '/api/logout'].includes(url.pathname), 'private API used plaintext relay transport: ' + url.pathname);
    let value = {url: request.url(), method: request.method(), headers: request.headers(), body: request.postDataBuffer()};
    if (url.pathname === '/api/secure') {
      const envelope = request.postDataJSON(), input = crypt(state.sessionKey, envelope.id, 'request', 0, envelope.data, true);
      assert.equal(input.grant, grant, 'client-issued browser grant changed');
      assert(input.expires_at > Date.now() - 60000 && input.expires_at <= Date.now() + 180000, 'invalid encrypted request expiry');
      const headers = Object.fromEntries(Object.entries(input.header || {}).map(([key, values]) => [key.toLowerCase(), values.join(', ')]));
      value = {url: new URL(input.url, request.url()).href, method: input.method, headers, body: Buffer.from(input.body || '', 'base64'), secure: true, id: envelope.id, key: state.sessionKey};
      state.requests.push({wire: request.postData(), ...input});
    } else if (url.pathname === '/api/pair') {
      const envelope = request.postDataJSON();
      assert.equal(envelope.device_id, deviceID);
      assert(!JSON.stringify(envelope).includes(secret), 'pairing secret reached the relay');
      const input = crypt(secret, envelope.id, 'pairing', 0, envelope.data, true);
      assert.equal(input.code, pairCode); assert.match(input.session_key, /^[0-9a-f]{64}$/);
      state.sessionKey = input.session_key; state.pairs.push(input);
      value = {...value, body: Buffer.from(JSON.stringify({key: input.code})), pair: true, id: envelope.id};
    }
    decoded.set(request, value); return value;
  };
  const requestView = (request, value) => new Proxy(request, {get(target, key) {
    if (key === 'url') return () => value.url;
    if (key === 'method') return () => value.method;
    if (key === 'headers') return () => value.headers;
    if (key === 'postData') return () => value.body?.length ? value.body.toString() : null;
    if (key === 'postDataBuffer') return () => value.body?.length ? value.body : null;
    if (key === 'postDataJSON') return () => JSON.parse(value.body.toString());
    const item = Reflect.get(target, key); return typeof item === 'function' ? item.bind(target) : item;
  }});
  const fulfill = async (route, value, response = {}) => {
    if (value.pair && (response.status || 200) === 200) return route.fulfill({json: {paired: true, id: grantID, expires_at: expires, sealed: {id: value.id, data: crypt(secret, value.id, 'paired', 0, {id: grantID, grant, expires_at: expires})}}});
    if (!value.secure) return route.fulfill(response);
    const status = response.status || 200, headers = {...response.headers};
    let body = response.body == null ? Buffer.alloc(0) : Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);
    if (Object.hasOwn(response, 'json')) { body = Buffer.from(JSON.stringify(response.json)); headers['Content-Type'] = 'application/json'; }
    if (response.contentType) headers['Content-Type'] = response.contentType;
    const header = Object.fromEntries(Object.entries(headers).map(([key, entry]) => [key, [entry]]));
    const records = [{type: 'head', status, header}];
    for (let offset = 0; offset < body.length; offset += 16384) records.push({type: 'data', data: body.subarray(offset, offset + 16384).toString('base64')});
    records.push({type: 'end'}); results.set(route.request(), status);
    return route.fulfill({status: 200, contentType: 'application/x-ndjson', body: records.map((record, seq) => JSON.stringify({data: crypt(value.key, value.id, 'response', seq, record)})).join('\n') + '\n'});
  };
  page.route = (pattern, callback, routeOptions) => nativeRoute(typeof pattern === 'string' && pattern.includes('/api/') ? '**/*' : pattern, async route => {
    const request = route.request(), value = decode(request);
    const escaped = typeof pattern === 'string' ? pattern.split('*').map(part => part.replace(/[^a-zA-Z0-9_]/g, char => String.fromCharCode(92) + char)).join('.*') : '';
    const matches = typeof pattern !== 'string' || new RegExp('^' + escaped + '$').test(value.url);
    if (!matches) return route.fallback();
    return callback(new Proxy(route, {get(target, key) {
      if (key === 'request') return () => requestView(request, value);
      if (key === 'fulfill') return response => fulfill(target, value, response);
      const item = Reflect.get(target, key); return typeof item === 'function' ? item.bind(target) : item;
    }}));
  }, routeOptions);
  page.waitForResponse = (predicate, waitOptions) => nativeWait(response => {
    const request = response.request(), value = decode(request);
    return predicate(new Proxy(response, {get(target, key) {
      if (key === 'url') return () => value.url;
      if (key === 'status') return () => results.get(request) || target.status();
      if (key === 'request') return () => requestView(request, value);
      const item = Reflect.get(target, key); return typeof item === 'function' ? item.bind(target) : item;
    }}));
  }, waitOptions);
  page.on = (event, listener) => nativeOn(event, event === 'requestfailed' ? request => listener(requestView(request, decode(request))) : listener);
  page.waitForEvent = (event, option) => {
    if (event !== 'requestfailed') return nativeEvent(event, option);
    const predicate = typeof option === 'function' ? option : option?.predicate;
    return nativeEvent(event, {...(typeof option === 'object' ? option : {}), predicate: request => !predicate || predicate(requestView(request, decode(request)))}).then(request => requestView(request, decode(request)));
  };
  return state;
}

module.exports = {encryptedFixture, pairCode, deviceID, grantID, grant, sessionKey, storageKey, crypt};
