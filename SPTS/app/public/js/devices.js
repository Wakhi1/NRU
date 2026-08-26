// Handset fleet registry (architecture doc §4.2 Device & Fleet) — registration and reassignment
// both use the shared FormDrawer side panel.
let staffCache = [];

function statusTag(s) {
  return { online: '<span class="badge badge-success">Online</span>', idle: '<span class="badge badge-warning">Idle</span>', offline: '<span class="badge badge-neutral">Offline</span>' }[s] || s;
}

async function loadDevices() {
  const { data } = await Api.get('/devices');
  const tbl = document.getElementById('tbl');
  tbl.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Asset tag</th><th>Kind</th><th>Model</th><th>Status</th><th>Battery</th><th>Assigned to</th><th></th>
  </tr></thead><tbody>${data.map((d) => `<tr>
    <td>${esc(d.asset_tag)}</td><td>${esc(d.kind)}</td><td>${esc(d.hw_model || '—')}</td><td>${statusTag(d.status)}</td>
    <td>${d.battery_pct != null ? d.battery_pct + '%' : '—'}</td><td>${esc(d.assigned_name || '—')}</td>
    <td><button class="btn btn-ghost btn-sm" data-reassign="${d.id}" data-tag="${esc(d.asset_tag)}" data-emp="${esc(d.assigned_employee_no || '')}">Reassign</button>
        <button class="btn btn-ghost btn-sm" data-del="${d.id}">Delete</button></td>
  </tr>`).join('') || '<tr><td colspan="7">No devices yet</td></tr>'}</tbody></table></div>`;

  [...tbl.querySelectorAll('[data-del]')].forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this device?')) return;
    await Api.del(`/devices/${b.dataset.del}`);
    loadDevices();
  }));
  [...tbl.querySelectorAll('[data-reassign]')].forEach((b) => b.addEventListener('click', () => openReassign(b.dataset.reassign, b.dataset.tag, b.dataset.emp)));
}

function openReassign(id, assetTag, currentEmployeeNo) {
  FormDrawer.open({
    title: `Reassign — ${assetTag}`,
    sub: 'Which employee this handset is issued to',
    sections: [{ label: 'Assignment', fields: [
      { key: 'assigned_employee_no', label: 'Employee', type: 'select', value: currentEmployeeNo,
        options: [{ value: '', label: '— unassigned —' }, ...staffCache.map((s) => ({ value: s.employee_no, label: s.full_legal_name }))] },
    ] }],
    onSave: async (values) => {
      await Api.put(`/devices/${id}`, { assigned_employee_no: values.assigned_employee_no || null });
      Api.toast('Device reassigned');
      loadDevices();
    },
  });
}

function openRegister() {
  FormDrawer.open({
    title: 'Register a handset',
    sub: 'Add a new organisation-issued tracked device',
    sections: [{ label: 'Handset', fields: [
      { key: 'asset_tag', label: 'Asset tag', value: '', required: true, hint: 'SPTS-017' },
      { key: 'kind', label: 'Kind', type: 'select', value: 'field', options: [{ value: 'field', label: 'Field' }, { value: 'office', label: 'Office' }, { value: 'vehicle', label: 'Vehicle' }] },
      { key: 'hw_model', label: 'Model', value: '', hint: 'Samsung A14' },
      { key: 'imei', label: 'IMEI', value: '' },
      { key: 'os_version', label: 'OS version', value: '', hint: 'Android 14' },
      { key: 'assigned_employee_no', label: 'Assign to', type: 'select', value: '',
        options: [{ value: '', label: '— unassigned —' }, ...staffCache.map((s) => ({ value: s.employee_no, label: s.full_legal_name }))] },
    ] }],
    primaryLabel: 'Register',
    onSave: async (values) => {
      await Api.post('/devices', {
        asset_tag: values.asset_tag.trim(), kind: values.kind,
        hw_model: values.hw_model || null, imei: values.imei || null, os_version: values.os_version || null,
        assigned_employee_no: values.assigned_employee_no || null,
      });
      Api.toast('Handset registered');
      loadDevices();
    },
  });
}

(async () => {
  await Shell.init('devices');
  const { data: staff } = await Api.get('/staff');
  staffCache = staff;

  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Handsets</h1>
      <p class="page-sub">Every organisation-issued tracked handset — field, office and vehicle alike.</p></div>
      <button class="btn btn-primary" id="register-btn">+ Register handset</button></div>
    <div class="card" id="tbl"></div>`;

  document.getElementById('register-btn').addEventListener('click', openRegister);
  await loadDevices();
})();
