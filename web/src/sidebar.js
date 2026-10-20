export function startSidebar() {
  'use strict';
  const workspace = document.getElementById('workspace');
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebarResize');
  const toggle = document.getElementById('desktopSidebarToggle');
  const storageKey = 'codex.remote.sidebar';
  const minimum = 220, defaultWidth = 244;
  let width = defaultWidth, collapsed = false, drag = null;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Number.isFinite(saved?.width)) width = Math.min(480, Math.max(minimum, saved.width));
    collapsed = saved?.collapsed === true;
  } catch { /* Browser preferences can be unavailable. */ }
  const desktop = () => innerWidth > 760;
  const maximum = () => Math.max(minimum, Math.min(480, innerWidth - (workspace.classList.contains('has-changes') && innerWidth > 1180 ? 790 : 480)));
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({width, collapsed})); } catch { /* Resizing still works without storage. */ }
  }
  function render() {
    const effectiveWidth = Math.min(width, maximum());
    workspace.style.setProperty('--sidebar-width', `${effectiveWidth}px`);
    workspace.classList.toggle('sidebar-collapsed', collapsed);
    sidebar.inert = desktop() && collapsed;
    handle.setAttribute('aria-valuemax', String(maximum()));
    handle.setAttribute('aria-valuenow', String(effectiveWidth));
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.dataset.label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    const label = window.REMOTE_I18N[document.documentElement.lang]?.[toggle.dataset.label] || toggle.dataset.label;
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }
  function finish(cancelled = false) {
    if (!drag) return;
    const pointerID = drag.id;
    if (cancelled) width = drag.width;
    drag = null;
    if (handle.hasPointerCapture(pointerID)) handle.releasePointerCapture(pointerID);
    document.body.classList.remove('sidebar-resizing');
    render();
    if (!cancelled) save();
  }
  toggle.addEventListener('click', () => { collapsed = !collapsed; render(); save(); });
  document.addEventListener('keydown', (event) => {
    if (desktop() && collapsed && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      collapsed = false; render(); save();
    }
  }, true);
  handle.addEventListener('pointerdown', (event) => {
    if (!desktop() || event.button !== 0) return;
    event.preventDefault();
    drag = {id: event.pointerId, x: event.clientX, width, start: sidebar.getBoundingClientRect().width};
    handle.setPointerCapture(event.pointerId);
    handle.focus({preventScroll: true});
    document.body.classList.add('sidebar-resizing');
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    width = Math.round(Math.min(maximum(), Math.max(minimum, drag.start + event.clientX - drag.x)));
    render();
  });
  handle.addEventListener('pointerup', () => finish());
  handle.addEventListener('pointercancel', () => finish(true));
  handle.addEventListener('lostpointercapture', () => finish());
  handle.addEventListener('keydown', (event) => {
    if (!desktop()) return;
    if (event.key === 'Escape' && drag) { event.preventDefault(); finish(true); return; }
    const step = event.shiftKey ? 40 : 10;
    const current = Math.min(width, maximum());
    const next = {ArrowLeft: current - step, ArrowRight: current + step, Home: minimum, End: maximum()}[event.key];
    if (next === undefined) return;
    event.preventDefault();
    width = Math.min(maximum(), Math.max(minimum, next));
    render(); save();
  });
  window.addEventListener('resize', () => { finish(true); render(); });
  new MutationObserver(render).observe(workspace, {attributes: true, attributeFilter: ['class']});
  new MutationObserver(render).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
  render();
}
