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
    if (pathname === '/api/device') return route.fulfill({json: {id: '11'.repeat(16), name: 'Test computer', online: true}});
    if (pathname === '/api/agents') return route.fulfill({json: {agents: [{id: 'codex', name: 'Codex', state: 'connected'}], default_agent: 'codex'}});
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
  test(`${engine}: compact phone sidebar leaves room for conversations`, async t => {
    const {page, clean} = await fixture(t, engine, 'zh-CN');
    await page.locator('#sidebarToggle').click();
    await page.locator('#workspace .theme-toggle').click();
    assert.equal(await page.locator('#project, #projects').count(), 0);
    for (const [width, height] of [[320, 400], [390, 720], [430, 780]]) {
      await page.setViewportSize({width, height});
      const layout = await page.locator('#sidebar').evaluate(sidebar => {
        const nav = sidebar.querySelector('#navigation'), footer = sidebar.querySelector('.sidebar-footer').getBoundingClientRect();
        const controls = [...sidebar.querySelectorAll('.sidebar-footer button, .sidebar-footer a, #new')].filter(node => node.getClientRects().length).map(node => {
          const r = node.getBoundingClientRect();
          return {left:r.left, right:r.right, top:r.top, bottom:r.bottom};
        });
        return {navigation:nav.clientHeight, footerHeight:footer.height, controls};
      });
      assert(layout.navigation >= (height < 600 ? 100 : 350), 'conversation list keeps useful height: ' + JSON.stringify(layout));
      assert(layout.footerHeight <= 100, 'device/account footer stays compact');
      assert(layout.controls.every(r => r.left >= 0 && r.right <= width && r.top >= 0 && r.bottom <= height), 'sidebar controls remain reachable');
      t.diagnostic(`${width}x${height}: navigation ${layout.navigation}px, footer ${layout.footerHeight}px`);
      if (process.env.ARTIFACT_DIR) {
        await fs.mkdir(process.env.ARTIFACT_DIR, {recursive:true});
        await page.screenshot({path:path.join(process.env.ARTIFACT_DIR, `sidebar-${engine}-${width}x${height}.png`), animations:'disabled'});
      }
    }
    assert.equal(await page.locator('#new').getAttribute('aria-label'), '新建会话');
    await page.locator('#search').fill('Older conversation 30');
    await page.locator('#sessions').getByText('Older conversation 30', {exact:true}).first().waitFor();
    await clean();
  });
  test(`${engine}: short phone viewport keeps navigation and long drafts reachable`, async t => {
    const {page, clean} = await fixture(t, engine, 'de-DE');
    await page.locator('#sidebarToggle').click();
    await page.locator('#sessions [data-id="mobile-chat"]').first().click();
    await page.locator('#title').filter({hasText: 'A long conversation'}).waitFor();
    for (const width of [320, 390, 760]) {
      await page.setViewportSize({width, height: 844});
      await page.locator('#message').fill('Short draft');
      const controls = await page.evaluate(() => {
        const bounds = id => {const r = document.getElementById(id).getBoundingClientRect(); return {top: r.top, left: r.left, right: r.right, width: r.width, height: r.height};};
        return Object.fromEntries(['attach', 'permission', 'mode', 'model', 'send'].map(id => [id, bounds(id)]));
      });
      assert(Object.values(controls).every(r => Math.abs(r.top - controls.send.top) <= 1), 'mobile controls share one row: ' + JSON.stringify(controls));
      assert(await page.locator('#effort').isHidden(), 'reasoning uses the combined model picker on mobile');
      const composerHeight = await page.locator('#composer').evaluate(node => node.getBoundingClientRect().height);
      assert(composerHeight < 110, 'short draft composer stays compact at ' + width + 'px: ' + composerHeight);
      for (const id of ['permission', 'mode']) assert((await page.locator('#' + id).getAttribute('aria-label'))?.length, id + ' keeps its accessible label');
      for (const [id, r] of Object.entries(controls)) assert(r.left >= 0 && r.right <= width + 1 && r.width >= 24 && r.height >= 24, id + ' needs an in-bounds compact target: ' + JSON.stringify(controls));
      for (const id of ['sidebarToggle', 'sessionInfo', 'filesToggle']) {
        const r = await page.locator('#' + id).boundingBox();
        assert(r.x >= 0 && r.x + r.width <= width + 1 && r.width >= 24 && r.height >= 24, id + ' keeps an in-bounds compact target: ' + JSON.stringify(r));
      }
      assert.equal((await page.locator('.conversation-heading').boundingBox()).height, 62, 'phone heading keeps its original compact height');
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

  test(`${engine}: readable semantic colors and keyboard menus survive theme and viewport changes`, async t => {
    const {page, clean} = await fixture(t, engine, 'en-US');
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('#sidebarToggle').click();
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').evaluate(node => node.classList.contains('dark')) !== (theme === 'dark')) await page.locator('#workspace .theme-toggle').click();
      const ratios = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const probe = document.createElement('span');
        document.body.append(probe);
        const color = name => {
          probe.style.color = root.getPropertyValue(name).trim();
          return getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
        };
        const luminance = rgb => rgb.map(v => {v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;}).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const contrast = (a, b) => {const x = luminance(color(a)), y = luminance(color(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);};
        const pairs = ['--foreground', '--muted-foreground', '--primary', '--success', '--destructive', '--status-interrupted'].flatMap(text => ['--background', '--card', '--sidebar', '--secondary'].map(background => [text, background]));
        pairs.push(['--primary-foreground', '--primary'], ['--destructive-foreground', '--destructive']);
        const result = pairs.map(([a, b]) => ({text: a, background: b, ratio: contrast(a, b)}));
        probe.remove();
        return result;
      });
      for (const pair of ratios) assert(pair.ratio >= 4.5, theme + ' text contrast: ' + JSON.stringify(pair));
    }
    const trigger = page.locator('#workspace .device-switcher-trigger');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const item = page.locator('[data-slot="dropdown-menu-item"]:visible').first();
    await item.waitFor();
    const bounds = await item.boundingBox();
    assert(bounds.height >= 44, 'device menu needs touch-sized rows');
    await page.keyboard.press('Escape');
    await page.waitForFunction(id => document.activeElement?.id === id, await trigger.getAttribute('id'));
    assert(await trigger.evaluate(node => node === document.activeElement), 'closing the menu restores keyboard focus');
    const focus = await trigger.evaluate(node => {const s = getComputedStyle(node); return {width: parseFloat(s.outlineWidth), style: s.outlineStyle};});
    assert(focus.width >= 2 && focus.style !== 'none', 'keyboard focus has a visible outline');
    await page.emulateMedia({reducedMotion: 'reduce'});
    assert(await page.locator('#sidebar').evaluate(node => parseFloat(getComputedStyle(node).transitionDuration) <= .00001), 'reduced motion removes the drawer transition');
    await clean();
  });
}
