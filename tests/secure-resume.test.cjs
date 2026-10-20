const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium, webkit} = require('playwright');
const {encryptedFixture} = require('./e2ee-fixture.cjs');
const engines = process.env.BROWSER ? [process.env.BROWSER] : ['chromium', 'webkit'];

for (const engine of engines) {
  test(engine + ': encrypted event reconnect retains cursor and close stops retries', async t => {
    const browser = await ({chromium, webkit}[engine]).launch(); t.after(() => browser.close());
    const page = await browser.newPage(); page.setDefaultTimeout(10000);
    await encryptedFixture(page, {paired:true});
    const seen = [];
    let outerRequests = 0;
    page.on('request', request => {
      if (new URL(request.url()).pathname !== '/api/secure') return;
      outerRequests++;
      assert.equal(request.headers()['x-remote-agent'], undefined, 'agent header leaked outside encryption');
      assert(!request.postData().includes('X-Remote-Agent'), 'agent header leaked into the plaintext envelope');
    });
    await page.route('https://resume.test/api/**', async route => {
      const request = route.request(); seen.push(request.headers()['last-event-id'] || '');
      assert.equal(request.headers()['x-remote-agent'], 'codex', 'agent header lost on event reconnect');
      assert.equal(request.headers().accept, 'text/event-stream');
      const number = seen.length;
      await route.fulfill({contentType:'text/event-stream',body:`id: cursor.${number}\nevent: live\ndata: {"number":${number}}\n\n`});
    });
    await page.route('https://resume.test/', route => route.fulfill({body:'<!doctype html><title>Resume fixture</title>',contentType:'text/html'}));
    await page.goto('https://resume.test/');
    await page.addScriptTag({content:await fs.readFile(path.resolve(__dirname,'../web/src/transport/secure.js'),'utf8')});
    const result = await page.evaluate(() => new Promise((resolve,reject) => {
      const source=RemoteSecure.events('sessions/one/events', {headers:{'X-Remote-Agent':'codex', Accept:'application/json', 'Last-Event-ID':'obsolete'}}), events=[];
      source.addEventListener('live',event=>{events.push([JSON.parse(event.data).number,event.lastEventId]);if(events.length===2){source.close();resolve(events);}});
      source.onerror=error=>{if(source.readyState===2)reject(error);};
    }));
    assert.deepEqual(result,[[1,'cursor.1'],[2,'cursor.2']]);
    assert.deepEqual(seen,['','cursor.1']);
    await page.clock.install(); await page.clock.fastForward(20000);
    assert.equal(seen.length,2,'closed source reconnected');
    await page.evaluate(() => {window.stopped=RemoteSecure.events('sessions/one/events', {headers:{'X-Remote-Agent':'codex'}});window.stopped.onerror=()=>window.stopped.close();});
    await page.waitForFunction(() => window.stopped.readyState===2);
    const count=seen.length;await page.clock.fastForward(20000);assert.equal(seen.length,count,'close during retry left pending reconnect');
    assert.equal(outerRequests, seen.length, 'not all encrypted event requests were inspected');
  });

  test(engine + ': event transport and server failures reconnect', async t => {
    const browser = await ({chromium, webkit}[engine]).launch(); t.after(() => browser.close());
    const page = await browser.newPage(); page.setDefaultTimeout(10000);
    await encryptedFixture(page, {paired:true});
    let calls = 0;
    await page.route('https://resume.test/api/**', async route => {
      calls++;
      if (calls === 1) return route.fulfill({status:503, body:'offline'});
      if (calls === 2) return route.abort('connectionreset');
      await route.fulfill({contentType:'text/event-stream', body:'id: recovered.1\nevent: live\ndata: recovered\n\n'});
    });
    await page.route('https://resume.test/', route => route.fulfill({body:'<!doctype html>', contentType:'text/html'}));
    await page.goto('https://resume.test/');
    await page.addScriptTag({content:await fs.readFile(path.resolve(__dirname,'../web/src/transport/secure.js'),'utf8')});
    const result = await page.evaluate(() => new Promise((resolve, reject) => {
      const source = RemoteSecure.events('sessions/one/events');
      let errors = 0;
      source.onerror = error => {errors++; if (source.readyState === 2) reject(error);};
      source.addEventListener('live', event => {source.close(); resolve({data:event.data, cursor:event.lastEventId, errors});});
    }));
    assert.deepEqual(result, {data:'recovered', cursor:'recovered.1', errors:2});
    assert.equal(calls, 3);
  });

  test(engine + ': event authorization rejection is terminal', async t => {
    const browser = await ({chromium, webkit}[engine]).launch(); t.after(() => browser.close());
    const page=await browser.newPage();await encryptedFixture(page,{paired:true});let calls=0;
    await page.route('https://resume.test/api/**',async route=>{calls++;await route.fulfill({status:401,body:'denied'});});
    await page.route('https://resume.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));
    await page.goto('https://resume.test/');await page.addScriptTag({content:await fs.readFile(path.resolve(__dirname,'../web/src/transport/secure.js'),'utf8')});
    assert.equal(await page.evaluate(()=>new Promise(resolve=>{const source=RemoteSecure.events('sessions/one/events');source.onerror=()=>resolve(source.readyState);})),2);
    await page.clock.install();await page.clock.fastForward(20000);assert.equal(calls,1,'authorization failure was retried');
  });
}
