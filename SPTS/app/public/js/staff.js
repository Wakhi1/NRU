// "All employee devices" — geofencing/check-in coverage across the WHOLE organisation, not just
// field teams (architecture doc §6). No coordinates here, ever — presence/status only. Each row
// opens a read-only detail drawer.
let staffData = [];

function decisionTag(d) {
  return {
    confirmed: '<span class="badge badge-success">Confirmed</span>',
    outside: '<span class="badge badge-danger">Outside zone</span>',
    stale: '<span class="badge badge-warning">Re-confirmation due</span>',
    blocked: '<span class="badge badge-danger">Blocked</span>',
  }[d] || '<span class="badge badge-neutral">Not checked in</span>';
}

function viewEmployee(employeeNo) {
  const r = staffData.find((x) => x.employee_no === employeeNo);
  if (!r) return;
  FormDrawer.open({
    title: r.full_legal_name,
    sub: `${r.employee_no} · ${r.department || '—'}`,
    readOnly: true,
    sections: [
      { label: 'HRIS profile', fields: [
        { key: 'position_title', label: 'Title', value: r.position_title || '—' },
        { key: 'phone', label: 'Phone', value: r.phone || '—' },
        { key: 'grade', label: 'Grade', value: r.grade || '—' },
        { key: 'duty_station', label: 'Duty station', value: r.duty_station || '—' },
      ] },
      { label: 'Work assignment (SPTS)', fields: [
        { key: 'zone_name', label: 'Assigned zone', value: r.zone_name || 'None' },
        { key: 'asset_tag', label: 'Handset', value: r.asset_tag ? `${r.asset_tag} (${r.device_kind})` : 'None' },
        { key: 'status', label: 'Current shift', value: r.shift_status === 'open' ? (({ confirmed: 'Confirmed', outside: 'Outside zone', stale: 'Re-confirmation due', blocked: 'Blocked' })[r.last_decision] || 'Open') : 'Not on shift' },
      ] },
    ],
  });
}

(async () => {
  await Shell.init('staff');
  const { data, scope } = await Api.get('/staff');
  staffData = data;
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>All employee devices</h1>
      <p class="page-sub">Office, depot and vehicle staff are confirmed <i>present</i>, not tracked — only field shifts produce a continuous track. Scope: ${scope === 'organisation' ? 'organisation-wide' : 'your department'}.</p></div></div>
    <div class="grid grid-3" style="margin-bottom:16px;">
      <div class="card kpi"><span class="label">Employees</span><span class="value">${data.length}</span></div>
      <div class="card kpi"><span class="label">On shift now</span><span class="value">${data.filter((r) => r.shift_status === 'open').length}</span></div>
      <div class="card kpi"><span class="label">With a handset assigned</span><span class="value">${data.filter((r) => r.device_id).length}</span></div>
    </div>
    <div class="card">
      <div class="table-wrap"><table><thead><tr>
        <th>Employee</th><th>Department</th><th>Role</th><th>Handset</th><th>Zone</th><th>Status</th>
      </tr></thead><tbody>${data.map((r) => `<tr class="clickable" data-view="${r.employee_no}">
        <td><div class="row">${avatarHtml(r.photo_path, r.full_legal_name, 26)}<span>${esc(r.full_legal_name)}</span></div></td>
        <td>${esc(r.department || '—')}</td><td>${esc(r.position_title || '—')}</td>
        <td>${r.asset_tag ? `${esc(r.asset_tag)} (${esc(r.device_kind)})` : '<span class="note" style="border:0;padding:0;">none</span>'}</td>
        <td>${esc(r.zone_name || '—')}</td>
        <td>${decisionTag(r.shift_status === 'open' ? r.last_decision : null)}</td>
      </tr>`).join('') || '<tr><td colspan="6">No employees in scope</td></tr>'}</tbody></table></div>
    </div>`;

  [...document.querySelectorAll('[data-view]')].forEach((tr) => tr.addEventListener('click', () => viewEmployee(tr.dataset.view)));
})();
