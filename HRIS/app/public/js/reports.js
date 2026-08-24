(async () => {
  await Shell.init('reports');

  const topTabsEl = document.getElementById('top-tabs');
  const topContentEl = document.getElementById('top-tab-content');

  // ==========================================================================================
  // Overview — the original at-a-glance bar charts (kept as-is, just nested under its own tab
  // now that Report builder/Saved reports exist alongside it).
  // ==========================================================================================
  function bars(title, rows) {
    if (!rows || !rows.length) return `<div class="card"><h3>${title}</h3><div class="faint">No data yet.</div></div>`;
    const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
    const items = rows.map((r) => `
      <div class="row between" style="margin-bottom:8px">
        <div style="width:140px;font-size:12.5px" class="muted">${r.label}</div>
        <div style="flex:1;background:var(--color-surface-alt);border-radius:6px;overflow:hidden;height:16px">
          <div style="width:${(Number(r.value) || 0) / max * 100}%;background:var(--color-primary);height:100%"></div>
        </div>
        <div style="width:70px;text-align:right;font-size:12.5px;font-weight:600">${r.value}</div>
      </div>`).join('');
    return `<div class="card"><h3>${title}</h3>${items}</div>`;
  }

  function kpis(rows) {
    if (!rows || !rows.length) return '';
    return `<div class="grid grid-4">${rows.map((k) => `
      <div class="card kpi"><div class="label">${k.label}</div><div class="value">${typeof k.value === 'number' && k.value > 999 ? k.value.toLocaleString() : k.value}</div></div>
    `).join('')}</div>`;
  }

  async function renderOverviewSubtab(key, el) {
    el.innerHTML = '<div class="card"><span class="spinner"></span> Loading…</div>';
    try {
      if (key === 'workforce') {
        const d = await Api.get('/reports/workforce');
        el.innerHTML = `<div class="grid grid-2">${bars('Headcount by department', d.byDepartment)}${bars('By contract type', d.byContractType)}</div>${bars('By gender', d.byGender)}`;
      } else if (key === 'absence') {
        const d = await Api.get('/reports/absence');
        el.innerHTML = `${bars('Leave requests by month', d.byMonth)}<div class="grid grid-2">${bars('By leave type', d.byType)}${bars('By status', d.byStatus)}</div>`;
      } else if (key === 'payroll') {
        const d = await Api.get('/reports/payroll');
        el.innerHTML = `${kpis(d.kpis)}<div style="margin-top:14px">${bars('Net pay by period', d.byPeriod.map((r) => ({ label: r.label, value: Math.round(Number(r.value)) })))}</div>`;
      } else if (key === 'recruitment') {
        const d = await Api.get('/reports/recruitment');
        el.innerHTML = `<div class="grid grid-2">${bars('Requisitions by status', d.byRequisitionStatus)}${bars('Applications by stage', d.byApplicationStage)}</div>`;
      }
    } catch (err) {
      el.innerHTML = `<div class="card faint">${err.message}</div>`;
    }
  }

  function renderOverview() {
    topContentEl.innerHTML = `
      <div class="tabs" id="ov-tabs">
        <div class="tab active" data-key="workforce">Workforce</div>
        <div class="tab" data-key="absence">Absence</div>
        <div class="tab" data-key="payroll">Payroll</div>
        <div class="tab" data-key="recruitment">Recruitment</div>
      </div>
      <div id="ov-content"></div>`;
    const ovTabs = document.getElementById('ov-tabs');
    const ovContent = document.getElementById('ov-content');
    ovTabs.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      ovTabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      renderOverviewSubtab(t.dataset.key, ovContent);
    }));
    renderOverviewSubtab('workforce', ovContent);
  }

  // ==========================================================================================
  // Report builder — pick one or more report types, set filters per report, preview (formal
  // letterhead layout in an iframe) or export straight to PDF/XLSX/CSV.
  // ==========================================================================================
  let definitions = null;
  let filterOptions = null;
  const selected = new Set();
  const filterState = {}; // { reportId: { filterKey: value } }

  async function ensureCatalog() {
    if (definitions) return;
    const [defsRes, optsRes] = await Promise.all([Api.get('/reports/definitions'), Api.get('/reports/filter-options')]);
    definitions = defsRes.data;
    filterOptions = optsRes.data;
  }

  function fieldOptions(f) {
    if (f.staticOptions) return f.staticOptions;
    return [{ value: '', label: 'All' }, ...((filterOptions[f.optionsKey]) || [])];
  }

  function renderFilterField(reportId, f) {
    const current = (filterState[reportId] && filterState[reportId][f.key]) || '';
    if (f.type === 'date') {
      return `<div class="form-row"><label>${f.label}</label><input type="date" data-report="${reportId}" data-key="${f.key}" value="${current}" /></div>`;
    }
    const opts = fieldOptions(f).map((o) => `<option value="${o.value}" ${String(o.value) === String(current) ? 'selected' : ''}>${o.label}</option>`).join('');
    return `<div class="form-row"><label>${f.label}</label><select data-report="${reportId}" data-key="${f.key}">${opts}</select></div>`;
  }

  function collectFilters() {
    document.querySelectorAll('#rb-blocks [data-report]').forEach((el) => {
      const rid = el.dataset.report, key = el.dataset.key;
      filterState[rid] = filterState[rid] || {};
      filterState[rid][key] = el.value;
    });
  }

  function renderBuilderBlocks() {
    const blocksEl = document.getElementById('rb-blocks');
    if (!blocksEl) return;
    const ids = [...selected];
    blocksEl.innerHTML = ids.length ? ids.map((id) => {
      const def = definitions.find((d) => d.id === id);
      return `<div class="rb-block">
        <h4>${def.label}</h4>
        <div class="rb-desc">${def.description}</div>
        <div class="form-grid">${def.filterFields.map((f) => renderFilterField(id, f)).join('')}</div>
      </div>`;
    }).join('') : '<div class="faint" style="margin-top:10px">Pick at least one report above to configure its filters.</div>';
  }

  async function renderBuilder() {
    topContentEl.innerHTML = '<div class="card"><span class="spinner"></span> Loading report catalogue…</div>';
    await ensureCatalog();
    topContentEl.innerHTML = `
      <div class="card">
        <h3>1. Choose report(s)</h3>
        <div class="modal-note" style="margin-bottom:10px">Pick one for a single report, or several to combine into one document with multiple sections.</div>
        <div class="report-picker" id="rb-picker">
          ${definitions.map((d) => `<label data-id="${d.id}"><input type="checkbox" value="${d.id}" ${selected.has(d.id) ? 'checked' : ''} /> ${d.label}</label>`).join('')}
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>2. Filters</h3>
        <div id="rb-blocks"></div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>3. Preview or export</h3>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" id="rb-preview">Preview</button>
          <button class="btn btn-ghost" id="rb-export-pdf">Export PDF</button>
          <button class="btn btn-ghost" id="rb-export-xlsx">Export XLSX</button>
          <button class="btn btn-ghost" id="rb-export-csv">Export CSV</button>
          <button class="btn btn-ghost" id="rb-save" style="margin-left:auto">Save this configuration</button>
        </div>
        <div class="field-hint" id="rb-hint" style="margin-top:8px"></div>
      </div>`;

    renderBuilderBlocks();
    updateHint();

    document.querySelectorAll('#rb-picker label').forEach((label) => {
      label.classList.toggle('checked', selected.has(label.dataset.id));
      label.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) selected.add(label.dataset.id); else selected.delete(label.dataset.id);
        label.classList.toggle('checked', e.target.checked);
        renderBuilderBlocks();
        updateHint();
      });
    });

    function updateHint() {
      const csvBtn = document.getElementById('rb-export-csv');
      const single = selected.size === 1;
      csvBtn.disabled = !single;
      document.getElementById('rb-hint').textContent = selected.size === 0
        ? 'No reports selected yet.'
        : single ? '' : `${selected.size} reports selected — will combine into one document. CSV export only supports a single report at a time.`;
    }

    document.getElementById('rb-preview').addEventListener('click', async (e) => {
      if (!selected.size) return Api.toast('Pick at least one report first', 'error');
      await Api.withLoading(e.currentTarget, 'Building…', async () => {
        collectFilters();
        const ids = [...selected];
        const res = ids.length === 1
          ? await Api.post(`/reports/${ids[0]}/preview`, { filters: filterState[ids[0]] || {} })
          : await Api.post('/reports/combined/preview', { reportIds: ids, filters: filterState });
        showPreviewModal(res.data.html, ids);
      });
    });

    ['pdf', 'xlsx', 'csv'].forEach((fmt) => {
      const btn = document.getElementById(`rb-export-${fmt}`);
      btn.addEventListener('click', async () => {
        if (!selected.size) return Api.toast('Pick at least one report first', 'error');
        await doExport([...selected], fmt, btn);
      });
    });

    document.getElementById('rb-save').addEventListener('click', () => {
      if (!selected.size) return Api.toast('Pick at least one report first', 'error');
      collectFilters();
      FormDrawer.open({
        title: 'Save this report configuration',
        sub: 'Re-run or export it later from Saved reports.',
        sections: [{ label: 'Details', fields: [{ key: 'name', label: 'Name', type: 'text', value: '', required: true, hint: 'e.g. "Monthly headcount — Finance"' }] }],
        primaryLabel: 'Save',
        onSave: async (v) => {
          await Api.post('/reports/saved', { name: v.name, reportIds: [...selected], filters: filterState });
          Api.toast('Report configuration saved', 'success');
        },
      });
    });
  }

  async function doExport(reportIds, format, btn) {
    collectFilters();
    const run = async () => {
      if (reportIds.length === 1) {
        await Api.download(`/reports/${reportIds[0]}/export`, { filters: filterState[reportIds[0]] || {}, format }, `report.${format}`);
      } else {
        await Api.download('/reports/combined/export', { reportIds, filters: filterState, format }, `combined-report.${format}`);
      }
      Api.toast('Export downloaded', 'success');
    };
    if (btn) await Api.withLoading(btn, 'Exporting…', run); else await run();
  }

  function showPreviewModal(html, reportIds) {
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.innerHTML = `
      <div class="modal modal-xl">
        <div class="modal-head">
          <div><strong>Report preview</strong><div class="modal-note">This is exactly what the PDF/XLSX export contains.</div></div>
          <button class="modal-close" id="pv-close">&times;</button>
        </div>
        <div class="modal-body"><iframe class="report-preview-frame" id="pv-frame"></iframe></div>
        <div class="modal-foot">
          <button class="btn btn-ghost" id="pv-pdf">Export PDF</button>
          <button class="btn btn-ghost" id="pv-xlsx">Export XLSX</button>
          ${reportIds.length === 1 ? '<button class="btn btn-ghost" id="pv-csv">Export CSV</button>' : ''}
          <button class="btn btn-primary" id="pv-close2">Close</button>
        </div>
      </div>`;
    document.body.appendChild(scrim);
    document.getElementById('pv-frame').srcdoc = html;
    const close = () => scrim.remove();
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
    document.getElementById('pv-close').addEventListener('click', close);
    document.getElementById('pv-close2').addEventListener('click', close);
    document.getElementById('pv-pdf').addEventListener('click', (e) => doExport(reportIds, 'pdf', e.currentTarget));
    document.getElementById('pv-xlsx').addEventListener('click', (e) => doExport(reportIds, 'xlsx', e.currentTarget));
    const csvBtn = document.getElementById('pv-csv');
    if (csvBtn) csvBtn.addEventListener('click', (e) => doExport(reportIds, 'csv', e.currentTarget));
  }

  // ==========================================================================================
  // Saved reports
  // ==========================================================================================
  async function renderSaved() {
    topContentEl.innerHTML = '<div class="card"><span class="spinner"></span> Loading…</div>';
    await ensureCatalog();
    const { data } = await Api.get('/reports/saved');
    topContentEl.innerHTML = `
      <div class="card">
        <h3>Saved reports</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Includes</th><th>Saved by</th><th>Saved</th><th></th></tr></thead>
            <tbody id="saved-tbody"></tbody>
          </table>
        </div>
      </div>`;
    const tbody = document.getElementById('saved-tbody');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="faint">No saved reports yet — build one in the Report builder tab and click "Save this configuration".</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((r) => `
      <tr>
        <td>${r.name}</td>
        <td>${r.reportIds.map((id) => (definitions.find((d) => d.id === id) || { label: id }).label).join(', ')}</td>
        <td>${r.createdBy || '—'}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td class="row" style="gap:6px">
          <button class="btn btn-ghost btn-sm sv-run" data-id="${r.id}">Preview</button>
          <button class="btn btn-ghost btn-sm sv-pdf" data-id="${r.id}">PDF</button>
          <button class="btn btn-ghost btn-sm sv-xlsx" data-id="${r.id}">XLSX</button>
          <button class="btn btn-ghost btn-sm sv-delete" data-id="${r.id}" style="color:var(--color-danger)">Delete</button>
        </td>
      </tr>`).join('');

    function findSaved(id) { return data.find((r) => String(r.id) === String(id)); }

    tbody.querySelectorAll('.sv-run').forEach((btn) => btn.addEventListener('click', async () => {
      const sv = findSaved(btn.dataset.id);
      await Api.withLoading(btn, 'Building…', async () => {
        const res = sv.reportIds.length === 1
          ? await Api.post(`/reports/${sv.reportIds[0]}/preview`, { filters: sv.filters[sv.reportIds[0]] || {} })
          : await Api.post('/reports/combined/preview', { reportIds: sv.reportIds, filters: sv.filters });
        showPreviewModal(res.data.html, sv.reportIds);
      });
    }));
    tbody.querySelectorAll('.sv-pdf, .sv-xlsx').forEach((btn) => btn.addEventListener('click', async () => {
      const sv = findSaved(btn.dataset.id);
      const format = btn.classList.contains('sv-pdf') ? 'pdf' : 'xlsx';
      await Api.withLoading(btn, 'Exporting…', async () => {
        if (sv.reportIds.length === 1) await Api.download(`/reports/${sv.reportIds[0]}/export`, { filters: sv.filters[sv.reportIds[0]] || {}, format }, `report.${format}`);
        else await Api.download('/reports/combined/export', { reportIds: sv.reportIds, filters: sv.filters, format }, `combined-report.${format}`);
        Api.toast('Export downloaded', 'success');
      });
    }));
    tbody.querySelectorAll('.sv-delete').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Delete this saved report?')) return;
      await Api.del(`/reports/saved/${btn.dataset.id}`);
      Api.toast('Deleted', 'success');
      renderSaved();
    }));
  }

  // ==========================================================================================
  // Top-level tab wiring
  // ==========================================================================================
  const topRenderers = { overview: renderOverview, builder: renderBuilder, saved: renderSaved };
  topTabsEl.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    topTabsEl.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    topRenderers[t.dataset.key]();
  }));
  renderOverview();
})();
