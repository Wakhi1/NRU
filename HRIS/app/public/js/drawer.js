// Generic right-anchored detail drawer, matching the prototype's "endDrawer on desktop" pattern:
// a reference/detail panel (org unit, partner, programme, person, shift, feed…) as opposed to
// the centered .modal dialogs used for data-capture forms. One shared renderer, data-driven.
//
// Drawer.open({
//   title, sub,                 // header
//   tags: ['Active', '46 staff'],
//   note: 'free text',
//   groups: [{ label: 'Details', fields: [{label,value}], chips: [...], lines: [...] }],
//   people: [{ name, meta, onOpen: () => {...} }],   // "who's here" list, e.g. unit members
// })
const Drawer = (() => {
  let scrimEl = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function close() {
    if (scrimEl) { scrimEl.remove(); scrimEl = null; }
  }

  function renderGroup(g) {
    const fields = (g.fields || []).map((f) => `
      <div><div class="drawer-field-label">${esc(f.label)}</div><div class="drawer-field-value">${esc(f.value ?? '—')}</div></div>
    `).join('');
    const chips = (g.chips || []).map((c) => `<span class="badge badge-success">${esc(c)}</span>`).join('');
    const lines = (g.lines || []).map((l) => `<div class="drawer-line">${esc(l)}</div>`).join('');
    return `
      <div class="drawer-group">
        <div class="drawer-group-label">${esc(g.label)}</div>
        ${fields ? `<div class="drawer-fields">${fields}</div>` : ''}
        ${chips ? `<div class="drawer-chips">${chips}</div>` : ''}
        ${lines}
      </div>
    `;
  }

  function initials(name) {
    return String(name || '').split(' ').filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
  }

  function open(opts) {
    close();
    scrimEl = document.createElement('div');
    scrimEl.className = 'drawer-scrim';
    scrimEl.innerHTML = `
      <div class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-head">
          <div style="flex:1;min-width:0">
            <div class="drawer-title">${esc(opts.title)}</div>
            ${opts.sub ? `<div class="drawer-sub">${esc(opts.sub)}</div>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm drawer-close" data-drawer-close>Close</button>
        </div>
        ${opts.tags && opts.tags.length ? `<div class="drawer-tags">${opts.tags.map((t) => `<span class="badge badge-neutral">${esc(t)}</span>`).join('')}</div>` : ''}
        ${opts.note ? `<div class="drawer-note">${esc(opts.note)}</div>` : ''}
        ${(opts.groups || []).map(renderGroup).join('')}
        ${opts.people && opts.people.length ? `
          <div class="drawer-group">
            <div class="drawer-people-label">People — open the record</div>
            <div id="drawer-people-list"></div>
          </div>` : ''}
      </div>
    `;
    document.body.appendChild(scrimEl);

    scrimEl.addEventListener('click', (e) => { if (e.target === scrimEl) close(); });
    scrimEl.querySelector('[data-drawer-close]').addEventListener('click', close);
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    if (opts.people && opts.people.length) {
      const list = scrimEl.querySelector('#drawer-people-list');
      opts.people.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'drawer-person-row';
        row.innerHTML = `
          <div class="drawer-person-avatar"></div>
          <div style="flex:1;min-width:0">
            <div class="drawer-person-name">${esc(p.name)}</div>
            ${p.meta ? `<div class="drawer-person-meta">${esc(p.meta)}</div>` : ''}
          </div>
          <span class="drawer-person-open">Open →</span>
        `;
        if (p.onOpen) row.addEventListener('click', p.onOpen);
        list.appendChild(row);
      });
    }
  }

  return { open, close };
})();
