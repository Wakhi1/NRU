(async () => {
  const shellData = await Shell.init('crm');
  const scope = shellData.scope.crm || {};
  const canCreate = !!scope.create;
  const canUpdate = !!scope.update;
  const canDelete = !!scope.delete;
  if (canCreate) {
    document.getElementById('new-partner-btn').style.display = '';
    document.getElementById('new-programme-btn').style.display = '';
  }

  const STATUS_BADGE = { active: 'badge-success', renewal_due: 'badge-warning', inactive: 'badge-neutral' };
  let partnersCache = [];
  let programmesCache = [];
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

  // ---------------- Partners ----------------
  async function loadPartners() {
    const { data } = await Api.get('/crm/partners');
    partnersCache = data;
    document.getElementById('partners-grid').innerHTML = data.map((p) => `
      <div class="card clickable" data-id="${p.id}">
        <div class="row between"><h3>${p.name}</h3><span class="badge ${STATUS_BADGE[p.status] || 'badge-neutral'}">${p.status.replace('_', ' ')}</span></div>
        <div class="muted">${p.type || '—'}</div>
        <div class="faint">${p.contact_name || ''}${p.contact_phone ? ' · ' + p.contact_phone : ''}</div>
        <div class="divider"></div>
        <div class="faint">${p.agreement || 'No agreement on file'}</div>
      </div>
    `).join('') || '<div class="empty-state">No partners yet.</div>';

    document.querySelectorAll('#partners-grid .card[data-id]').forEach((el) => {
      el.addEventListener('click', () => openPartnerDrawer(partnersCache.find((p) => String(p.id) === el.dataset.id)));
    });
  }

  function openPartnerDrawer(p) {
    FormDrawer.open({
      title: p.name,
      sub: `${p.type || 'Partner'}${p.since_year ? ' · partner since ' + p.since_year : ''}`,
      readOnly: !canUpdate,
      sections: [{
        label: 'Relationship',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: p.name, required: true },
          { key: 'type', label: 'Type', type: 'text', value: p.type, hint: 'e.g. International NGO' },
          { key: 'contact_name', label: 'Primary contact', type: 'text', value: p.contact_name },
          { key: 'contact_phone', label: 'Phone', type: 'text', value: p.contact_phone },
          { key: 'since_year', label: 'Partner since (year)', type: 'number', value: p.since_year },
          { key: 'status', label: 'Status', type: 'select', value: p.status, options: [{ value: 'active', label: 'Active' }, { value: 'renewal_due', label: 'Renewal due' }, { value: 'inactive', label: 'Inactive' }] },
          { key: 'agreement', label: 'Agreement', type: 'text', value: p.agreement, hint: 'e.g. MoU to 31 Dec 2027' },
        ],
      }],
      primaryLabel: 'Save changes',
      onSave: async (v) => {
        await Api.put(`/crm/partners/${p.id}`, v);
        Api.toast('Partner updated', 'success');
        loadPartners();
        loadProgrammes();
      },
      onDelete: canDelete ? async () => {
        await Api.del(`/crm/partners/${p.id}`);
        Api.toast('Partner deleted', 'success');
        loadPartners();
        loadProgrammes();
      } : undefined,
      deleteLabel: 'Delete partner',
    });
  }

  document.getElementById('new-partner-btn').addEventListener('click', () => {
    FormDrawer.open({
      title: 'New partner',
      sub: 'Adds a partner organisation you can link programmes and indicators to.',
      sections: [{
        label: 'Relationship',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: '', required: true },
          { key: 'type', label: 'Type', type: 'text', value: '', hint: 'e.g. International NGO' },
          { key: 'contact_name', label: 'Primary contact', type: 'text', value: '' },
          { key: 'contact_phone', label: 'Phone', type: 'text', value: '' },
          { key: 'since_year', label: 'Partner since (year)', type: 'number', value: '' },
          { key: 'status', label: 'Status', type: 'select', value: 'active', options: [{ value: 'active', label: 'Active' }, { value: 'renewal_due', label: 'Renewal due' }, { value: 'inactive', label: 'Inactive' }] },
          { key: 'agreement', label: 'Agreement', type: 'text', value: '', hint: 'e.g. MoU to 31 Dec 2027' },
        ],
      }],
      primaryLabel: 'Create',
      onSave: async (v) => {
        await Api.post('/crm/partners', v);
        Api.toast('Partner created', 'success');
        loadPartners();
      },
    });
  });

  // ---------------- Programmes ----------------
  async function loadProgrammes() {
    const { data } = await Api.get('/crm/programmes');
    programmesCache = data;
    document.getElementById('programmes-grid').innerHTML = data.map((p) => `
      <div class="card clickable" data-id="${p.id}">
        <h3>${p.name}</h3>
        <div class="muted">Lead: ${p.lead_name || '—'}</div>
        <div class="faint">${p.partner_names || 'No partners linked'}</div>
        <div class="divider"></div>
        <div class="faint">${p.indicator_count} indicator record(s)</div>
      </div>
    `).join('') || '<div class="empty-state">No programmes yet.</div>';

    document.querySelectorAll('#programmes-grid .card[data-id]').forEach((el) => {
      el.addEventListener('click', () => openProgrammeDrawer(el.dataset.id));
    });
  }

  function indicatorsTableHtml(indicators) {
    return `
      <div class="drawer-group">
        <div class="drawer-group-label">Indicators to date (${indicators.length})</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Indicator</th><th>Period</th><th>Value</th><th>Partner</th><th></th></tr></thead>
          <tbody>${indicators.map((i) => `
            <tr data-indicator="${i.id}">
              <td>${i.indicator_name}</td><td>${i.period}</td><td>${i.value}</td><td class="faint">${i.partner_name || '—'}</td>
              <td class="row" style="gap:4px">
                ${canUpdate ? '<button class="btn btn-ghost btn-sm" data-edit-ind>Edit</button>' : ''}
                ${canDelete ? '<button class="btn btn-ghost btn-sm" data-remove-ind style="color:var(--color-danger)">Remove</button>' : ''}
              </td>
            </tr>
          `).join('') || '<tr><td colspan="5" class="faint">None recorded yet.</td></tr>'}</tbody>
        </table></div>
        ${canCreate ? `
          <div class="row" style="gap:8px;margin-top:10px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-row" style="flex:1;min-width:120px;margin-bottom:0"><label>Indicator</label><input id="ind-name" /></div>
            <div class="form-row" style="min-width:100px;margin-bottom:0"><label>Period</label><input id="ind-period" placeholder="2026-08" /></div>
            <div class="form-row" style="min-width:90px;margin-bottom:0"><label>Value</label><input id="ind-value" type="number" step="0.01" /></div>
            <div class="form-row" style="min-width:140px;margin-bottom:0"><label>Partner</label><select id="ind-partner"><option value="">—</option></select></div>
            <button class="btn btn-primary btn-sm" id="add-ind-btn">Add</button>
          </div>
          <div class="field-error" id="ind-error" style="display:none"></div>` : ''}
      </div>`;
  }

  async function openProgrammeDrawer(id) {
    const { data } = await Api.get(`/crm/programmes/${id}`);
    const people = await getPeopleOptions();

    FormDrawer.open({
      title: data.name,
      sub: `${data.partners.length} partner(s) · led by ${data.lead_name || 'unassigned'}`,
      readOnly: !canUpdate,
      sections: [{
        label: 'Programme',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: data.name, required: true },
          { key: 'lead_employee_no', label: 'Lead', type: 'select', value: data.lead_employee_no || '', options: people },
          { key: 'status', label: 'Status', type: 'text', value: data.status },
          { key: 'start_date', label: 'Start date', type: 'date', value: data.start_date },
          { key: 'end_date', label: 'End date', type: 'date', value: data.end_date },
        ],
      }],
      extraHtml: `
        ${data.partners.length ? `<div class="drawer-group"><div class="drawer-group-label">Partners</div><div class="drawer-chips">${data.partners.map((p) => `<span class="badge badge-info">${p.name}</span>`).join('')}</div></div>` : ''}
        ${indicatorsTableHtml(data.indicators)}
      `,
      afterRender: (root) => wireIndicators(root, id, data),
      primaryLabel: 'Save changes',
      onSave: async (v) => {
        await Api.put(`/crm/programmes/${id}`, v);
        Api.toast('Programme updated', 'success');
        loadProgrammes();
      },
      onDelete: canDelete ? async () => {
        await Api.del(`/crm/programmes/${id}`);
        Api.toast('Programme deleted', 'success');
        loadProgrammes();
      } : undefined,
      deleteLabel: 'Delete programme',
    });
  }

  function wireIndicators(root, programmeId, data) {
    const partnerSelect = root.querySelector('#ind-partner');
    if (partnerSelect) partnerSelect.innerHTML = '<option value="">—</option>' + partnersCache.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');

    root.querySelectorAll('[data-edit-ind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const ind = data.indicators.find((i) => String(i.id) === tr.dataset.indicator);
        FormDrawer.open({
          title: 'Edit indicator',
          sub: `${ind.indicator_name} — ${ind.period}`,
          sections: [{
            label: 'Indicator',
            fields: [
              { key: 'indicator_name', label: 'Indicator', type: 'text', value: ind.indicator_name, required: true },
              { key: 'period', label: 'Period', type: 'text', value: ind.period, required: true },
              { key: 'value', label: 'Value', type: 'number', value: ind.value, required: true },
              { key: 'partner_org_id', label: 'Partner', type: 'select', value: ind.partner_org_id || '', options: [{ value: '', label: '—' }, ...partnersCache.map((p) => ({ value: p.id, label: p.name }))], numeric: true },
            ],
          }],
          primaryLabel: 'Save',
          onDelete: canDelete ? async () => {
            await Api.del(`/crm/indicators/${ind.id}`);
            Api.toast('Indicator removed', 'success');
            openProgrammeDrawer(programmeId);
            loadProgrammes();
          } : undefined,
          deleteLabel: 'Remove indicator',
          onSave: async (v) => {
            await Api.put(`/crm/indicators/${ind.id}`, v);
            Api.toast('Indicator updated', 'success');
            openProgrammeDrawer(programmeId);
            loadProgrammes();
          },
        });
      });
    });

    root.querySelectorAll('[data-remove-ind]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        if (!confirm('Remove this indicator record?')) return;
        await Api.withLoading(btn, 'Removing…', () => Api.del(`/crm/indicators/${tr.dataset.indicator}`));
        Api.toast('Indicator removed', 'success');
        FormDrawer.close();
        openProgrammeDrawer(programmeId);
        loadProgrammes();
      });
    });

    const addBtn = root.querySelector('#add-ind-btn');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const errEl = root.querySelector('#ind-error');
      errEl.style.display = 'none';
      const name = root.querySelector('#ind-name').value.trim();
      const period = root.querySelector('#ind-period').value.trim();
      const value = parseFloat(root.querySelector('#ind-value').value);
      if (!name || !period || Number.isNaN(value)) {
        errEl.textContent = 'Indicator, period and value are required.';
        errEl.style.display = 'block';
        return;
      }
      await Api.withLoading(addBtn, 'Adding…', () => Api.post(`/crm/programmes/${programmeId}/indicators`, {
        indicator_name: name, period, value,
        partner_org_id: partnerSelect.value ? Number(partnerSelect.value) : null,
      }));
      Api.toast('Indicator added', 'success');
      FormDrawer.close();
      openProgrammeDrawer(programmeId);
      loadProgrammes();
    });
  }

  document.getElementById('new-programme-btn').addEventListener('click', async () => {
    const people = await getPeopleOptions();
    FormDrawer.open({
      title: 'New programme',
      sub: 'Groups partners, a lead and collected indicators under one programme of work.',
      sections: [{
        label: 'Programme',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: '', required: true },
          { key: 'lead_employee_no', label: 'Lead', type: 'select', value: '', options: people },
          { key: 'status', label: 'Status', type: 'text', value: 'Active' },
          { key: 'start_date', label: 'Start date', type: 'date', value: '' },
          { key: 'end_date', label: 'End date', type: 'date', value: '' },
        ],
      }],
      primaryLabel: 'Create',
      onSave: async (v) => {
        await Api.post('/crm/programmes', v);
        Api.toast('Programme created', 'success');
        loadProgrammes();
      },
    });
  });

  document.querySelectorAll('.tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isPartners = tab.dataset.tab === 'partners';
      document.getElementById('partners-grid').style.display = isPartners ? 'grid' : 'none';
      document.getElementById('programmes-grid').style.display = isPartners ? 'none' : 'grid';
    });
  });

  loadPartners();
  loadProgrammes();
})();
