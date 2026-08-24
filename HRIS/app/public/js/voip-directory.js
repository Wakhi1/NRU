const STATUS_BADGE = { active: 'badge-success', inactive: 'badge-neutral', forwarded: 'badge-warning' };

(async () => {
  const shellData = await Shell.init('voip');
  const isAdmin = ['HR administrator', 'System administrator'].includes(shellData.user.role);
  const self = shellData.user.employeeNo;
  if (isAdmin) document.getElementById('new-ext-btn').style.display = '';

  let extensions = [];
  let peopleCache = null;
  let unitsCache = null;

  async function ensureLookups() {
    if (!peopleCache) {
      try { peopleCache = (await Api.get('/people')).data; } catch (e) { peopleCache = []; }
    }
    if (!unitsCache) {
      try { unitsCache = (await Api.get('/org')).data.filter((u) => u.kind === 'department'); } catch (e) { unitsCache = []; }
    }
  }

  function fmtDuration(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function renderExtensions() {
    const tbody = document.querySelector('#ext-table tbody');
    document.getElementById('ext-empty').style.display = extensions.length ? 'none' : 'block';
    tbody.innerHTML = extensions.map((e) => `
      <tr>
        <td>${e.full_legal_name}</td>
        <td>${e.position_title || '—'}</td>
        <td>${e.department_name || '—'}</td>
        <td>${e.extension}</td>
        <td class="faint">${e.device_assigned || '—'}</td>
        <td><span class="badge ${STATUS_BADGE[e.status] || 'badge-neutral'}">${e.status}</span></td>
        <td class="row" style="gap:4px">
          <button class="btn btn-ghost btn-sm" data-call="${e.employee_no}" title="Call">&#9742;</button>
          <button class="btn btn-ghost btn-sm" data-manage="${e.id}">${isAdmin || e.employee_no === self ? 'Manage' : 'View'}</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-call]').forEach((btn) => btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Api.post('/voip/calls', { callee_employee_no: btn.dataset.call });
        Api.toast('Call logged', 'success');
        loadCalls();
      } finally { btn.disabled = false; }
    }));
    tbody.querySelectorAll('[data-manage]').forEach((btn) => btn.addEventListener('click', () => openManageDrawer(extensions.find((e) => String(e.id) === btn.dataset.manage))));
  }

  let searchDebounce;
  document.getElementById('ext-search').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => loadExtensions(e.target.value.trim()), 250);
  });

  async function loadExtensions(q) {
    const { data } = await Api.get('/voip/extensions' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    extensions = data;
    renderExtensions();
  }

  async function loadCalls() {
    const { data } = await Api.get('/voip/calls');
    document.getElementById('call-empty').style.display = data.length ? 'none' : 'block';
    document.querySelector('#call-table tbody').innerHTML = data.map((c) => `
      <tr>
        <td>${c.callee_name || c.caller_name || c.callee_number || '—'}</td>
        <td>${new Date(c.started_at.replace(' ', 'T')).toLocaleString()}</td>
        <td>${fmtDuration(c.duration_seconds)}</td>
        <td>${c.direction}</td>
        <td><span class="badge ${c.outcome === 'completed' ? 'badge-success' : 'badge-neutral'}">${c.outcome}</span></td>
      </tr>
    `).join('');
  }

  function peopleOptions(selected) {
    return peopleCache.map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` }));
  }
  function unitOptions() {
    return [{ value: '', label: '— No department routing —' }, ...unitsCache.map((u) => ({ value: u.id, label: u.name }))];
  }

  async function openManageDrawer(ext) {
    await ensureLookups();
    const isOwner = ext.employee_no === self;
    const canProvision = isAdmin; // extension number, SIP, device, department, hunt group
    const canSelfServe = isAdmin || isOwner; // status + call-handling prefs

    FormDrawer.open({
      title: `${ext.full_legal_name} — ext. ${ext.extension}`,
      sub: [ext.position_title, ext.department_name].filter(Boolean).join(' · '),
      readOnly: !canSelfServe,
      sections: [
        {
          label: 'Allocation',
          fields: [
            { key: 'extension', label: 'Extension number', type: 'text', value: ext.extension, required: true, editable: canProvision },
            { key: 'department_org_unit_id', label: 'Department routing', type: 'select', value: ext.department_org_unit_id || '', options: unitOptions(), editable: canProvision, numeric: true },
            { key: 'device_assigned', label: 'Hardware device', type: 'text', value: ext.device_assigned, hint: 'e.g. Yealink T46S — Desk 12', editable: canProvision },
            { key: 'emergency_number', label: 'Emergency response number', type: 'text', value: ext.emergency_number, editable: canProvision },
          ],
        },
        {
          label: 'SIP configuration',
          fields: [
            { key: 'sip_username', label: 'SIP username', type: 'text', value: ext.sip_username, editable: canProvision },
            { key: 'sip_domain', label: 'Domain / server endpoint', type: 'text', value: ext.sip_domain, editable: canProvision },
            { key: 'voicemail_pin', label: 'Voicemail box PIN', type: 'text', value: ext.voicemail_pin, editable: canProvision },
          ],
        },
        {
          label: 'Call routing & IVR',
          fields: [
            { key: 'status', label: 'Status', type: 'select', value: ext.status, options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'forwarded', label: 'Forwarded' }], editable: canSelfServe },
            { key: 'forward_on_busy_to', label: 'Forward on busy to', type: 'text', value: ext.forward_on_busy_to, hint: 'Extension or number', editable: canSelfServe },
            { key: 'out_of_office_enabled', label: 'Out-of-office routing', type: 'checkbox', value: !!ext.out_of_office_enabled, hint: 'Enable out-of-office call handling', editable: canSelfServe },
            { key: 'out_of_office_target', label: 'Out-of-office target', type: 'text', value: ext.out_of_office_target, hint: 'e.g. voicemail, or another extension', editable: canSelfServe },
            { key: 'hunt_group', label: 'Hunt group', type: 'text', value: ext.hunt_group, hint: 'e.g. Finance Queue, HR Front Desk', editable: canProvision },
          ],
        },
      ],
      primaryLabel: 'Save changes',
      onSave: async (values) => {
        await Api.put(`/voip/extensions/${ext.id}`, values);
        Api.toast('Extension updated', 'success');
        loadExtensions(document.getElementById('ext-search').value.trim());
      },
      onDelete: canProvision ? async () => {
        await Api.del(`/voip/extensions/${ext.id}`);
        Api.toast('Extension released', 'success');
        loadExtensions();
      } : undefined,
      deleteLabel: 'Release extension',
    });
  }

  document.getElementById('new-ext-btn').addEventListener('click', async () => {
    await ensureLookups();
    const allocated = new Set(extensions.map((e) => e.employee_no));
    const available = peopleCache.filter((p) => !allocated.has(p.employee_no));
    FormDrawer.open({
      title: 'Allocate extension',
      sub: 'Assigns a new internal extension to an employee or department desk.',
      sections: [
        {
          label: 'Allocation',
          fields: [
            { key: 'employee_no', label: 'Employee', type: 'select', value: '', required: true, options: available.map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` })) },
            { key: 'extension', label: 'Extension number', type: 'text', value: '', required: true, hint: 'e.g. 130' },
            { key: 'department_org_unit_id', label: 'Department routing', type: 'select', value: '', options: unitOptions(), numeric: true },
            { key: 'device_assigned', label: 'Hardware device', type: 'text', value: '', hint: 'e.g. Yealink T46S — Desk 12' },
            { key: 'emergency_number', label: 'Emergency response number', type: 'text', value: '' },
          ],
        },
        {
          label: 'SIP configuration',
          fields: [
            { key: 'sip_username', label: 'SIP username', type: 'text', value: '' },
            { key: 'sip_domain', label: 'Domain / server endpoint', type: 'text', value: 'sip.nru.local' },
            { key: 'voicemail_pin', label: 'Voicemail box PIN', type: 'text', value: '' },
          ],
        },
      ],
      primaryLabel: 'Allocate',
      onSave: async (values) => {
        await Api.post('/voip/extensions', values);
        Api.toast('Extension allocated', 'success');
        loadExtensions();
      },
    });
  });

  await loadExtensions();
  loadCalls();
})();
