const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {test} = require('node:test');
const {chromium, webkit} = require('playwright');
const {encryptedFixture} = require('./e2ee-fixture.cjs');
const assets = process.env.REMOTE_ASSET_DIR || path.resolve(__dirname, '../internal/relay/assets');
const engines = process.env.BROWSER ? [process.env.BROWSER] : ['chromium', 'webkit'];

async function fixture(t, engine, locale) {
  const browser = await ({chromium, webkit}[engine]).launch();
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 320, height: 400}, locale});
  await encryptedFixture(page, {paired: true});
  const errors = [], unknown = [];
  page.on('pageerror', error => errors.push(error.message));
  const session = {id: 'mobile-chat', title: 'A long conversation title that must leave its controls accessible', cwd: '/work/mobile'};
  await page.route('**/*', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/device') return route.fulfill({json: {id: 'layout-computer', name: 'Test computer', online: true}});
    if (pathname === '/api/agents') return route.fulfill({json: {agents: [{id: 'codex', name: 'Codex'}], default_agent: 'codex'}});
    if (pathname === '/api/sessions') return route.fulfill({json: {projects: ['/work/mobile'], sessions: [session, ...Array.from({length: 40}, (_, i) => ({...session, id: 'older-' + i, title: 'Older conversation ' + i}))]}});
    if (pathname === '/api/options') return route.fulfill({json: {
      models: [{id: 'main', model: 'main', displayName: 'Configured coding model', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{reasoningEffort: 'medium'}]}],
      modes: [{name: 'Default', mode: 'default'}],
      permissions: [{id: 'workspace-write', name: 'Ask for approval', available: true}],
      defaults: {model: 'main', effort: 'medium', mode: 'default', permission: 'workspace-write'},
      capabilities: {background_creation: true, attachments: true, approval_modes: true},
    }});
    if (pathname === '/api/sessions/mobile-chat') return route.fulfill({json: {session, history: {parts: []}, history_items: [], live: {status: 'idle', items: [], requests: []}}});
    if (pathname.endsWith('/connect')) return route.fulfill({json: {connected: true}});
    if (pathname === '/api/files') return route.fulfill({json: {files: []}});
    if (pathname.endsWith('/changes')) return route.fulfill({json: {changes: []}});
    if (pathname.endsWith('/plan')) return route.fulfill({json: {plan: null}});
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (name === 'favicon.ico') return route.fulfill({status: 204});
    if (pathname.startsWith('/api/')) { unknown.push(pathname); return route.fulfill({status: 404}); }
    return route.fulfill({body: await fs.readFile(path.join(assets, name)), contentType: {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml'}[path.extname(name)]});
  });
  await page.goto('https://mobile-layout.test/');
  await page.locator('#workspace:visible').waitFor();
  return {page, async clean() { assert.deepEqual(errors, []); assert.deepEqual(unknown, []); }};
}

for (const engine of engines) {
  test(`${engine}: short phone viewport keeps navigation and long drafts reachable`, async t => {
    const {page, clean} = await fixture(t, engine, 'de-DE');
    await page.locator('#sidebarToggle').click();
    await page.locator('#sessions [data-id="mobile-chat"]').first().click();
    await page.locator('#title').filter({hasText: 'A long conversation'}).waitFor();
    for (const width of [320, 390, 760]) {
      await page.setViewportSize({width, height: 844});
      await page.locator('#message').fill('Short draft');
      const controls = await page.evaluate(() => {
        const bounds = id => {const r = document.getElementById(id).getBoundingClientRect(); return {top: r.top, left: r.left, right: r.right, width: r.width};};
        return Object.fromEntries(['attach', 'permission', 'mode', 'model', 'send'].map(id => [id, bounds(id)]));
      });
      assert(Object.values(controls).every(r => Math.abs(r.top - controls.send.top) <= 1), 'mobile controls share one row: ' + JSON.stringify(controls));
      assert(await page.locator('#effort').isHidden(), 'reasoning uses the combined model picker on mobile');
      const composerHeight = await page.locator('#composer').evaluate(node => node.getBoundingClientRect().height);
      assert(composerHeight < 110, 'short draft composer stays compact at ' + width + 'px: ' + composerHeight);
      for (const id of ['permission', 'mode']) assert((await page.locator('#' + id).getAttribute('aria-label'))?.length, id + ' keeps its accessible label');
      for (const [id, r] of Object.entries(controls)) assert(r.left >= 0 && r.right <= width + 1 && r.width >= 24, id + ' leaves the phone viewport: ' + JSON.stringify(controls));
    }
    await page.locator('#model').click();
    await page.locator('#reasoningCard:visible').waitFor();
    assert.equal(await page.locator('#reasoningModelName').textContent(), 'Configured coding model');
    await page.locator('#closeReasoning').click();
    await page.setViewportSize({width: 320, height: 400});
    await page.locator('#message').fill(Array(45).fill('Draft text').join('\n'));
    const layout = await page.evaluate(() => {
      const bounds = selector => { const node = document.querySelector(selector), r = node.getBoundingClientRect(); return {top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height}; };
      return {height: innerHeight, pageHeight: document.documentElement.scrollHeight, composer: bounds('#composer'), conversation: bounds('#conversationScroll'), send: bounds('#send')};
    });
    assert(layout.composer.top >= 0 && layout.composer.bottom <= layout.height + 1, 'long draft leaves the phone viewport: ' + JSON.stringify(layout));
    assert(layout.conversation.height >= 60, 'long draft consumes the entire conversation: ' + JSON.stringify(layout));
    assert(layout.send.bottom <= layout.height + 1, 'send button is unreachable: ' + JSON.stringify(layout));
    assert(layout.pageHeight <= layout.height + 1, 'composer creates document scrolling: ' + JSON.stringify(layout));
    await page.locator('#sidebarToggle').click();
    await page.locator('#navigation').evaluate(node => node.scrollTop = node.scrollHeight);
    await page.locator('#sidebar').evaluate(node => node.scrollTop = node.scrollHeight);
    const sidebar = await page.locator('#sidebar').evaluate(node => {
      const bounds = node.getBoundingClientRect(), footer = node.querySelector('.sidebar-footer').getBoundingClientRect();
      return {top: bounds.top, bottom: bounds.bottom, footerTop: footer.top, footerBottom: footer.bottom, height: innerHeight};
    });
    assert(sidebar.footerTop >= 0 && sidebar.footerBottom <= sidebar.height + 1, 'short phone sidebar footer is unreachable: ' + JSON.stringify(sidebar));
    await clean();
  });
}
