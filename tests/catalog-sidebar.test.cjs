const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {test} = require('node:test');
const {chromium, webkit} = require('playwright');
const {encryptedFixture} = require('./e2ee-fixture.cjs');
const assets = path.resolve(__dirname, '../internal/relay/assets');
const engines = process.env.BROWSER ? [process.env.BROWSER] : ['chromium', 'webkit'];
for (const engine of engines) for (const locale of ['en-US','zh-CN']) {
 test(engine+' '+locale+': recent includes project and pinned sessions in update order', async t => {
  const browser = await ({chromium,webkit}[engine]).launch();
  t.after(()=>browser.close());
  const page = await browser.newPage({viewport:{width:1280,height:900},locale});
  await encryptedFixture(page,{paired:true});
  const errors=[],unknown=[];
  const catalog={
   projects:['/work/project','/work/empty','/work/recent','/home/user','.codex','/worktrees/project'],
   sidebar_projects:[{id:'project',name:'Named App Project',root_paths:['/work/project']},{id:'empty',name:'Empty App Project',root_paths:['/work/empty']}],
   creation_projects:[{id:'project',name:'Named App Project',root_paths:['/work/project','/worktrees/project']},{id:'empty',name:'Empty App Project',root_paths:['/work/empty']}],
   pinned_ids:['pinned'],
   sessions:[{id:'pinned',title:'Pinned thread',cwd:'/work/project',project_id:'project',pinned:true,last:'2026-10-20T08:00:00Z'},{id:'project-thread',title:'Project thread',cwd:'/work/project',project_id:'project',last:'2026-10-22T08:00:00Z'},{id:'recent',title:'Recent thread',cwd:'/work/recent',last:'2026-10-21T08:00:00Z'}],
   next:3,has_more:false
  };
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==='/api/device')return route.fulfill({json:{id:'catalog-computer',name:'Office Mac',online:true}});
   if(pathname==='/api/agents')return route.fulfill({json:{agents:[{id:'codex',name:'Codex'}],default_agent:'codex'}});
   if(pathname==='/api/sessions')return route.fulfill({json:catalog});
   if(pathname==='/api/threads/recent/changes')return route.fulfill({json:{changes:[]}});
   if(pathname==='/api/threads/recent/plan')return route.fulfill({json:{plan:null}});
   if(pathname==='/api/sessions/recent')return route.fulfill({json:{session:{id:'recent',title:'Recent thread',cwd:'/work/recent',source:'remote'},history_items:[],live:{status:'idle',items:[]}}});
   if(pathname==='/api/options')return route.fulfill({json:{models:[],modes:[],permissions:[],defaults:{},capabilities:{}}});
   if(pathname.startsWith('/api/')){unknown.push(pathname);return route.fulfill({status:404})}
   const name=pathname==='/'?'index.html':pathname.slice(1);
   if(name==='favicon.ico')return route.fulfill({status:204});
   try{return route.fulfill({body:await fs.readFile(path.join(assets,name)),contentType:{'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[path.extname(name)]})}
   catch{unknown.push(pathname);return route.fulfill({status:404})}
  });
  await page.goto('https://catalog.test/');
  await page.locator('[data-path="pinned"] [data-id=pinned]').waitFor();
  const pinned=locale==='zh-CN'?'置顶':'Pinned',recent=locale==='zh-CN'?'最新':'Latest';
  const summaries=()=>page.locator('#sessions .project-group:not(.project-collection) > summary').allTextContents();
  const recentRows=page.locator('[data-path="recent"] [data-id]');
  assert.deepEqual(await summaries(),[pinned,'Named App Project','Empty App Project',recent,locale==='zh-CN'?'当前':'Current']);
  assert.deepEqual(await recentRows.evaluateAll(nodes=>nodes.map(node=>node.dataset.id)),['project-thread','recent','pinned']);
  for(const [id,count] of [['pinned',2],['project-thread',2],['recent',1]])assert.equal(await page.locator('#sessions [data-id='+id+']').count(),count);
  assert.equal(await page.locator('[data-path="pinned"] [data-id=pinned]').count(),1);
  assert.equal(await page.locator('[data-path="project:project"] [data-id=project-thread]').count(),1);
  assert.equal(await page.locator('#sessionCount').textContent(),'3');
  assert.equal(await page.locator('#sessions .project-new-session').count(),2);
  const projectGroup=page.locator('[data-path="project:project"]');
  await projectGroup.locator('summary').click();
  const projectNew=projectGroup.locator('.project-new-session');
  assert.equal(await projectNew.getAttribute('aria-label'),(locale==='zh-CN'?'新建会话':'New session')+': Named App Project');
  await projectNew.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#breadcrumbProject').textContent==='Named App Project');
  assert.equal(await projectGroup.evaluate(node=>node.open),false,'new session keeps the project fold unchanged');
  await page.locator('#workspaceProject').click();
  assert.equal(await page.locator('#menu button').count(),3,'only the two App projects and projectless choice');
  assert.deepEqual(await page.locator('#menu .menu-copy > span').allTextContents(),['Named App Project','Empty App Project',locale==='zh-CN'?'不在项目中工作':'Work outside a project']);
  await page.keyboard.press('Escape');
  await page.locator('[data-path="project:empty"] .project-new-session').click();
  await page.waitForFunction(()=>document.querySelector('#breadcrumbProject').textContent==='Empty App Project');
  await page.locator('#search').fill('Recent thread');
  await page.waitForFunction(()=>document.querySelectorAll('#sessions [data-id]').length===1);
  assert.deepEqual(await summaries(),[recent]);
  await page.locator('#search').fill('Project thread');
  await page.waitForFunction(()=>document.querySelectorAll('#sessions [data-id]').length===2);
  assert.deepEqual(await summaries(),['Named App Project',recent]);
  await page.locator('#search').fill('');
  await page.waitForFunction(()=>document.querySelectorAll('#sessions [data-id]').length===5);
  await recentRows.filter({hasText:'Recent thread'}).click();
  const current=page.locator('[data-path="current"]');
  await current.locator('[data-id="recent"][aria-current="true"]').waitFor();
  assert.equal(await current.locator('summary').textContent(),locale==='zh-CN'?'当前':'Current');
  assert.equal(await recentRows.filter({hasText:'Recent thread'}).count(),0);
  assert.equal(await page.locator('#sessions [data-id="recent"]').count(),1,'a historical directory does not become an App project');
  assert.equal(await page.locator('#sessionCount').textContent(),'3');
  await page.locator('#search').fill('Pinned thread');
  await current.waitFor({state:'detached'});
  await page.locator('#search').fill('');
  await current.locator('[data-id="recent"]').waitFor();
  await page.locator('#new').click();
  await page.waitForFunction(label=>document.querySelector('#breadcrumbProject').textContent===label,locale==='zh-CN'?'选择项目':'Choose a project',{timeout:2000});
  await page.locator('#workspaceProject').click();
  assert.equal(await page.locator('#menu button').count(),3,'new drafts cannot keep a historical directory outside the current App catalog');
  await page.keyboard.press('Escape');
  await page.locator('[data-path="project:empty"] .project-new-session').click();
  await current.locator('.session-section-empty').waitFor();
  await recentRows.filter({hasText:'Recent thread'}).waitFor();
  await page.locator('#message').fill('Preserve this fictional draft');
  catalog.creation_projects = catalog.creation_projects.slice(0,1);
  await page.locator('#refresh').click();
  await page.waitForFunction(()=>document.querySelector('#breadcrumbProject').textContent==='Named App Project');
  assert.equal(await page.locator('[data-path="project:empty"]').count(),0,'removed App projects disappear after refresh');
  assert.equal(await page.locator('#message').inputValue(),'Preserve this fictional draft');
  Object.assign(catalog,{creation_projects:[],pinned_ids:[],sessions:[],next:0});
  await page.reload();
  const sections=page.locator('#sessions > .project-group');
  await page.locator('[data-path=all-projects] .session-section-empty').waitFor();
  assert.deepEqual(await sections.evaluateAll(nodes=>nodes.map(node=>node.dataset.path)),['pinned','all-projects','recent','current']);
  assert.equal(await page.locator('#sessions .session-section-empty').count(),4);
  assert.equal(await page.locator('#sessions [data-id]').count(),0);
  assert.equal(await page.locator('[data-path=current] .session-section-empty').textContent(),locale==='zh-CN'?'暂无进行中的会话。':'No active conversations.');
  await page.locator('#workspaceProject').click();
  assert.equal(await page.locator('#menu button').count(),1,'an empty current App catalog cannot revive stale sidebar or authorized roots');
  await page.keyboard.press('Escape');
  await page.locator('#search').fill('missing');
  await page.waitForFunction(()=>document.querySelectorAll('#sessions .project-group').length===0);
  assert.equal(await page.locator('#sessions').textContent(),locale==='zh-CN'?'没有匹配的会话。':'No matching conversations.');
  Object.assign(catalog,{projects:['/work/project'],sessions:[
   {id:'active',title:'Active thread',cwd:'/work/project',status:'running',last:'2026-10-22T08:00:00Z'},
   {id:'idle',title:'Idle thread',cwd:'/work/project',status:'idle',last:'2026-10-21T08:00:00Z'}
  ],next:2});
  delete catalog.sidebar_projects;
  delete catalog.creation_projects;
  await page.reload();
  await page.locator('[data-path=current] [data-id=active]').waitFor();
  assert.equal(await page.locator('[data-path=current] [data-id=idle]').count(),0);
  assert.equal(await page.locator('[data-path=current] [data-id=active]').getAttribute('aria-current'),'false');
  assert.deepEqual(await recentRows.evaluateAll(nodes=>nodes.map(node=>node.dataset.id)),['active','idle']);
  assert.equal(await page.locator('[data-path=all-projects] [data-id=active]').count(),0,'legacy bare paths cannot establish native App projects');
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);
 });
}
