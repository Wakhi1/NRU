// Users & permissions — role comes straight from the HRIS (no local role table, no elevation, no
// "set role" override — see platform/scope.js). This screen reviews that, lets a System
// administrator edit the permission matrix per HRIS role, reviews the synced org structure, and
// edits check-in/geofence policy.
let usersData = null, rolesData = null;

function roleBadge(roleName) {
  if (!roleName) return '<span class="badge badge-neutral">No HRIS login</span>';
  return `<span class="badge badge-info">${esc(roleName)}</span>`;
}

async function loadUsers() {
  const { data, roles } = await Api.get('/admin/users');
  usersData = data; rolesData = roles;
  const tbl = document.getElementById('users-tbl');
  tbl.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Employee</th><th>Department</th><th>Title</th><th>HRIS role</th><th></th>
  </tr></thead><tbody>${data.map((u) => `<tr>
    <td><div class="row">${avatarHtml(u.photo_path, u.full_legal_name, 26)}<div>${esc(u.full_legal_name)}<br><span class="note" style="border:0;padding:0;">${esc(u.employee_no)}</span></div></div></td>
    <td>${esc(u.department || '—')}</td><td>${esc(u.position_title || '—')}</td>
    <td>${roleBadge(u.role_name)}</td>
    <td><button class="btn btn-ghost btn-sm" data-view="${u.employee_no}">View</button></td>
  </tr>`).join('')}</tbody></table></div>
  <p class="note" style="margin-top:10px;">Role is read straight from the HRIS — there is no local role, no elevation, and no way to override it here. To change what someone can do, change their role in the HRIS, or edit the permission matrix below for the role they already have.</p>
  <p class="note" style="margin-top:6px;">Sign-in itself is entirely delegated to the HRIS too — there's no local password to manage here. An employee needs an HRIS login to sign in to SPTS at all.</p>`;

  [...tbl.querySelectorAll('[data-view]')].forEach((b) => b.addEventListener('click', () => viewUser(b.dataset.view)));
}

function viewUser(employeeNo) {
  const u = usersData.find((x) => x.employee_no === employeeNo);
  if (!u) return;
  FormDrawer.open({
    title: u.full_legal_name,
    sub: u.employee_no,
    readOnly: true,
    sections: [
      { label: 'HRIS profile', fields: [
        { key: 'department', label: 'Department', value: u.department || '—' },
        { key: 'position_title', label: 'Title', value: u.position_title || '—' },
        { key: 'email', label: 'Email', value: u.email || '—' },
        { key: 'status', label: 'Status', value: u.status },
      ] },
      { label: 'SPTS access', fields: [
        { key: 'role_name', label: 'HRIS role', value: u.role_name || 'No HRIS login — cannot sign in to SPTS' },
        { key: 'screens', label: 'Screens granted', value: u.role_name ? (rolesData[u.role_name]?.screens || []).join(', ') : '—' },
      ] },
    ],
  });
}

async function loadMatrix() {
  const { data } = await Api.get('/admin/matrix');
  const roleKeys = Object.keys(data.roles);
  const box = document.getElementById('matrix-box');
  box.innerHTML = `<p class="field-hint" style="margin-bottom:10px;">Click a cell to toggle that capability for that HRIS role — takes effect immediately, no restart.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Capability</th>${roleKeys.map((k) => `<th>${esc(data.roles[k].label)}</th>`).join('')}</tr></thead><tbody>
    ${data.rows.map(([permKey, label]) => `<tr><td>${esc(label)}</td>${roleKeys.map((k) => {
      const granted = data.roles[k].permissions.includes(permKey);
      return `<td style="text-align:center;cursor:pointer;" data-cell data-role="${esc(k)}" data-perm="${permKey}" data-granted="${granted}">${granted ? '●' : '—'}</td>`;
    }).join('')}</tr>`).join('')}
  </tbody></table></div>`;

  [...box.querySelectorAll('[data-cell]')].forEach((cell) => cell.addEventListener('click', async () => {
    const role_key = cell.dataset.role, permission_key = cell.dataset.perm;
    const granted = cell.dataset.granted !== 'true';
    try {
      await Api.put('/admin/matrix', { role_key, permission_key, granted });
      cell.dataset.granted = String(granted);
      cell.textContent = granted ? '●' : '—';
      Api.toast(`${granted ? 'Granted' : 'Removed'} ${permission_key} ${granted ? 'to' : 'from'} ${role_key}`);
    } catch (err) { Api.toast(err.message, true); }
  }));
}

async function loadOrgUnits() {
  const { data } = await Api.get('/admin/org-units');
  document.getElementById('orgunits-box').innerHTML = `<div class="table-wrap"><table><thead><tr>
    <th>Name</th><th>Kind</th><th>Duty station</th><th>Cost centre</th><th>Lead</th><th>Headcount</th>
  </tr></thead><tbody>${data.map((u) => `<tr>
    <td>${esc(u.name)}</td><td>${esc(u.kind || '—')}</td><td>${esc(u.duty_station || '—')}</td>
    <td>${esc(u.cost_centre || '—')}</td><td>${esc(u.lead_name || '—')}</td><td>${u.current_headcount}</td>
  </tr>`).join('') || '<tr><td colspan="6">No org units synced yet — reconcile from HRIS</td></tr>'}</tbody></table></div>`;
}

async function loadPolicy() {
  const { data } = await Api.get('/admin/policy');
  document.getElementById('policy-box').innerHTML = `
    <div class="grid grid-3">
      <label class="field">Default zone radius (m)<input id="p-radius" value="${data.default_radius_m}"></label>
      <label class="field">Accuracy ceiling (m)<input id="p-acc" value="${data.accuracy_ceiling_m}"></label>
      <label class="field">Re-confirmation interval (hours)<input id="p-recheck" value="${data.recheck_hours}"></label>
    </div>
    <div class="grid grid-3">
      <label class="field">Shift start (movement window opens)<input id="p-shift-start" type="time" value="${data.shift_start_time ? data.shift_start_time.slice(0, 5) : ''}"></label>
      <label class="field">Shift end (movement window closes)<input id="p-shift-end" type="time" value="${data.shift_end_time ? data.shift_end_time.slice(0, 5) : ''}"></label>
      <label class="field">Offline behaviour<input id="p-offline" value="${esc(data.offline_behavior)}"></label>
    </div>
    <p class="note">Leave shift start/end blank to allow check-in at any hour. When set, a check-in attempt outside this window is blocked before geofence evaluation even runs — a "flow and movement" control that applies to whoever a zone is assigned to, independent of their HRIS role.</p>
    <button class="btn btn-primary btn-sm" id="p-save">Save policy</button>`;
  document.getElementById('p-save').addEventListener('click', async (e) => {
    try {
      await Api.withLoading(e.target, 'Saving…', () => Api.put('/admin/policy', {
        default_radius_m: document.getElementById('p-radius').value, accuracy_ceiling_m: document.getElementById('p-acc').value,
        recheck_hours: document.getElementById('p-recheck').value, offline_behavior: document.getElementById('p-offline').value,
        shift_start_time: document.getElementById('p-shift-start').value || null,
        shift_end_time: document.getElementById('p-shift-end').value || null,
      }));
      Api.toast('Policy saved');
    } catch (err) { Api.toast(err.message, true); }
  });
}

async function loadBranding() {
  const { data } = await Api.get('/branding');
  const box = document.getElementById('branding-box');
  box.innerHTML = `
    <div class="row" style="align-items:flex-start;gap:20px;">
      <div>
        <p class="field-hint" style="margin-bottom:6px;">Current logo</p>
        ${data.logo_url ? `<img src="${esc(data.logo_url)}" alt="" style="height:60px;width:auto;border:1px solid var(--color-neutral-200);">` : '<span class="badge badge-neutral">Not set — default mark shown</span>'}
        <div style="margin-top:8px;"><input type="file" id="logo-file" accept="image/*"></div>
        <button class="btn btn-ghost btn-sm" id="logo-upload-btn" style="margin-top:6px;">Upload logo</button>
      </div>
      <div>
        <p class="field-hint" style="margin-bottom:6px;">Favicon</p>
        ${data.favicon_url ? `<img src="${esc(data.favicon_url)}" alt="" style="height:32px;width:32px;border:1px solid var(--color-neutral-200);">` : '<span class="badge badge-neutral">Not set</span>'}
        <div style="margin-top:8px;"><input type="file" id="favicon-file" accept="image/*"></div>
        <button class="btn btn-ghost btn-sm" id="favicon-upload-btn" style="margin-top:6px;">Upload favicon</button>
      </div>
      <div style="flex:1;min-width:200px;">
        <label class="field">Organisation name<input id="org-name-input" value="${esc(data.org_name)}"></label>
        <button class="btn btn-primary btn-sm" id="org-name-save">Save name</button>
      </div>
    </div>`;

  document.getElementById('logo-upload-btn').addEventListener('click', async (e) => {
    const file = document.getElementById('logo-file').files[0];
    if (!file) return Api.toast('Choose a file first', true);
    const fd = new FormData(); fd.append('logo', file);
    try {
      await Api.withLoading(e.target, 'Uploading…', () => fetch('/api/v1/branding/logo', { method: 'POST', body: fd, credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error('Upload failed'); }));
      Api.toast('Logo updated');
      brandingCache = null;
      loadBranding();
    } catch (err) { Api.toast(err.message, true); }
  });
  document.getElementById('favicon-upload-btn').addEventListener('click', async (e) => {
    const file = document.getElementById('favicon-file').files[0];
    if (!file) return Api.toast('Choose a file first', true);
    const fd = new FormData(); fd.append('favicon', file);
    try {
      await Api.withLoading(e.target, 'Uploading…', () => fetch('/api/v1/branding/favicon', { method: 'POST', body: fd, credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error('Upload failed'); }));
      Api.toast('Favicon updated');
      brandingCache = null;
      loadBranding();
    } catch (err) { Api.toast(err.message, true); }
  });
  document.getElementById('org-name-save').addEventListener('click', async (e) => {
    try {
      await Api.withLoading(e.target, 'Saving…', () => Api.put('/branding/org-name', { org_name: document.getElementById('org-name-input').value }));
      Api.toast('Organisation name updated');
      brandingCache = null;
    } catch (err) { Api.toast(err.message, true); }
  });
}

(async () => {
  await Shell.init('admin');
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Branding</h1>
      <p class="page-sub">Organisation logo, favicon and name shown across the app and on the sign-in page.</p></div></div>
    <div class="card" id="branding-box"></div>

    <div class="page-head" style="margin-top:24px;"><div><h1>Users &amp; permissions</h1>
      <p class="page-sub">Every employee's role is read live from the HRIS — this is a review screen, not a place to assign one.</p></div>
      <button class="btn btn-ghost" id="reconcile-btn">↻ Reconcile from HRIS now</button></div>
    <div class="card" id="users-tbl"></div>
    <div class="page-head" style="margin-top:24px;"><div><h1>Permission matrix</h1></div></div>
    <div class="card" id="matrix-box"></div>
    <div class="page-head" style="margin-top:24px;"><div><h1>Org structure</h1>
      <p class="page-sub">Departments and units — read-only, synced from the HRIS (the system of record for org structure).</p></div></div>
    <div class="card" id="orgunits-box"></div>
    <div class="page-head" style="margin-top:24px;"><div><h1>Check-in policy</h1></div></div>
    <div class="card" id="policy-box"></div>`;

  document.getElementById('reconcile-btn').addEventListener('click', async (e) => {
    try {
      const { data } = await Api.withLoading(e.target, 'Reconciling…', () => Api.post('/admin/reconcile'));
      Api.toast(`Reconciled ${data.employees} employees, ${data.orgUnits} org units`);
      loadUsers();
    } catch (err) { Api.toast(err.message, true); }
  });

  await loadBranding();
  await loadUsers();
  await loadMatrix();
  await loadOrgUnits();
  await loadPolicy();
})();
