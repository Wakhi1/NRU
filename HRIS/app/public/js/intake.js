(async () => {
  const shellData = await Shell.init('intake');
  const scope = shellData.scope.intake || {};
  const canCreate = !!scope.create;
  const canUpdate = !!scope.update;
  const canDelete = !!scope.delete;
  if (canCreate) document.getElementById('new-feed-btn').style.display = '';

  const STATUS_BADGE = { healthy: 'badge-success', degraded: 'badge-warning', failed: 'badge-danger' };
  const RECORD_BADGE = { staged: 'badge-warning', quarantined: 'badge-danger', published: 'badge-success' };
  let feedsCache = [];
  let peopleOptions = null;

  async function getPeopleOptions() {
    if (!peopleOptions) {
      try {
        const { data } = await Api.get('/people');
        peopleOptions = [{ value: '', label: '— Unassigned —' }, ...data.map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` }))];
      } catch (e) { peopleOptions = [{ value: '', label: '— Unassigned —' }]; }
    }
    return peopleOptions;
  }

  // Read-only reference panel — field mapping, schedule — matches the prototype's own
  // reference-drawer convention (no inputs). Editing is a separate FormDrawer opened from here.
  function openFeedDetail(f) {
    const fieldMap = f.field_map && typeof f.field_map === 'object' ? Object.entries(f.field_map) : [];
    Drawer.open({
      title: f.source_name,
      sub: `${f.transport} · ${f.cadence || 'no fixed cadence'}`,
      tags: [f.status, `${f.pending_count} pending`, f.last_run_at ? `Last run ${new Date(f.last_run_at).toLocaleDateString()}` : 'Never run'],
      note: 'Records are fetched on this cadence, validated against the field map, then staged for review before publishing into HRIS.',
      groups: [
        fieldMap.length ? { label: 'Field mapping', fields: fieldMap.map(([src, dest]) => ({ label: src, value: '→ ' + dest })) } : null,
        {
          label: 'Schedule',
          fields: [
            { label: 'Last sync', value: f.last_run_at ? new Date(f.last_run_at).toLocaleString() : '—' },
            { label: 'Cadence', value: f.cadence || '—' },
            { label: 'Owner', value: f.owner_name || '—' },
            { label: 'Transport', value: f.transport },
          ],
        },
      ].filter(Boolean),
    });
    if (canUpdate) {
      const head = document.querySelector('.drawer-head');
      if (head) {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-ghost btn-sm';
        editBtn.textContent = 'Edit mapping';
        editBtn.addEventListener('click', () => { Drawer.close(); openMappingDrawer(f); });
        head.insertBefore(editBtn, head.querySelector('.drawer-close'));
      }
    }
  }

  function openMappingDrawer(f) {
    const lines = f.field_map && typeof f.field_map === 'object' ? Object.entries(f.field_map).map(([k, v]) => `${k} => ${v}`).join('\n') : '';
    FormDrawer.open({
      title: `Field mapping — ${f.source_name}`,
      sub: 'One mapping per line, formatted as "source_field => destination_field".',
      sections: [{
        label: 'Mapping',
        fields: [{ key: 'mapping', label: 'Field map', type: 'textarea', value: lines, hint: 'tin => tax_number\nmonth => period' }],
      }],
      primaryLabel: 'Save mapping',
      onSave: async (v) => {
        const map = {};
        (v.mapping || '').split('\n').forEach((line) => {
          const m = line.split('=>');
          if (m.length === 2 && m[0].trim()) map[m[0].trim()] = m[1].trim();
        });
        await Api.put(`/intake/feeds/${f.id}`, { field_map: map });
        Api.toast('Field mapping saved', 'success');
        load();
      },
    });
  }

  async function load() {
    const { data } = await Api.get('/intake/feeds');
    feedsCache = data;
    const tbody = document.querySelector('#feed-table tbody');
    document.getElementById('feed-empty').style.display = data.length ? 'none' : 'block';
    tbody.innerHTML = data.map((f) => `
      <tr>
        <td><a href="#" class="feed-detail-link" data-id="${f.id}">${f.source_name}</a></td>
        <td>${f.transport}</td>
        <td>${f.cadence || '—'}</td>
        <td>${f.owner_name || '—'}</td>
        <td><span class="badge ${STATUS_BADGE[f.status] || 'badge-neutral'}">${f.status}</span></td>
        <td>${f.last_run_at ? new Date(f.last_run_at).toLocaleString() : '—'}</td>
        <td>${f.pending_count > 0 ? `<span class="badge badge-warning">${f.pending_count}</span>` : '0'}</td>
        <td><button class="btn btn-ghost btn-sm" data-review="${f.id}" data-source="${f.source_name}">Review records</button></td>
        <td class="row" style="gap:4px">
          ${canUpdate ? `<button class="btn btn-ghost btn-sm" data-sync="${f.id}">Sync now</button>` : ''}
          ${canUpdate ? `<button class="btn btn-ghost btn-sm" data-edit-feed="${f.id}">Edit</button>` : ''}
          ${canDelete ? `<button class="btn btn-ghost btn-sm" data-delete-feed="${f.id}">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.feed-detail-link').forEach((el) => el.addEventListener('click', (e) => {
      e.preventDefault();
      openFeedDetail(feedsCache.find((f) => String(f.id) === el.dataset.id));
    }));
    tbody.querySelectorAll('[data-review]').forEach((el) => el.addEventListener('click', () => openFeed(el.dataset.review, el.dataset.source)));
    tbody.querySelectorAll('[data-edit-feed]').forEach((el) => el.addEventListener('click', () => openFeedDrawer(feedsCache.find((f) => String(f.id) === el.dataset.editFeed))));
    tbody.querySelectorAll('[data-sync]').forEach((el) => el.addEventListener('click', async () => {
      await Api.withLoading(el, 'Syncing…', () => Api.post(`/intake/feeds/${el.dataset.sync}/sync`));
      Api.toast('Sync timestamp updated — no live source is connected, this only records a manual run', 'success');
      load();
    }));
    tbody.querySelectorAll('[data-delete-feed]').forEach((el) => el.addEventListener('click', async () => {
      const f = feedsCache.find((x) => String(x.id) === el.dataset.deleteFeed);
      if (!confirm(`Delete feed "${f.source_name}"? This also removes its staged/quarantined records.`)) return;
      await Api.withLoading(el, 'Deleting…', () => Api.del(`/intake/feeds/${f.id}`));
      Api.toast('Feed deleted', 'success');
      load();
    }));
  }

  async function openFeed(id, sourceName) {
    document.getElementById('records-modal-title').textContent = `Records — ${sourceName}`;
    const body = document.getElementById('records-modal-body');
    body.innerHTML = '<span class="spinner"></span>';
    document.getElementById('records-modal').style.display = 'flex';

    const { data } = await Api.get(`/intake/feeds/${id}/records`);
    body.innerHTML = data.map((r) => `
      <div class="card" style="padding:12px 14px;margin-bottom:10px">
        <div class="row between">
          <span class="badge ${RECORD_BADGE[r.status] || 'badge-neutral'}">${r.status}</span>
          <span class="faint">${new Date(r.created_at).toLocaleString()}</span>
        </div>
        <pre style="background:var(--color-surface-alt);border-radius:6px;padding:8px;margin:8px 0;font-size:11.5px;overflow-x:auto">${JSON.stringify(r.raw_payload, null, 2)}</pre>
        ${r.reason ? `<div class="faint">Reason: ${r.reason}</div>` : ''}
        ${canUpdate && r.status !== 'published' ? `
          <div class="row" style="margin-top:8px;gap:8px">
            <button class="btn btn-ghost btn-sm" data-resolve="${r.id}" data-status="published">Publish</button>
            <button class="btn btn-ghost btn-sm" data-resolve="${r.id}" data-status="quarantined">Quarantine</button>
          </div>` : ''}
      </div>
    `).join('') || '<div class="empty-state">No records for this feed.</div>';

    body.querySelectorAll('[data-resolve]').forEach((btn) => btn.addEventListener('click', async () => {
      let reason = null;
      if (btn.dataset.status === 'quarantined') reason = prompt('Reason for quarantine:') || 'Needs review';
      await Api.withLoading(btn, 'Saving…', () => Api.put(`/intake/records/${btn.dataset.resolve}/resolve`, { status: btn.dataset.status, reason }));
      Api.toast('Record updated', 'success');
      openFeed(id, sourceName);
      load();
    }));
  }

  document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', (e) => { e.target.closest('.modal-scrim').style.display = 'none'; }));

  async function openFeedDrawer(feed) {
    const people = await getPeopleOptions();
    FormDrawer.open({
      title: feed ? 'Edit feed' : 'New feed',
      sub: feed ? 'Update this connector\'s configuration.' : 'Registers an intake connector — records still land in the review queue before they publish.',
      sections: [{
        label: 'Connector',
        fields: [
          { key: 'source_name', label: 'Source name', type: 'text', value: feed ? feed.source_name : '', required: true },
          { key: 'transport', label: 'Transport', type: 'select', value: feed ? feed.transport : 'api_pull', options: [{ value: 'api_pull', label: 'API pull' }, { value: 'sftp', label: 'SFTP' }, { value: 'csv_upload', label: 'CSV upload' }, { value: 'webhook_push', label: 'Webhook push' }] },
          { key: 'cadence', label: 'Cadence', type: 'text', value: feed ? feed.cadence : '', hint: 'e.g. Monthly' },
          { key: 'owner_employee_no', label: 'Owner', type: 'select', value: feed ? (feed.owner_employee_no || '') : '', options: people },
          ...(feed ? [{ key: 'status', label: 'Status', type: 'select', value: feed.status, options: [{ value: 'healthy', label: 'Healthy' }, { value: 'degraded', label: 'Degraded' }, { value: 'failed', label: 'Failed' }] }] : []),
        ],
      }],
      primaryLabel: feed ? 'Save changes' : 'Create',
      onSave: async (v) => {
        if (feed) await Api.put(`/intake/feeds/${feed.id}`, v);
        else await Api.post('/intake/feeds', v);
        Api.toast(feed ? 'Feed updated' : 'Feed created', 'success');
        load();
      },
    });
  }

  document.getElementById('new-feed-btn').addEventListener('click', () => openFeedDrawer(null));

  load();
})();
