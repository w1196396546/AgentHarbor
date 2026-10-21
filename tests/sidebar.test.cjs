const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {test} = require('node:test');
const {chromium, webkit} = require('playwright');
const {encryptedFixture, pairCode} = require('./e2ee-fixture.cjs');
const assets = path.resolve(__dirname, '../internal/relay/assets');
const engines = process.env.BROWSER ? [process.env.BROWSER] : ['chromium', 'webkit'];

async function fixture(t, engine, locale = 'en-US', catalog, clock = false) {
  const browser = await ({chromium, webkit}[engine]).launch();
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1440, height: 850}, locale});
  if (clock) await page.clock.install();
  await encryptedFixture(page, {paired:true});
  const errors = [], unknown = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/device') return route.fulfill({json: {id: 'sidebar-computer', name: 'My Mac', online: true}});
    if (pathname === '/api/agents') return route.fulfill({json: {agents: [{id: 'codex', name: 'Codex'}], default_agent: 'codex'}});
    if (pathname === '/api/sessions') return route.fulfill({json: typeof catalog === 'function' ? catalog(new URL(route.request().url())) : catalog || {projects: ['/work/sidebar'], sessions: Array.from({length: 60}, (_, i) => ({id: 'chat-' + i, title: 'Review project changes and continue planning · ' + i, cwd: '/work/sidebar'}))}});
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
    const overflow = await page.locator('#sidebar').evaluate(sidebar => { const edge = sidebar.getBoundingClientRect(); return [...sidebar.querySelectorAll('.sidebar-footer button, .sidebar-footer a')].filter(control => { const bounds = control.getBoundingClientRect(); if (!bounds.width || !bounds.height) return false; const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); return bounds.left < edge.left || bounds.right > edge.right || !control.contains(target); }).map(control => control.id || control.className); });
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
  test(engine + ': recent sessions refresh online and on return without losing loaded pages or drafts', async t => {
    const session = id => ({id, title:id, cwd:'/other', last:'2026-10-20T08:00:00Z'});
    let rows = ['yesterday', 'older', 'oldest'].map(session);
    const offsets = [];
    const {page, clean} = await fixture(t, engine, 'en-US', url => {
      const offset = Number(url.searchParams.get('offset'));
      offsets.push(offset);
      const next = Math.min(offset + 2, rows.length);
      return {projects:['/work/shop'], sidebar_projects:[{id:'shop',name:'Shop',root_paths:['/work/shop']}], sessions:rows.slice(offset,next), next, has_more:next < rows.length};
    }, true);
    const ids = () => page.locator('.project-group[data-path="recent"] [data-id]').evaluateAll(nodes => nodes.map(node => node.dataset.id));
    await page.locator('#more').click();
    await page.locator('[data-id="oldest"]').waitFor();
    await page.locator('#message').evaluate(node => { node.value = 'Keep this draft'; });
    await page.locator('.project-collection > summary').click();
    rows = [{...session('today'),last:'2026-10-21T08:00:00Z'}, ...rows];
    await page.clock.fastForward(11000);
    await page.locator('[data-id="today"]').waitFor();
    assert.equal(await page.locator('#message').inputValue(), 'Keep this draft');
    assert.deepEqual(await ids(), ['today','yesterday','older','oldest']);
    assert.equal(await page.locator('.project-collection').getAttribute('open'), null);
    await page.locator('#search').fill('today');
    rows = [{...session('returned'),last:'2026-10-21T09:00:00Z'}, ...rows];
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.getElementById('sessionCount').textContent === '4');
    await page.locator('#search').fill('');
    await page.locator('[data-id="returned"]').waitFor();
    assert.deepEqual(await ids(), ['returned','today','yesterday','older']);
    await page.locator('#more').click();
    await page.locator('[data-id="oldest"]').waitFor();
    assert.deepEqual(await ids(), ['returned','today','yesterday','older','oldest']);
    assert.deepEqual(offsets, [0,2,0,2,0,2,4]);
    await clean();
  });

  test(engine + ': right panel resizes by drag and keyboard and remembers width', async t => {
    const {page, clean} = await fixture(t, engine);
    const open = async () => page.evaluate(() => {
      document.getElementById('changesPanel').hidden = false;
      document.getElementById('workspace').classList.add('has-changes');
    });
    const panel = page.locator('#changesPanel');
    const handle = page.getByRole('separator', {name:'Resize right panel'});
    const panelWidth = async expected => {
      await page.waitForFunction(expected => Math.abs(document.getElementById('changesPanel').getBoundingClientRect().width - expected) < 1, expected);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    };
    const dragRight = async (delta, cancel = false) => {
      const bounds = await handle.boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 + delta, bounds.y + 100, {steps:8});
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
    };
    await open(); await panelWidth(280);
    await dragRight(-160); await panelWidth(440);
    await width(page, 244);
    await handle.press('ArrowLeft'); await panelWidth(450);
    await handle.press('ArrowRight'); await panelWidth(440);
    await dragRight(-80, true); await panelWidth(440);
    await page.locator('#closeChanges').click();
    assert.equal(await panel.isVisible(), false);
    await open(); await panelWidth(440);
    await page.reload(); await page.locator('#workspace:visible').waitFor();
    await open(); await panelWidth(440);
    await handle.press('Home'); await panelWidth(280);
    await handle.press('End');
    await panelWidth(Number(await handle.getAttribute('aria-valuemax')));
    await page.setViewportSize({width:1000,height:850});
    await panelWidth(710);
    assert.equal(await page.locator('#sidebar').evaluate(node => Math.round(node.getBoundingClientRect().width)),244);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await handle.isVisible(), false);
    assert(await panel.evaluate(node => node.getBoundingClientRect().width <= innerWidth - 20));
    await clean();
  });

  test(engine + ': project collection and individual project folds stay independent', async t => {
    const catalog = {
      projects: ['/work/shop', '/work/docs'],
      sidebar_projects: [
        {id:'shop', name:'Shop', root_paths:['/work/shop']},
        {id:'docs', name:'Docs', root_paths:['/work/docs']},
      ],
      pinned_ids: ['pin'],
      sessions: [
        {id:'pin', title:'Pinned conversation', cwd:'/work/shop', project_id:'shop'},
        {id:'shop-chat', title:'Shop conversation', cwd:'/work/shop', project_id:'shop'},
        {id:'docs-chat', title:'Docs conversation', cwd:'/work/docs', project_id:'docs'},
        {id:'recent-chat', title:'Recent conversation', cwd:'/other'},
      ],
    };
    const {page, clean} = await fixture(t, engine, 'en-US', catalog);
    const projects = page.locator('.project-collection');
    const shop = page.locator('.project-group[data-path="project:shop"]');
    const docs = page.locator('.project-group[data-path="project:docs"]');
    await shop.locator(':scope > summary').click();
    assert.equal(await shop.getAttribute('open'), null);
    assert(await page.locator('[data-id="docs-chat"]').isVisible());
    await projects.locator(':scope > summary').click();
    await page.waitForFunction(() => document.querySelector('.project-collection').open === false);
    assert.equal(await page.locator('[data-id="docs-chat"]').isVisible(), false);
    assert(await page.locator('[data-id="pin"]').isVisible());
    assert(await page.locator('[data-id="recent-chat"]').isVisible());
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.querySelector('.project-collection')?.open === false);
    await projects.locator(':scope > summary').click();
    assert.equal(await shop.getAttribute('open'), null);
    assert.notEqual(await docs.getAttribute('open'), null);
    await docs.locator(':scope > summary').click();
    assert.equal(await docs.getAttribute('open'), null);
    await shop.locator(':scope > summary').click();
    assert(await page.locator('[data-id="shop-chat"]').isVisible());
    assert.equal(await page.locator('[data-id="docs-chat"]').isVisible(), false);
    await clean();
  });

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
