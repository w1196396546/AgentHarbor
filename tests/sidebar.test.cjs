const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {test} = require('node:test');
const {chromium, webkit} = require('playwright');
const {encryptedFixture, pairCode} = require('./e2ee-fixture.cjs');
const assets = path.resolve(__dirname, '../internal/relay/assets');
const engines = process.env.BROWSER ? [process.env.BROWSER] : ['chromium', 'webkit'];

async function fixture(t, engine, locale = 'en-US') {
  const browser = await ({chromium, webkit}[engine]).launch();
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1440, height: 850}, locale});
  await encryptedFixture(page, {paired:true});
  const errors = [], unknown = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/device') return route.fulfill({json: {id: 'sidebar-computer', name: 'My Mac', online: true}});
    if (pathname === '/api/agents') return route.fulfill({json: {agents: [{id: 'codex', name: 'Codex'}], default_agent: 'codex'}});
    if (pathname === '/api/sessions') return route.fulfill({json: {projects: ['/work/sidebar'], sessions: Array.from({length: 60}, (_, i) => ({id: 'chat-' + i, title: 'Review project changes and continue planning · ' + i, cwd: '/work/sidebar'}))}});
    if (pathname === '/api/options') return route.fulfill({json: {models: [], modes: [], permissions: [], defaults: {}, capabilities: {}}});
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (name === 'favicon.ico') return route.fulfill({status: 204});
    if (pathname.startsWith('/api/')) { unknown.push(pathname); return route.fulfill({status: 404}); }
    try {
      return route.fulfill({body: await fs.readFile(path.join(assets, name)), contentType: {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript'}[path.extname(name)], headers: {'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:"}});
    } catch { unknown.push(pathname); return route.fulfill({status: 404}); }
  });
  await page.goto('https://sidebar.test/');
  await page.locator('#workspace:visible').waitFor();
  await page.locator('#sessions button').first().waitFor();
  return {page, async clean() { assert.deepEqual(errors, []); assert.deepEqual(unknown, []); }};
}

async function width(page, expected) {
  await page.waitForFunction(value => Math.abs(document.getElementById('sidebar').getBoundingClientRect().width - value) < 1, expected);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sidebar made the page overflow horizontally');
  if (expected > 0) {
    const overflow = await page.locator('#sidebar').evaluate(sidebar => { const edge = sidebar.getBoundingClientRect(); return [...sidebar.querySelectorAll('.sidebar-footer button, .sidebar-footer a')].filter(control => { const bounds = control.getBoundingClientRect(), target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); return bounds.left < edge.left || bounds.right > edge.right || !control.contains(target); }).map(control => control.id || control.className); });
    assert.deepEqual(overflow, [], 'footer actions leave the sidebar or cannot be clicked at ' + expected + 'px');
  }
}

async function drag(page, delta) {
  const bounds = await page.locator('#sidebarResize').boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 130);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + delta, bounds.y + 130, {steps: 8});
  await page.mouse.up();
}

for (const engine of engines) {
  test(`${engine}: sidebar drag and keyboard widths persist, respect bounds and keep history scrollable`, async t => {
    const f = await fixture(t, engine), {page} = f;
    await width(page, 244);
    await drag(page, 176); await width(page, 420);
    await page.reload(); await page.locator('#workspace:visible').waitFor(); await width(page, 420);
    const handle = page.getByRole('separator', {name: 'Resize sidebar'});
    await handle.focus(); await page.keyboard.press('ArrowLeft'); await width(page, 410);
    await page.keyboard.press('Shift+ArrowRight'); await width(page, 450);
    await page.keyboard.press('Home'); await width(page, 220);
    await page.keyboard.press('End'); await width(page, 480);
    await drag(page, 600); await width(page, 480);
    await drag(page, -900); await width(page, 220);
    assert.equal(await handle.getAttribute('aria-valuenow'), '220');
    assert.equal(await handle.getAttribute('aria-valuemin'), '220');
    const bounds = await handle.boundingBox();
    await page.mouse.move(bounds.x + 4, bounds.y + 140); await page.mouse.down();
    await page.mouse.move(bounds.x + 130, bounds.y + 140); await width(page, 346);
    await page.keyboard.press('Escape'); await page.mouse.up(); await width(page, 220);
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('sidebar-resizing')), false);
    const nav = page.locator('#navigation');
    await nav.evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert(await nav.evaluate(element => element.scrollTop > 0 && element.scrollHeight > element.clientHeight));
    const footer = await page.locator('.sidebar-footer').boundingBox();
    assert(footer.y + footer.height <= 850);
    if (process.env.ARTIFACT_DIR) {
      await fs.mkdir(process.env.ARTIFACT_DIR, {recursive: true});
      await handle.press('End');
      await page.screenshot({path: path.join(process.env.ARTIFACT_DIR, `${engine}-sidebar-wide.png`)});
    }
    await f.clean();
  });

  test(`${engine}: desktop sidebar collapses, remembers state and keyboard search restores it`, async t => {
    const f = await fixture(t, engine), {page} = f;
    await drag(page, 96); await width(page, 340);
    await page.getByRole('button', {name: 'Collapse sidebar'}).click(); await width(page, 0);
    assert.equal(await page.locator('#sidebar').evaluate(element => element.inert), true);
    assert.equal(await page.locator('#desktopSidebarToggle').getAttribute('aria-expanded'), 'false');
    const canvasInset = await page.locator('#workspace').evaluate(element => element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).paddingLeft));
    assert.equal((await page.locator('.main-shell').boundingBox()).x, canvasInset, 'collapsed sidebar must leave no empty column or gap');
    await page.reload(); await page.locator('#workspace:visible').waitFor(); await width(page, 0);
    await page.getByRole('button', {name: 'Expand sidebar'}).click(); await width(page, 340);
    await page.getByRole('button', {name: 'Collapse sidebar'}).click();
    await page.keyboard.press('Control+k'); await width(page, 340);
    assert.equal(await page.locator('#search').evaluate(input => document.activeElement === input), true);
    await f.clean();
  });

  test(`${engine}: desktop limits adapt without losing preference and mobile navigation stays independent`, async t => {
    const f = await fixture(t, engine, 'zh-CN'), {page} = f;
    await page.getByRole('separator', {name: '调整侧边栏宽度'}).press('End'); await width(page, 480);
    await page.setViewportSize({width: 900, height: 850}); await width(page, 420);
    await page.setViewportSize({width: 761, height: 850}); await width(page, 281);
    await page.setViewportSize({width: 1440, height: 850}); await width(page, 480);
    await page.setViewportSize({width: 1181, height: 850});
    await page.locator('#workspace').evaluate(workspace => workspace.classList.add('has-changes'));
    await width(page, 391);
    await page.locator('#workspace').evaluate(workspace => workspace.classList.remove('has-changes'));
    await width(page, 480);
    await page.setViewportSize({width: 1440, height: 850});
    await page.getByRole('button', {name: '收起侧边栏'}).click(); await width(page, 0);
    await page.setViewportSize({width: 390, height: 760});
    assert(await page.locator('#desktopSidebarToggle').isHidden());
    assert(await page.locator('#sidebarResize').isHidden());
    assert.equal(await page.locator('#sidebar').evaluate(element => element.inert), false);
    await page.locator('#sidebarToggle').click();
    await page.waitForFunction(() => Math.abs(document.getElementById('sidebar').getBoundingClientRect().left) < 1);
    await width(page, 280);
    assert.equal(await page.locator('#sidebarToggle').getAttribute('aria-expanded'), 'true');
    await page.locator('#navBackdrop').click({position: {x: 380, y: 300}});
    await page.waitForFunction(() => document.getElementById('sidebar').getBoundingClientRect().right < 1);
    await page.setViewportSize({width: 1440, height: 850}); await width(page, 0);
    await page.getByRole('button', {name: '展开侧边栏'}).click(); await width(page, 480);
    await f.clean();
  });
}
