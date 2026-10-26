export function startSidebar() {
  'use strict';
  const workspace = document.getElementById('workspace');
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebarResize');
  const toggle = document.getElementById('desktopSidebarToggle');
  const inspectorHandle = document.getElementById('changesResize');
  const inspectorKey = 'codex.remote.inspector';
  let inspectorWidth = null;
  try {
    const saved = JSON.parse(localStorage.getItem(inspectorKey));
    if (Number.isFinite(saved?.width)) inspectorWidth = Math.min(720, Math.max(280, saved.width));
  } catch { /* Resizing still works without storage. */ }
  const storageKey = 'codex.remote.sidebar';
  const minimum = 220, defaultWidth = 270;
  let width = defaultWidth, collapsed = false, drag = null;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Number.isFinite(saved?.width)) width = Math.min(480, Math.max(minimum, saved.width));
    collapsed = saved?.collapsed === true;
  } catch { /* Browser preferences can be unavailable. */ }
  const desktop = () => innerWidth > 760;
  const inspectorMaximum = () => Math.max(280, Math.min(720, innerWidth > 1180 ? innerWidth - (collapsed ? 0 : minimum) - 510 : innerWidth - 40));
  const inspectorSize = () => Math.min(inspectorWidth ?? (innerWidth > 1180 ? 400 : 340), inspectorMaximum());
  const maximum = () => Math.max(minimum, Math.min(480, innerWidth - (workspace.classList.contains('has-changes') && innerWidth > 1180 ? inspectorSize() + 510 : 480)));
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({width, collapsed})); } catch { /* Resizing still works without storage. */ }
  }
  function render() {
    const effectiveWidth = Math.min(width, maximum());
    workspace.style.setProperty('--inspector-width', inspectorSize() + 'px');
    inspectorHandle.setAttribute('aria-valuemax', String(inspectorMaximum()));
    inspectorHandle.setAttribute('aria-valuenow', String(inspectorSize()));
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
    const pointerID = drag.id, target = drag.target;
    if (cancelled) {
      if (target === inspectorHandle) inspectorWidth = drag.width;
      else width = drag.width;
    }
    drag = null;
    if (target.hasPointerCapture(pointerID)) target.releasePointerCapture(pointerID);
    document.body.classList.remove('sidebar-resizing', 'inspector-resizing');
    render();
    if (!cancelled) {
      if (target === inspectorHandle) {
        try { localStorage.setItem(inspectorKey, JSON.stringify({width: inspectorWidth})); } catch {}
      } else save();
    }
  }
  toggle.addEventListener('click', () => { collapsed = !collapsed; render(); save(); });
  document.addEventListener('keydown', (event) => {
    if (desktop() && collapsed && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      collapsed = false; render(); save();
    }
  }, true);
  for (const target of [handle, inspectorHandle]) {
    const right = target === inspectorHandle;
    target.addEventListener('pointerdown', (event) => {
      if (!desktop() || event.button !== 0) return;
      event.preventDefault();
      drag = {target, id: event.pointerId, x: event.clientX, width: right ? inspectorWidth : width, start: right ? inspectorSize() : sidebar.getBoundingClientRect().width};
      target.setPointerCapture(event.pointerId);
      target.focus({preventScroll: true});
      document.body.classList.add('sidebar-resizing');
      if (right) document.body.classList.add('inspector-resizing');
    });
    target.addEventListener('pointermove', (event) => {
      if (!drag || drag.target !== target || event.pointerId !== drag.id) return;
      const next = drag.start + (event.clientX - drag.x) * (right ? -1 : 1);
      if (right) inspectorWidth = Math.round(Math.min(inspectorMaximum(), Math.max(280, next)));
      else width = Math.round(Math.min(maximum(), Math.max(minimum, next)));
      render();
    });
    target.addEventListener('pointerup', () => finish());
    target.addEventListener('pointercancel', () => finish(true));
    target.addEventListener('lostpointercapture', () => finish());
    target.addEventListener('keydown', (event) => {
      if (!desktop()) return;
      if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(true); return; }
      const step = (event.shiftKey ? 40 : 10) * (right ? -1 : 1);
      const current = right ? inspectorSize() : Math.min(width, maximum());
      const min = right ? 280 : minimum, max = right ? inspectorMaximum() : maximum();
      const next = {ArrowLeft: current - step, ArrowRight: current + step, Home: min, End: max}[event.key];
      if (next === undefined) return;
      event.preventDefault();
      if (right) {
        inspectorWidth = Math.min(max, Math.max(min, next));
        try { localStorage.setItem(inspectorKey, JSON.stringify({width: inspectorWidth})); } catch {}
      } else { width = Math.min(max, Math.max(min, next)); save(); }
      render();
    });
  }
  window.addEventListener('resize', () => { finish(true); render(); });
  new MutationObserver(render).observe(workspace, {attributes: true, attributeFilter: ['class']});
  new MutationObserver(render).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
  render();
}
