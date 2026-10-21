const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {test} = require('node:test');
const {chromium, webkit} = require('playwright');
const {encryptedFixture, pairCode} = require('./e2ee-fixture.cjs');
const assets = path.resolve(__dirname, '../internal/relay/assets');
const engines = process.env.BROWSER ? [process.env.BROWSER] : ['chromium', 'webkit'];

async function asset(route) {
  const url = new URL(route.request().url()), name = url.pathname === '/' ? 'index.html' : url.pathname === '/admin/' ? 'admin.html' : path.basename(url.pathname);
  try { await route.fulfill({body:await fs.readFile(path.join(assets,name)),contentType:{'.html':'text/html','.css':'text/css','.js':'text/javascript'}[path.extname(name)]}); }
  catch { await route.fulfill({status:404}); }
}

for (const engine of engines) {
  test(`${engine}: client authorization code, remembered offline browser, recovery and revocation`, async t => {
    const browser = await ({chromium,webkit}[engine]).launch();t.after(() => browser.close());
    const page = await browser.newPage({viewport:{width:1280,height:800},locale:'zh-CN'});
    await encryptedFixture(page);
    let authorized=false,online=false,pairs=0,logouts=0,rejectPair=true;
    page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      assert(!url.search.includes('auth-code'),'code leaked into query string');
      if(!url.pathname.startsWith('/api/'))return asset(route);
      assert.equal(req.headers()['x-codex-remote'],'1');
      if(url.pathname==='/api/pair'){if(rejectPair){rejectPair=false;return route.fulfill({status:401,json:{error:'Invalid authorization code'}});}assert.equal(req.postDataJSON().key,pairCode);authorized=true;pairs++;return route.fulfill({json:{paired:true}});}
      if(!authorized)return route.fulfill({status:401,json:{error:'Pair this browser first'}});
      if(url.pathname==='/api/logout'){authorized=false;logouts++;return route.fulfill({status:204});}
      if(url.pathname==='/api/device')return route.fulfill({json:{id:'device-id',name:'我的 Mac',online}});
      if(url.pathname==='/api/agents')return route.fulfill({json:{agents:[{id:'codex',name:'Codex'}],default_agent:'codex'}});
      if(!online)return route.fulfill({status:503,json:{error:'Client offline'}});
      if(url.pathname==='/api/sessions')return route.fulfill({json:{sessions:[{id:'old-chat',title:'Private previous history',cwd:'/work/demo',last:'2026-10-17T02:00:00Z'}],projects:['/work/demo'],next:0,has_more:false}});
      if(url.pathname==='/api/options')return route.fulfill({json:{models:[],modes:[],permissions:[],defaults:{},capabilities:{}}});
      return route.fulfill({status:404});
    });
    await page.goto('https://relay.test/');await page.locator('#pair:visible').waitFor();
    assert.match(await page.locator('#pair').innerText(),/agentTools/);
    assert.equal(await page.locator('#notice').innerText(),'');
    await page.locator('#pair .theme-toggle').click();
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),false);
    if(process.env.ARTIFACT_DIR){await fs.mkdir(process.env.ARTIFACT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ARTIFACT_DIR,`react-pair-${engine}.png`)});}
    await page.locator('#pairKey').fill(pairCode);await page.locator('#pairForm button').click();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('过期'));
    await page.locator('#pairKey').fill(pairCode);await page.locator('#pairForm button').click();
    await page.locator('#deviceOffline:visible').waitFor();assert.equal(await page.locator('#pairKey').inputValue(),'');
    assert.equal(await page.locator('#deviceName').innerText(),'我的 Mac');
    await page.locator('#workspace .theme-toggle').click();
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),true,'workspace toggle must follow the pairing theme');
    await page.reload();await page.locator('#deviceOffline:visible').waitFor();assert.equal(pairs,1,'offline reload lost browser authorization');
    online=true;await page.locator('#retryDevice').click();await page.locator('#deviceOffline').waitFor({state:'hidden'});
    await page.locator('#workspace .device-switcher-trigger').click();await page.locator('[data-slot=dropdown-menu-item]').filter({hasText:'已授权电脑'}).click();await page.locator('#deviceDialog[open]').waitFor();assert.match(await page.locator('#deviceDialog').innerText(),/agentTools/);await page.locator('#closeDeviceDialog').click();
    online=false;await page.locator('#refresh').click();await page.locator('#deviceOffline:visible').waitFor();
    assert.equal(await page.locator('#workspace').isVisible(),true);assert.equal(pairs,1);
    assert.match(await page.locator('#sessions').innerText(),/Private previous history/);
    authorized=false;await page.locator('#retryDevice').click();await page.locator('#pair:visible').waitFor();
    assert(!/Private previous history/.test(await page.locator('#sessions').innerText()),'revoked browser kept previous device history');
    await page.goto('https://relay.test/#key=' + pairCode);await page.locator('#deviceOffline:visible').waitFor();
    assert.equal(new URL(page.url()).hash,'');
    await page.locator('#logout').click();await page.locator('#pair:visible').waitFor();assert.equal(logouts,1);
    assert.deepEqual(errors,[]);
  });

  test(`${engine}: relay admin uses separate credentials and only device metadata`, async t => {
    const browser=await ({chromium,webkit}[engine]).launch();t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:390,height:844},locale:'zh-CN'});
    let admin=false,revoked=false;
    page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const state=()=>({config:{public_url:'https://relay.test',listen_address:'127.0.0.1:8080',data_dir:'/srv/relay',registration_enabled:true},status:{online:revoked?0:1,registered:1},credential_path:'/srv/relay/admin-token',devices:[{id:'device-id',name:'<img src=x onerror=alert(1)>',online:!revoked,revoked,last_seen:'2026-10-17T02:00:00Z'}]});
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(!url.pathname.startsWith('/api/'))return asset(route);
      assert(url.pathname.startsWith('/api/admin/'),'admin requested client API');
      assert.equal(req.headers()['x-codex-admin'],'1');
      if(url.pathname.endsWith('/login')){assert.equal(req.postDataJSON().token,'private-admin-token');admin=true;return route.fulfill({json:{authenticated:true}});}
      if(!admin)return route.fulfill({status:401,body:'Admin sign-in required'});
      if(url.pathname.endsWith('/revoke-device')){assert.deepEqual(req.postDataJSON(),{id:'device-id'});revoked=true;return route.fulfill({json:state()});}
      if(url.pathname.endsWith('/logout')){admin=false;return route.fulfill({status:204});}
      if(url.pathname.endsWith('/state'))return route.fulfill({json:state()});
      return route.fulfill({status:404});
    });
    await page.goto('https://relay.test/admin/');await page.locator('#login:visible').waitFor();
    await page.locator('#login .theme-toggle').click();
    await page.locator('#token').fill('private-admin-token');await page.locator('#loginForm button').click();await page.locator('#dashboard:visible').waitFor();
    assert.equal(await page.locator('#token').inputValue(),'');assert.equal(await page.locator('#deviceList img').count(),0);
    await page.locator('#dashboard .theme-toggle').click();
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),true,'dashboard toggle must follow the login theme');
    assert.match(await page.locator('#deviceList').innerText(),/<img/);
    assert(!/Codex 数据目录|共享项目目录|API Key/.test(await page.locator('#configuration').innerText()));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'admin mobile overflow');
    await page.getByRole('button',{name:'撤销设备',exact:true}).click();await page.locator('#revokeDialog[open]').waitFor();
    await page.locator('#confirmRevoke').click();await page.locator('#revokeDialog').waitFor({state:'hidden'});
    assert.match(await page.locator('#deviceList').innerText(),/已撤销/);assert.equal(await page.locator('.relay-device button').isDisabled(),true);
    await page.locator('#logout').click();await page.locator('#login:visible').waitFor();
    assert.deepEqual(errors,[]);
  });
}
