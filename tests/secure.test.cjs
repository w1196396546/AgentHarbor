const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createCipheriv, createDecipheriv, hkdfSync, randomBytes} = require('node:crypto');
const {chromium, webkit} = require('playwright');
const asset = path.resolve(__dirname, '../web/src/transport/secure.js');
const engines = process.env.BROWSER ? [process.env.BROWSER] : ['chromium', 'webkit'];
function crypt(secret, id, purpose, value, sequence = 0, decrypt = false) {
  const key = hkdfSync('sha256', Buffer.from(secret, 'hex'), Buffer.from(id, 'hex'), 'agentTools remote e2ee v1 ' + purpose, 32);
  const nonce = Buffer.alloc(12); nonce.writeBigUInt64BE(BigInt(sequence), 4);
  const aad = Buffer.from('agentTools/remote/e2ee/v1|' + purpose + '|' + id + '|' + sequence);
  const cipher = (decrypt ? createDecipheriv : createCipheriv)('aes-256-gcm', key, nonce); cipher.setAAD(aad);
  if (decrypt) { const body = Buffer.from(value, 'base64'); cipher.setAuthTag(body.subarray(-16)); return JSON.parse(Buffer.concat([cipher.update(body.subarray(0, -16)), cipher.final()]).toString()); }
  return Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
for (const engine of engines) {
  test(engine + ': encrypted pairing, JSON, multipart, downloads, SSE and ciphertext failures', async t => {
    const browser = await ({chromium, webkit}[engine]).launch(); t.after(() => browser.close());
    const page = await browser.newPage(); page.setDefaultTimeout(10000);
    const device = randomBytes(16).toString('hex'), secret = randomBytes(32).toString('hex'), grant = randomBytes(32).toString('hex'), grantID = randomBytes(16).toString('hex');
    const fullCode = device + '.' + secret, expires = new Date(Date.now() + 86400000).toISOString();
    let sessionKey, mode = '', seen = [], calls = 0;
    const frames = (id, values) => values.map((value, index) => JSON.stringify({data:crypt(sessionKey, id, 'response', value, index)}) + '\n');
    await page.route('https://secure.test/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/') return route.fulfill({body:'<!doctype html><title>Secure fixture</title><script src="/secure.js"></script>', contentType:'text/html'});
      if (url.pathname === '/secure.js') return route.fulfill({body:await fs.readFile(asset), contentType:'text/javascript'});
      assert(!url.search.includes(secret));
      const wire = request.postDataJSON();
      assert(!request.postData().includes(fullCode), 'pair secret was sent to relay');
      if (url.pathname === '/api/pair') {
        assert.equal(wire.device_id, device);
        const value = crypt(secret, wire.id, 'pairing', wire.data, 0, true); assert.equal(value.code, fullCode); sessionKey = value.session_key;
        const paired = {id:grantID, grant, expires_at:expires};
        return route.fulfill({json:{paired:true, id:grantID, expires_at:expires, sealed:{id:wire.id, data:crypt(secret, wire.id, 'paired', paired)}}});
      }
      assert.equal(url.pathname, '/api/secure', 'content used plaintext endpoint');
      calls++;
      assert.deepEqual(Object.keys(wire).sort(), ['data', 'id']);
      assert(!request.postData().includes(grant), 'grant was sent to relay');
      assert(!request.postData().includes(sessionKey), 'session key was sent to relay');
      const value = crypt(sessionKey, wire.id, 'request', wire.data, 0, true); seen.push(value);
      assert.equal(value.grant, grant); assert(value.expires_at > Date.now());
      let content = Buffer.from(JSON.stringify({ok:true, private:'secret reply'})), type = 'application/json';
      if (value.url.includes('project-file')) { content = Buffer.from([0, 255, 11, 25]); type = 'image/png'; }
      if (value.url.endsWith('/events')) { content = Buffer.from('event: live\ndata: {"private":"event reply"}\n\n'); type = 'text/event-stream'; }
      if(mode==='plaintext')return route.fulfill({status:400,json:{created_thread_id:'forged-thread',archived:true,history_unavailable:true,error:'untrusted relay message'}});
      const output = frames(wire.id, [{type:'head',status:200,header:{'Content-Type':[type]}},{type:'data',data:content.toString('base64')},{type:'end'}]);
      if (mode === 'tamper') { const frame=JSON.parse(output[1]);frame.data=(frame.data[0]==='A'?'B':'A')+frame.data.slice(1);output[1]=JSON.stringify(frame)+'\n'; }
      if (mode === 'reorder') [output[1],output[2]]=[output[2],output[1]];
      if (mode === 'truncate') output.pop();
      if (mode === 'append') output.push(output[2]);
      return route.fulfill({body:output.join(''),contentType:'application/x-ndjson'});
    });
    await page.goto('https://secure.test/');
    assert.equal(await page.evaluate(() => RemoteSecure.available()), false);
    assert.match(await page.evaluate(() => RemoteSecure.fetch('sessions').catch(e => e.message)), /Pair this browser first/);
    await page.evaluate(code => RemoteSecure.pair(code), fullCode);
    assert.equal(await page.evaluate(() => RemoteSecure.available()), true);
    assert.deepEqual(await page.evaluate(async () => (await RemoteSecure.fetch('sessions?private=secret')).json()), {ok:true,private:'secret reply'});
    assert.equal(seen.at(-1).url, '/api/sessions?private=secret');
    assert.equal(seen.at(-1).method, 'GET');
    await page.evaluate(async()=>{await (await RemoteSecure.fetch('threads/private/settings',{method:'POST',headers:{'X-Codex-Owner-Epoch':'private-epoch','Content-Type':'application/json'},body:JSON.stringify({effort:'high'})})).text();});
    assert.equal(seen.at(-1).header['X-Codex-Owner-Epoch'][0],'private-epoch');
    assert.equal(JSON.parse(Buffer.from(seen.at(-1).body,'base64')).effort,'high');
    await page.evaluate(async () => {
      const form = new FormData();form.append('file',new File(['attachment secret'],'private.txt',{type:'text/plain'}));
      await (await RemoteSecure.fetch('attachments',{method:'POST',body:form})).text();
    });
    assert.match(seen.at(-1).header['Content-Type'][0], /^multipart\/form-data; boundary=/);
    assert.match(Buffer.from(seen.at(-1).body,'base64').toString(), /attachment secret/);
    assert.deepEqual(await page.evaluate(async () => Array.from(new Uint8Array(await (await RemoteSecure.fetch('project-file?path=private.png&raw=1')).arrayBuffer()))), [0,255,11,25]);
    const event = await page.evaluate(() => new Promise((resolve,reject) => {const events=RemoteSecure.events('sessions/one/events');events.addEventListener('live',event=>{events.close();resolve(JSON.parse(event.data));});events.onerror=reject;}));
    assert.deepEqual(event,{private:'event reply'});
    for (mode of ['tamper','reorder','truncate','append']) {
      const before=calls;
      const failure = await page.evaluate(async () => {try{await (await RemoteSecure.fetch('threads/private/turn',{method:'POST',body:JSON.stringify({text:'private mutation'})})).text();return '';}catch(e){return e.message;}});
      assert.match(failure,/could not be verified|Failed to fetch/,mode+' accepted');assert.equal(calls,before+1,'mutation retried after '+mode);
    }
    mode='tamper';
    const eventCalls=calls;
    assert.equal(await page.evaluate(()=>new Promise(resolve=>{const source=RemoteSecure.events('sessions/private/events');source.onerror=()=>resolve(source.readyState);})),2,'invalid encrypted event stream was not terminal');
    await page.clock.install();await page.clock.fastForward(20000);assert.equal(calls,eventCalls+1,'crypto failure retried the event stream');
    mode='plaintext';assert.deepEqual(await page.evaluate(async()=>{const response=await RemoteSecure.fetch('sessions');return [response.status,await response.text()];}),[400,''],'relay plaintext error entered the application');
    mode='';await page.reload();assert.equal(await page.evaluate(()=>RemoteSecure.available()),true);
    await page.evaluate(()=>RemoteSecure.clear());assert.equal(await page.evaluate(()=>RemoteSecure.available()),false);
  });
}

