let activeTab = 'users';

function statusBadge(s) {
  return s === 'active' ? '<span class="badge badge-success">Active</span>' : `<span class="badge badge-neutral">${esc(s)}</span>`;
}

async function renderUsers() {
  const { data, roles } = await Api.get('/admin/users');
  const box = document.getElementById('tab-body');
  box.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Name</th><th>Email</th><th>Department</th><th>Position</th><th>Status</th><th>HRIS role</th>
  </tr></thead><tbody>${data.map((u) => `<tr>
    <td>${esc(u.full_legal_name)}</td><td>${esc(u.email || '—')}</td><td>${esc(u.department || '—')}</td>
    <td>${esc(u.position_title || '—')}</td><td>${statusBadge(u.status)}</td>
    <td>${u.role_name ? `<span class="badge badge-info">${esc(u.role_name)}</span>` : '<span class="faint">No HRIS login</span>'}</td>
  </tr>`).join('')}</tbody></table></div>
  <p class="field-hint" style="margin-top:12px">Roles are synced verbatim from the HRIS — to change someone's role, edit it in the HRIS itself, then run "Reconcile from HRIS now" below.</p>`;
}

// Screen access and capabilities are stored as the same kind of role_permission row (a screen grant
// is just `screen:<key>` under the hood — see platform/scope.js), so both tables below post to the
// same PUT /admin/matrix endpoint; only the `permission_key` prefix differs. A role with a "Custom
// role synced from the HRIS…" description is one discoverRoles() picked up automatically — it has
// no screens/permissions yet until checked here.
function matrixTableHtml(title, rows, roleKeys, roles, keyPrefix, checkedIn) {
  return `<h3 style="margin:18px 0 8px">${esc(title)}</h3>
    <div class="tbl-wrap"><table><thead><tr><th>${keyPrefix ? 'Screen' : 'Capability'}</th>${roleKeys.map((r) => `<th>${esc(r)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([key, label]) => `<tr><td>${esc(label)}</td>${roleKeys.map((r) => `
      <td style="text-align:center"><input type="checkbox" data-role="${esc(r)}" data-perm="${esc(keyPrefix + key)}" ${checkedIn(roles[r], key) ? 'checked' : ''} style="width:auto"/></td>
    `).join('')}</tr>`).join('')}</tbody></table></div>`;
}

async function renderMatrix() {
  const { data } = await Api.get('/admin/matrix');
  const roleKeys = Object.keys(data.roles);
  const customRoles = roleKeys.filter((r) => (data.roles[r].scope || '').startsWith('Custom role'));
  const box = document.getElementById('tab-body');
  box.innerHTML = `
    ${customRoles.length ? `<div class="note" style="margin-bottom:4px">New role(s) synced from the HRIS with nothing configured yet: <b>${customRoles.map(esc).join(', ')}</b>. Grant screens and capabilities below.</div>` : ''}
    ${matrixTableHtml('Screen access', data.screenRows, roleKeys, data.roles, 'screen:', (role, key) => role.screens.includes(key))}
    ${matrixTableHtml('Capabilities', data.permRows, roleKeys, data.roles, '', (role, key) => role.permissions.includes(key))}
  `;

  [...box.querySelectorAll('input[type=checkbox]')].forEach((cb) => cb.addEventListener('change', async () => {
    cb.disabled = true;
    try {
      await Api.put('/admin/matrix', { role_key: cb.dataset.role, permission_key: cb.dataset.perm, granted: cb.checked });
      Api.toast('Permission updated');
    } catch (err) {
      cb.checked = !cb.checked;
      Api.toast(err.message, true);
    } finally {
      cb.disabled = false;
    }
  }));
}

async function renderOrgUnits() {
  const { data } = await Api.get('/admin/org-units');
  const box = document.getElementById('tab-body');
  box.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Name</th><th>Kind</th><th>Cost centre</th><th>Duty station</th><th>Lead</th><th>Headcount</th>
  </tr></thead><tbody>${data.map((o) => `<tr>
    <td>${esc(o.name)}</td><td>${esc(o.kind || '—')}</td><td>${esc(o.cost_centre || '—')}</td>
    <td>${esc(o.duty_station || '—')}</td><td>${esc(o.lead_name || '—')}</td><td>${o.current_headcount}</td>
  </tr>`).join('') || '<tr><td colspan="6">No org units synced yet</td></tr>'}</tbody></table></div>
  <p class="field-hint" style="margin-top:12px">Read-only mirror of the HRIS's own organisational structure.</p>`;
}

async function renderPolicy() {
  const { data } = await Api.get('/admin/policy');
  const box = document.getElementById('tab-body');
  box.innerHTML = `<div style="max-width:560px">
    <div class="form-grid">
      <label class="field">Off-hours fuel block<div class="row" style="margin-top:6px"><input type="checkbox" id="p-offhours" style="width:auto" ${data.block_offhours ? 'checked' : ''}/> <span class="faint">Decline fuel outside 06:00–19:00 unless a trip is open</span></div></label>
      <label class="field">Require odometer photo<div class="row" style="margin-top:6px"><input type="checkbox" id="p-odo" style="width:auto" ${data.require_odo_photo ? 'checked' : ''}/> <span class="faint">Driver must capture the dashboard reading</span></div></label>
      <label class="field">Geo-fence fuel stations<div class="row" style="margin-top:6px"><input type="checkbox" id="p-geofence" style="width:auto" ${data.geofence_stations ? 'checked' : ''}/> <span class="faint">Only approved supplier sites near the route</span></div></label>
      <label class="field">Auto-flag tank overfill<div class="row" style="margin-top:6px"><input type="checkbox" id="p-overfill" style="width:auto" ${data.autoflag_overfill ? 'checked' : ''}/> <span class="faint">Raise an exception when litres exceed tank capacity</span></div></label>
      <label class="field">Push verified fuel to Accounting<div class="row" style="margin-top:6px"><input type="checkbox" id="p-accounting" style="width:auto" ${data.push_to_accounting ? 'checked' : ''}/></div></label>
    </div>
    <div class="form-grid" style="margin-top:8px">
      <label class="field">Variance threshold (%)<input type="number" id="p-variance" value="${data.variance_threshold_pct}"/></label>
      <label class="field">Idle threshold (minutes)<input type="number" id="p-idle" value="${data.idle_threshold_min}"/></label>
      <label class="field">Fuel price ceiling (E/L)<input type="number" step="0.01" id="p-price" value="${data.price_ceiling}"/></label>
    </div>
    <button class="btn btn-primary" id="p-save" style="margin-top:14px">Save policy</button>
  </div>`;

  document.getElementById('p-save').addEventListener('click', async (e) => {
    await Api.withLoading(e.currentTarget, 'Saving…', async () => {
      await Api.put('/admin/policy', {
        block_offhours: document.getElementById('p-offhours').checked,
        require_odo_photo: document.getElementById('p-odo').checked,
        geofence_stations: document.getElementById('p-geofence').checked,
        autoflag_overfill: document.getElementById('p-overfill').checked,
        push_to_accounting: document.getElementById('p-accounting').checked,
        variance_threshold_pct: document.getElementById('p-variance').value,
        idle_threshold_min: document.getElementById('p-idle').value,
        price_ceiling: document.getElementById('p-price').value,
      });
      Api.toast('Fuel policy saved');
    });
  });
}

async function renderBranding() {
  const { data } = await Api.get('/branding');
  const box = document.getElementById('tab-body');
  box.innerHTML = `<div style="max-width:520px">
    <div class="form-row"><label>Organisation name</label>
      <div class="row" style="gap:8px"><input type="text" id="b-org-name" value="${esc(data.org_name)}"/>
        <button class="btn btn-ghost btn-sm" id="b-org-save">Save</button></div>
    </div>
    <div class="divider"></div>
    <div class="form-row"><label>Logo</label>
      <div class="row" style="gap:14px;align-items:center">
        ${data.logo_url ? `<img src="${esc(data.logo_url)}" alt="Logo" style="height:44px;width:auto;object-fit:contain;border:1px solid var(--color-neutral-200)">` : '<span class="faint">Using the default mark — no logo uploaded</span>'}
      </div>
      <input type="file" id="b-logo-file" accept="image/*" style="margin-top:8px"/>
      <button class="btn btn-ghost btn-sm" id="b-logo-upload" style="margin-top:8px;width:fit-content">Upload logo</button>
    </div>
    <div class="divider"></div>
    <div class="form-row"><label>Favicon</label>
      <div class="row" style="gap:14px;align-items:center">
        ${data.favicon_url ? `<img src="${esc(data.favicon_url)}" alt="Favicon" style="height:24px;width:24px;object-fit:contain;border:1px solid var(--color-neutral-200)">` : '<span class="faint">Using the default browser-tab icon</span>'}
      </div>
      <input type="file" id="b-favicon-file" accept="image/*" style="margin-top:8px"/>
      <button class="btn btn-ghost btn-sm" id="b-favicon-upload" style="margin-top:8px;width:fit-content">Upload favicon</button>
    </div>
    <p class="field-hint" style="margin-top:14px">Branding changes here apply everywhere — the login page, sidebar and topbar all read from this same setting.</p>
  </div>`;

  document.getElementById('b-org-save').addEventListener('click', async (e) => {
    await Api.withLoading(e.currentTarget, 'Saving…', async () => {
      await fetch('/api/v1/branding/org-name', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ org_name: document.getElementById('b-org-name').value.trim() }),
      });
      brandingCache = null; // force shell.js to re-fetch on next page load
      Api.toast('Organisation name saved');
    });
  });

  document.getElementById('b-logo-upload').addEventListener('click', async (e) => {
    const file = document.getElementById('b-logo-file').files[0];
    if (!file) { Api.toast('Choose an image file first', true); return; }
    const form = new FormData();
    form.append('logo', file);
    await Api.withLoading(e.currentTarget, 'Uploading…', async () => {
      await Api.postForm('/branding/logo', form);
      brandingCache = null;
      Api.toast('Logo uploaded');
      renderBranding();
    });
  });

  document.getElementById('b-favicon-upload').addEventListener('click', async (e) => {
    const file = document.getElementById('b-favicon-file').files[0];
    if (!file) { Api.toast('Choose an image file first', true); return; }
    const form = new FormData();
    form.append('favicon', file);
    await Api.withLoading(e.currentTarget, 'Uploading…', async () => {
      await Api.postForm('/branding/favicon', form);
      brandingCache = null;
      Api.toast('Favicon uploaded');
      renderBranding();
    });
  });
}

const TABS = { users: renderUsers, matrix: renderMatrix, orgunits: renderOrgUnits, policy: renderPolicy, branding: renderBranding };
const TAB_LABELS = { users: 'Users', matrix: 'Permission matrix', orgunits: 'Org units', policy: 'Fuel policy', branding: 'Branding' };

function renderTabs() {
  document.getElementById('tabs').innerHTML = Object.keys(TABS).map((k) =>
    `<div class="tab ${k === activeTab ? 'active' : ''}" data-tab="${k}">${esc(TAB_LABELS[k])}</div>`
  ).join('');
  [...document.querySelectorAll('[data-tab]')].forEach((el) => el.addEventListener('click', () => {
    activeTab = el.dataset.tab;
    renderTabs();
    TABS[activeTab]();
  }));
}

(async () => {
  await Shell.init('admin');
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Users &amp; permissions</h1>
      <p class="page-sub">Roles are synced from the HRIS. Manage the permission matrix and fuel/dispatch policy here.</p></div>
      <button class="btn btn-ghost" id="reconcile-btn">Reconcile from HRIS now</button></div>
    <div class="tabs" id="tabs"></div>
    <div class="card" id="tab-body"></div>`;

  document.getElementById('reconcile-btn').addEventListener('click', async (e) => {
    await Api.withLoading(e.currentTarget, 'Reconciling…', async () => {
      const { data } = await Api.post('/admin/reconcile');
      Api.toast(`Synced ${data.employees} employees, ${data.orgUnits} org units — screen updated live`);
      if (data.newRoles && data.newRoles.length) {
        Api.toast(`New role(s) found: ${data.newRoles.join(', ')} — configure them on the Permission matrix tab`, true);
      }
      TABS[activeTab]();
    });
  });

  renderTabs();
  await TABS[activeTab]();
})();
