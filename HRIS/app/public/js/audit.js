(async () => {
  const shellData = await Shell.init('audit');
  const isAdmin = shellData.user.role === 'HR administrator' || shellData.user.role === 'System administrator';
  if (!isAdmin) {
    document.querySelector('.page').innerHTML = `<div class="page-head"><div><h1>Audit trail</h1></div></div><div class="card empty-state">Audit trail is restricted to HR administrators and System administrators. Your role is "${shellData.user.role}".</div>`;
    return;
  }

  let page = 1;
  let pageCount = 1;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function currentFilters() {
    const f = {
      dateFrom: document.getElementById('af-from').value,
      dateTo: document.getElementById('af-to').value,
      actor: document.getElementById('af-actor').value,
      action: document.getElementById('af-action').value,
      entityType: document.getElementById('af-entity').value,
      entityId: document.getElementById('af-entity-id').value.trim(),
      consumer: document.getElementById('af-consumer').value,
      q: document.getElementById('af-q').value.trim(),
    };
    Object.keys(f).forEach((k) => { if (!f[k]) delete f[k]; });
    return f;
  }

  async function loadFacets() {
    const { data } = await Api.get('/audit/facets');
    const actorSel = document.getElementById('af-actor');
    data.actors.forEach((a) => actorSel.insertAdjacentHTML('beforeend', `<option value="${esc(a.value)}">${esc(a.label)}</option>`));
    const actionSel = document.getElementById('af-action');
    data.actions.forEach((a) => actionSel.insertAdjacentHTML('beforeend', `<option value="${esc(a)}">${esc(a)}</option>`));
    const entitySel = document.getElementById('af-entity');
    data.entityTypes.forEach((e) => entitySel.insertAdjacentHTML('beforeend', `<option value="${esc(e)}">${esc(e)}</option>`));
    const consumerSel = document.getElementById('af-consumer');
    data.consumers.forEach((c) => consumerSel.insertAdjacentHTML('beforeend', `<option value="${esc(c)}">${esc(c)}</option>`));
  }

  function actionBadgeClass(action) {
    if (/delete/.test(action)) return 'badge-danger';
    if (/create|login(?!_)/.test(action)) return 'badge-success';
    if (/fail|denied/.test(action)) return 'badge-warning';
    return 'badge-info';
  }

  async function loadList() {
    const tbody = document.getElementById('audit-tbody');
    tbody.innerHTML = `<tr><td colspan="8"><span class="spinner"></span> Loading…</td></tr>`;
    const params = new URLSearchParams({ ...currentFilters(), page, pageSize: 50 });
    const { data, meta } = await Api.get(`/audit?${params.toString()}`);
    pageCount = meta.pageCount;
    document.getElementById('audit-count').textContent = `${meta.total} event${meta.total === 1 ? '' : 's'}`;
    document.getElementById('audit-page').textContent = `Page ${meta.page} of ${meta.pageCount}`;
    document.getElementById('audit-prev').disabled = meta.page <= 1;
    document.getElementById('audit-next').disabled = meta.page >= meta.pageCount;

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="faint">No events match these filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((r) => `
      <tr class="clickable" data-id="${r.id}">
        <td>${new Date(r.at).toLocaleString()}</td>
        <td>${esc(r.actor_name)}${r.actor_employee_no ? ` <span class="faint">(${esc(r.actor_employee_no)})</span>` : ''}</td>
        <td><span class="badge ${actionBadgeClass(r.action)}">${esc(r.action)}</span></td>
        <td>${esc(r.entity_type)}</td>
        <td>${esc(r.entity_id)}</td>
        <td class="faint">${esc(r.ip)}</td>
        <td class="faint">${esc(r.consumer)}</td>
        <td><button class="btn btn-ghost btn-sm audit-view" data-id="${r.id}">View</button></td>
      </tr>`).join('');

    tbody.querySelectorAll('.audit-view').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); openDetail(btn.dataset.id); }));
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.id)));
  }

  function diffLines(before, after) {
    const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    if (!keys.length) return ['No field-level detail recorded for this event.'];
    return keys.map((k) => {
      const b = before ? before[k] : undefined;
      const a = after ? after[k] : undefined;
      if (before && after) {
        if (JSON.stringify(b) === JSON.stringify(a)) return null;
        return `${k}: ${b == null ? '—' : b} → ${a == null ? '—' : a}`;
      }
      if (after && !before) return `${k}: ${a == null ? '—' : a}`;
      if (before && !after) return `${k}: ${b == null ? '—' : b} (removed)`;
      return null;
    }).filter(Boolean);
  }

  async function openDetail(id) {
    const { data } = await Api.get(`/audit/${id}`);
    Drawer.open({
      title: data.action,
      sub: `${data.entity_type} · ${data.entity_id}`,
      tags: [data.consumer, data.ip].filter(Boolean),
      groups: [
        { label: 'Event', fields: [
          { label: 'Timestamp', value: new Date(data.at).toLocaleString() },
          { label: 'Actor', value: `${data.actor_name}${data.actor_employee_no ? ` (${data.actor_employee_no})` : ''}` },
          { label: 'Action', value: data.action },
          { label: 'Entity type', value: data.entity_type },
          { label: 'Entity ID', value: data.entity_id },
          { label: 'IP address', value: data.ip || '—' },
          { label: 'Consumer', value: data.consumer },
        ] },
        { label: data.before && data.after ? 'Changed fields' : (data.after ? 'Recorded values' : 'Removed values'), lines: diffLines(data.before, data.after) },
      ],
    });
  }

  document.getElementById('audit-prev').addEventListener('click', () => { if (page > 1) { page -= 1; loadList(); } });
  document.getElementById('audit-next').addEventListener('click', () => { if (page < pageCount) { page += 1; loadList(); } });
  document.getElementById('af-apply').addEventListener('click', () => { page = 1; loadList(); });
  document.getElementById('af-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { page = 1; loadList(); } });
  document.getElementById('af-clear').addEventListener('click', () => {
    document.querySelectorAll('#audit-filters input, #audit-filters select').forEach((el) => { el.value = ''; });
    page = 1; loadList();
  });

  ['csv', 'xlsx', 'pdf'].forEach((format) => {
    document.getElementById(`af-export-${format}`).addEventListener('click', async (e) => {
      await Api.withLoading(e.currentTarget, 'Exporting…', async () => {
        await Api.download('/audit/export', { filters: currentFilters(), format }, `audit-trail.${format}`);
        Api.toast('Export downloaded', 'success');
      });
    });
  });

  await loadFacets();
  await loadList();
})();
