const SETTINGS_MODULES = [
  'people', 'org', 'worktime', 'attendance', 'leave', 'benefits', 'payroll',
  'recruitment', 'performance', 'succession', 'training', 'intake', 'crm', 'reports', 'voip', 'assets',
];

// Employee-number format lives in the Branding tab's "Organisation identity" card now, not here
// — it's a first-run decision (see renderBranding), not a general org setting to discover later.
const APP_SETTING_FIELDS = [
  { key: 'payroll_cutoff_day', label: 'Payroll cut-off (day of month)' },
  { key: 'leave_cycle', label: 'Leave cycle' },
  { key: 'session_lifetime_hours', label: 'Session lifetime (hours)' },
  { key: 'reauth_modules', label: 'Re-authenticate for writes to (comma-separated modules)' },
  { key: 'lockout_attempts', label: 'Lockout after (attempts)' },
  { key: 'lockout_window_minutes', label: 'Lockout window (minutes)' },
];

(async () => {
  const shellData = await Shell.init('settings');
  const root = document.getElementById('settings-root');

  const isAdmin = shellData.user.role === 'HR administrator' || shellData.user.role === 'System administrator';

  // Security (MFA enrollment) is every user's own account setting — only the other tabs
  // (permission matrix, roles, overrides, branding, org-wide config) are admin-only.
  root.innerHTML = `
    <div class="tabs" id="settings-tabs">
      ${isAdmin ? `
        <div class="tab active" data-key="matrix">Permission matrix</div>
        <div class="tab" data-key="roles">Roles &amp; logins</div>
        <div class="tab" data-key="overrides">Overrides</div>
        <div class="tab" data-key="notifications">Notifications</div>
        <div class="tab" data-key="branding">Branding</div>
      ` : ''}
      <div class="tab ${isAdmin ? '' : 'active'}" data-key="security">Security</div>
      ${isAdmin ? `<div class="tab" data-key="org">Org settings</div>` : ''}
    </div>
    <div id="settings-content"></div>
  `;
  const contentEl = document.getElementById('settings-content');

  // ---------- Permission matrix ----------
  async function renderMatrix() {
    contentEl.innerHTML = '<div class="card"><span class="spinner"></span> Loading…</div>';
    const { data } = await Api.get('/access/matrix');
    let selectedRoleId = data.matrix[0].role.id;

    function renderRoleTable() {
      const roleEntry = data.matrix.find((m) => m.role.id === Number(selectedRoleId));
      const rows = roleEntry.modules.map((m) => `
        <tr data-module="${m.module}">
          <td>${m.module}</td>
          <td><input type="checkbox" data-flag="can_create" ${m.can_create ? 'checked' : ''} /></td>
          <td><input type="checkbox" data-flag="can_read" ${m.can_read ? 'checked' : ''} /></td>
          <td><input type="checkbox" data-flag="can_update" ${m.can_update ? 'checked' : ''} /></td>
          <td><input type="checkbox" data-flag="can_delete" ${m.can_delete ? 'checked' : ''} /></td>
          <td>
            <select data-flag="data_scope">
              ${['self', 'team', 'department', 'organisation', 'programme'].map((s) => `<option value="${s}" ${s === m.data_scope ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td><button class="btn btn-ghost btn-sm save-row">Save</button></td>
        </tr>`).join('');

      contentEl.innerHTML = `
        <div class="card">
          <div class="toolbar">
            <label style="font-weight:600;font-size:13px">Role</label>
            <select id="role-select">${data.matrix.map((m) => `<option value="${m.role.id}" ${m.role.id === selectedRoleId ? 'selected' : ''}>${m.role.name}</option>`).join('')}</select>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Module</th><th>C</th><th>R</th><th>U</th><th>D</th><th>Data scope</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;

      document.getElementById('role-select').addEventListener('change', (e) => { selectedRoleId = Number(e.target.value); renderRoleTable(); });

      contentEl.querySelectorAll('tbody tr').forEach((tr) => {
        const saveBtn = tr.querySelector('.save-row');
        saveBtn.addEventListener('click', async () => {
          const mod = tr.dataset.module;
          const body = {
            can_create: tr.querySelector('[data-flag="can_create"]').checked,
            can_read: tr.querySelector('[data-flag="can_read"]').checked,
            can_update: tr.querySelector('[data-flag="can_update"]').checked,
            can_delete: tr.querySelector('[data-flag="can_delete"]').checked,
            data_scope: tr.querySelector('[data-flag="data_scope"]').value,
          };
          try {
            await Api.withLoading(saveBtn, 'Saving…', () => Api.put(`/access/matrix/${selectedRoleId}/${mod}`, body));
            Api.toast(`Updated ${mod}`, 'success');
          } catch (err) { /* toast already shown by Api */ }
        });
      });
    }

    renderRoleTable();
  }

  // ---------- Overrides ----------
  async function renderOverrides() {
    contentEl.innerHTML = '<div class="card"><span class="spinner"></span> Loading…</div>';
    const { data } = await Api.get('/access/overrides');
    const rows = data.map((o) => `
      <tr>
        <td>${o.full_legal_name} <span class="faint">(${o.employee_no})</span></td>
        <td>${o.module}</td>
        <td>${o.crud}</td>
        <td>${o.reason}</td>
        <td>${o.expires_at || '—'}</td>
        <td>${o.granted_by_name || '—'}</td>
        <td><button class="btn btn-ghost btn-sm" data-del="${o.id}">Remove</button></td>
      </tr>`).join('');

    contentEl.innerHTML = `
      <div class="card">
        <div class="row between"><h3>Active overrides</h3><button class="btn btn-primary btn-sm" id="new-override-btn">+ Grant override</button></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Person</th><th>Module</th><th>CRUD</th><th>Reason</th><th>Expires</th><th>Granted by</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="faint">No overrides.</td></tr>'}</tbody>
        </table></div>
      </div>`;

    contentEl.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
      await Api.withLoading(btn, 'Removing…', () => Api.del(`/access/overrides/${btn.dataset.del}`));
      Api.toast('Override removed', 'success');
      renderOverrides();
    }));

    document.getElementById('new-override-btn').addEventListener('click', () => {
      FormDrawer.open({
        title: 'Grant an override',
        sub: 'A per-person, per-module exception to their role\'s default permission — always give a reason.',
        sections: [{
          label: 'Override',
          fields: [
            { key: 'employee_no', label: 'Employee number', type: 'text', value: '', required: true, hint: 'NRU-0009' },
            { key: 'module', label: 'Module', type: 'select', value: SETTINGS_MODULES[0], options: SETTINGS_MODULES },
            { key: 'crud', label: 'CRUD (e.g. CRUD, RU, R, -)', type: 'text', value: '', hint: 'R' },
            { key: 'expires_at', label: 'Expires (optional)', type: 'date', value: '' },
            { key: 'reason', label: 'Reason', type: 'text', value: '', required: true, hint: 'Temporary cover for...' },
          ],
        }],
        primaryLabel: 'Grant override',
        onSave: async (v) => {
          await Api.post('/access/overrides', { ...v, crud: v.crud || '-' });
          Api.toast('Override granted', 'success');
          renderOverrides();
        },
      });
    });
  }

  // ---------- Notifications ----------
  async function renderNotifications() {
    contentEl.innerHTML = '<div class="card"><span class="spinner"></span> Loading…</div>';
    const { data } = await Api.get('/settings/notifications');
    const rows = data.map((n) => `
      <tr>
        <td>${n.description}</td>
        <td><span class="badge badge-info">${n.channel}</span></td>
        <td><input type="checkbox" data-id="${n.id}" ${n.is_enabled ? 'checked' : ''} /></td>
      </tr>`).join('');
    contentEl.innerHTML = `<div class="card">
      <h3>Notification events</h3>
      <div class="table-wrap"><table><thead><tr><th>Event</th><th>Channel</th><th>Enabled</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
    contentEl.querySelectorAll('input[type=checkbox]').forEach((cb) => cb.addEventListener('change', async () => {
      cb.disabled = true;
      try {
        await Api.put(`/settings/notifications/${cb.dataset.id}`, { is_enabled: cb.checked });
        Api.toast('Saved', 'success');
      } finally {
        cb.disabled = false;
      }
    }));
  }

  // ---------- Org settings ----------
  async function renderOrgSettings() {
    contentEl.innerHTML = '<div class="card"><span class="spinner"></span> Loading…</div>';
    const { data } = await Api.get('/settings/app');
    contentEl.innerHTML = `<div class="card">
      <h3>Organisation settings</h3>
      <div class="form-grid">
        ${APP_SETTING_FIELDS.map((f) => `<div class="form-row"><label>${f.label}</label><input data-key="${f.key}" value="${data[f.key] || ''}" placeholder="${f.hint || ''}" />${f.hint ? `<div class="field-hint">${f.hint}</div>` : ''}</div>`).join('')}
      </div>
      <button class="btn btn-primary" id="org-settings-save">Save</button>
    </div>`;
    document.getElementById('org-settings-save').addEventListener('click', async (e) => {
      const settings = {};
      contentEl.querySelectorAll('[data-key]').forEach((el) => { settings[el.dataset.key] = el.value; });
      await Api.withLoading(e.currentTarget, 'Saving…', () => Api.put('/settings/app', { settings }));
      Api.toast('Settings saved', 'success');
    });
  }

  // ---------- Roles & logins ----------
  let rolesCache = [];

  async function renderRoles() {
    contentEl.innerHTML = '<div class="card"><span class="spinner"></span> Loading…</div>';
    const [{ data: roles }, { data: users }] = await Promise.all([Api.get('/access/roles'), Api.get('/access/users')]);
    rolesCache = roles;

    const roleRows = roles.map((r) => `
      <tr>
        <td>${r.name}</td>
        <td class="faint">${r.description || '—'}</td>
        <td>${r.user_count}</td>
        <td><button class="btn btn-ghost btn-sm" data-edit-role="${r.id}">Edit</button></td>
      </tr>`).join('');

    const now = new Date();
    const userRows = users.map((u) => {
      const isLocked = u.locked_until && new Date(u.locked_until) > now;
      const lockBadge = isLocked
        ? `<span class="badge badge-danger" title="${u.locked_until}">locked${u.failed_attempts >= 5 ? ' (auto)' : ''}</span>`
        : '';
      return `
      <tr>
        <td>${u.full_legal_name} <span class="faint">(${u.employee_no})</span></td>
        <td>${u.email}</td>
        <td>${u.role_name}</td>
        <td class="row" style="gap:6px"><span class="badge ${u.is_active ? 'badge-success' : 'badge-neutral'}">${u.is_active ? 'active' : 'suspended'}</span>${lockBadge}</td>
        <td class="faint">${u.last_login_at || 'never'}</td>
        <td class="row" style="gap:4px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" data-edit-user="${u.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-suspend-user="${u.id}" data-active="${u.is_active}">${u.is_active ? 'Suspend' : 'Reactivate'}</button>
          <button class="btn btn-ghost btn-sm" data-lock-user="${u.id}" data-locked="${isLocked ? 1 : 0}">${isLocked ? 'Unlock' : 'Lock'}</button>
          <button class="btn btn-ghost btn-sm" data-reset-user="${u.id}">Reset password</button>
        </td>
      </tr>`;
    }).join('');

    contentEl.innerHTML = `
      <div class="card">
        <div class="row between"><h3>Roles</h3><button class="btn btn-primary btn-sm" id="new-role-btn">+ New role</button></div>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Description</th><th>Logins</th><th></th></tr></thead>
          <tbody>${roleRows || '<tr><td colspan="4" class="faint">No roles.</td></tr>'}</tbody></table></div>
      </div>
      <div class="card">
        <div class="row between"><h3>User logins</h3><button class="btn btn-primary btn-sm" id="new-user-btn">+ New login</button></div>
        <div class="modal-note" style="margin-bottom:8px">Suspend blocks sign-in entirely. Lock is a manual hold (e.g. suspected compromise) separate from the automatic lock triggered by repeated failed passwords — Unlock releases either kind. Both take effect immediately, even on an already-open session.</div>
        <div class="table-wrap"><table><thead><tr><th>Person</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
          <tbody>${userRows || '<tr><td colspan="6" class="faint">No logins yet.</td></tr>'}</tbody></table></div>
      </div>`;

    contentEl.querySelectorAll('[data-edit-role]').forEach((btn) => btn.addEventListener('click', () => openRoleModal(roles.find((r) => r.id == btn.dataset.editRole))));
    contentEl.querySelectorAll('[data-edit-user]').forEach((btn) => btn.addEventListener('click', () => openUserModal(users.find((u) => u.id == btn.dataset.editUser))));
    document.getElementById('new-role-btn').addEventListener('click', () => openRoleModal(null));
    document.getElementById('new-user-btn').addEventListener('click', () => openUserModal(null));

    contentEl.querySelectorAll('[data-suspend-user]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const activeNow = btn.dataset.active === 'true';
        await Api.withLoading(btn, activeNow ? 'Suspending…' : 'Reactivating…', () =>
          Api.put(`/access/users/${btn.dataset.suspendUser}`, { is_active: !activeNow }));
        Api.toast(activeNow ? 'Login suspended' : 'Login reactivated', 'success');
        renderRoles();
      });
    });

    contentEl.querySelectorAll('[data-lock-user]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const lockedNow = btn.dataset.locked === '1';
        await Api.withLoading(btn, lockedNow ? 'Unlocking…' : 'Locking…', () =>
          Api.post(`/access/users/${btn.dataset.lockUser}/${lockedNow ? 'unlock' : 'lock'}`));
        Api.toast(lockedNow ? 'Login unlocked' : 'Login locked', 'success');
        renderRoles();
      });
    });

    contentEl.querySelectorAll('[data-reset-user]').forEach((btn) => {
      btn.addEventListener('click', () => openResetPasswordDrawer(users.find((u) => u.id == btn.dataset.resetUser)));
    });
  }

  function openResetPasswordDrawer(user) {
    FormDrawer.open({
      title: 'Reset password',
      sub: `${user.full_legal_name} (${user.employee_no}) — sets a new password and clears any lockout.`,
      sections: [{
        label: 'New password',
        fields: [{ key: 'password', label: 'New password', type: 'text', value: '', required: true, hint: 'At least 8 characters' }],
      }],
      primaryLabel: 'Reset password',
      onSave: async (v) => {
        if (!v.password || v.password.length < 8) throw new Error('Password must be at least 8 characters.');
        await Api.post(`/access/users/${user.id}/reset-password`, { password: v.password });
        Api.toast('Password reset', 'success');
        renderRoles();
      },
    });
  }

  function openRoleModal(role) {
    FormDrawer.open({
      title: role ? 'Edit role' : 'New role',
      sections: [{
        label: 'Role',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: role ? role.name : '', required: true },
          { key: 'description', label: 'Description', type: 'textarea', value: role ? (role.description || '') : '' },
        ],
      }],
      primaryLabel: role ? 'Save changes' : 'Create role',
      onSave: async (v) => {
        const body = { name: v.name, description: v.description || null };
        if (role) await Api.put(`/access/roles/${role.id}`, body);
        else await Api.post('/access/roles', body);
        Api.toast(role ? 'Role updated' : 'Role created', 'success');
        renderRoles();
      },
      onDelete: (role && role.user_count === 0) ? async () => {
        await Api.del(`/access/roles/${role.id}`);
        Api.toast('Role deleted', 'success');
        renderRoles();
      } : undefined,
      deleteLabel: 'Delete role',
    });
  }

  function openUserModal(user) {
    FormDrawer.open({
      title: user ? 'Edit login' : 'New login',
      sub: user ? `${user.full_legal_name} (${user.employee_no})` : 'Grants an existing person record access to sign in.',
      sections: [{
        label: 'Login',
        fields: [
          ...(user ? [] : [{ key: 'employee_no', label: 'Employee number', type: 'text', value: '', required: true, hint: 'NRU-0009' }]),
          { key: 'email', label: 'Email', type: 'email', value: user ? user.email : '', required: true },
          { key: 'role_id', label: 'Role', type: 'select', value: user ? user.role_id : rolesCache[0]?.id, numeric: true, options: rolesCache.map((r) => ({ value: r.id, label: r.name })) },
          { key: 'password', label: user ? 'New password (leave blank to keep current)' : 'Password', type: 'text', value: '', required: !user },
          ...(user ? [{ key: 'is_active', label: 'Active', type: 'checkbox', value: !!user.is_active }] : []),
        ],
      }],
      primaryLabel: user ? 'Save changes' : 'Create login',
      onSave: async (v) => {
        if (user) {
          const body = { email: v.email, role_id: v.role_id, is_active: v.is_active };
          if (v.password) body.password = v.password;
          await Api.put(`/access/users/${user.id}`, body);
        } else {
          await Api.post('/access/users', { employee_no: v.employee_no, email: v.email, password: v.password, role_id: v.role_id });
        }
        Api.toast(user ? 'Login updated' : 'Login created', 'success');
        renderRoles();
      },
      onDelete: user ? async () => {
        await Api.del(`/access/users/${user.id}`);
        Api.toast('Login removed', 'success');
        renderRoles();
      } : undefined,
      deleteLabel: 'Remove login',
    });
  }

  // ---------- Branding ----------
  async function renderBranding() {
    contentEl.innerHTML = '<div class="card"><span class="spinner"></span> Loading…</div>';
    // fresh fetch (not the page-load-cached Api.getBranding()) so re-renders after upload show
    // the new file. Employee-numbering fields live in this same card (see below), so pull
    // /settings/app too; /people gives a cheap live count for the "already in use" hint — this
    // org is small enough (a few dozen people) that fetching the full list is fine.
    const [{ data: branding }, { data: appSettings }, { data: people }] = await Promise.all([
      Api.get('/branding'),
      Api.get('/settings/app'),
      Api.get('/people').catch(() => ({ data: [] })),
    ]);
    const employeeCount = people.length;
    contentEl.innerHTML = `
      <div class="card">
        <h3>Organisation identity</h3>
        <div class="modal-note" style="margin-bottom:12px">Shown throughout the app — sidebar, header, sign-in page and every report/export letterhead.${branding.is_configured ? '' : ' <strong>Not set up yet</strong> — this is a placeholder name.'}</div>
        <div class="form-row" style="max-width:420px"><label>Organisation name</label><input id="org-name-input" value="${branding.org_name}" /></div>
        <button class="btn btn-primary btn-sm" id="org-name-save">Save</button>
        <div class="divider" style="margin:16px 0"></div>
        <h3 style="margin-top:0">Employee numbering</h3>
        <div class="modal-note" style="margin-bottom:12px">
          Decide this at first-run setup, ideally before adding your first employee.
          <strong>Only affects new employees going forward — existing employee numbers are never changed</strong>,
          so changing this later produces an inconsistent-looking sequence rather than a broken one.
          ${employeeCount ? `${employeeCount} employee${employeeCount === 1 ? '' : 's'} already use${employeeCount === 1 ? 's' : ''} the current format.` : 'No employees yet — this is the ideal time to set it.'}
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Employee number prefix</label><input data-key="employee_no_prefix" id="empno-prefix-input" value="${appSettings.employee_no_prefix || ''}" placeholder='e.g. "EMP" — new hires get EMP-0001, EMP-0002…' /></div>
          <div class="form-row"><label>Employee number digits</label><input data-key="employee_no_padding" id="empno-padding-input" value="${appSettings.employee_no_padding || ''}" placeholder='e.g. "4" for 0001, "5" for 00001' /></div>
        </div>
        <button class="btn btn-primary btn-sm" id="empno-save">Save</button>
      </div>
      <div class="card">
        <h3>Logo</h3>
        <div class="modal-note" style="margin-bottom:12px">Shown in the sidebar, header and sign-in page. PNG, JPEG, WebP, GIF or SVG, up to 2MB.</div>
        <div class="row" style="gap:16px;align-items:flex-end;flex-wrap:wrap">
          <img src="${branding.logo_url}" alt="Current logo" style="height:56px;width:auto;border:1px solid var(--color-neutral-200);padding:6px;background:#fff" />
          <div class="form-row" style="margin-bottom:0"><label>Replace logo</label><input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" /></div>
          <button class="btn btn-primary btn-sm" id="logo-upload-btn">Upload</button>
          ${branding.is_default_logo ? '' : '<button class="btn btn-ghost btn-sm" id="logo-reset-btn" style="color:var(--color-danger)">Reset to default</button>'}
        </div>
      </div>
      <div class="card">
        <h3>Favicon</h3>
        <div class="modal-note" style="margin-bottom:12px">Shown in the browser tab. Small square PNG or ICO works best.</div>
        <div class="row" style="gap:16px;align-items:flex-end;flex-wrap:wrap">
          ${branding.favicon_url ? `<img src="${branding.favicon_url}" alt="Current favicon" style="height:32px;width:32px;object-fit:contain;border:1px solid var(--color-neutral-200);padding:4px;background:#fff" />` : '<span class="faint">Using browser default</span>'}
          <div class="form-row" style="margin-bottom:0"><label>Replace favicon</label><input type="file" id="favicon-file" accept="image/png,image/x-icon,image/vnd.microsoft.icon" /></div>
          <button class="btn btn-primary btn-sm" id="favicon-upload-btn">Upload</button>
          ${branding.favicon_url ? '<button class="btn btn-ghost btn-sm" id="favicon-reset-btn" style="color:var(--color-danger)">Remove</button>' : ''}
        </div>
      </div>`;

    document.getElementById('org-name-save').addEventListener('click', async (e) => {
      const value = document.getElementById('org-name-input').value.trim();
      if (!value) return Api.toast('Organisation name cannot be empty', 'error');
      try {
        await Api.withLoading(e.currentTarget, 'Saving…', () => Api.put('/settings/app', { settings: { org_name: value } }));
        Api.toast('Organisation name saved', 'success');
        renderBranding();
      } catch (err) { Api.toast(err.message, 'error'); }
    });

    document.getElementById('empno-save').addEventListener('click', async (e) => {
      const prefix = document.getElementById('empno-prefix-input').value.trim();
      const padding = document.getElementById('empno-padding-input').value.trim();
      if (!prefix) return Api.toast('Employee number prefix cannot be empty', 'error');
      if (!padding || !/^\d+$/.test(padding)) return Api.toast('Employee number digits must be a whole number', 'error');
      try {
        await Api.withLoading(e.currentTarget, 'Saving…', () =>
          Api.put('/settings/app', { settings: { employee_no_prefix: prefix, employee_no_padding: padding } }));
        Api.toast('Employee numbering saved', 'success');
        renderBranding();
      } catch (err) { Api.toast(err.message, 'error'); }
    });

    // NOTE: these two use raw fetch (not Api.request) because the body is FormData, not JSON —
    // so, unlike every other action on this page, errors here are NOT auto-toasted by api.js and
    // MUST be caught and surfaced here explicitly. Previously this had no try/catch at all: a
    // failed upload (wrong role, oversized file, server error) threw inside the async handler,
    // which just became a silent unhandled promise rejection — no toast, no visible error, button
    // simply stopped spinning as if nothing happened.
    document.getElementById('logo-upload-btn').addEventListener('click', async (e) => {
      const file = document.getElementById('logo-file').files[0];
      if (!file) { Api.toast('Choose a file first', 'error'); return; }
      const form = new FormData();
      form.append('logo', file);
      try {
        await Api.withLoading(e.currentTarget, 'Uploading…', async () => {
          const res = await fetch('/api/v1/branding/logo', { method: 'POST', body: form, credentials: 'same-origin' });
          if (!res.ok) {
            const payload = await res.json().catch(() => null);
            throw new Error((payload && payload.error) || `Upload failed (${res.status})`);
          }
        });
        Api.toast('Logo updated', 'success');
        renderBranding();
      } catch (err) { Api.toast(err.message, 'error'); }
    });

    const resetLogoBtn = document.getElementById('logo-reset-btn');
    if (resetLogoBtn) resetLogoBtn.addEventListener('click', async (e) => {
      try {
        await Api.withLoading(e.currentTarget, 'Resetting…', () => Api.del('/branding/logo'));
        Api.toast('Logo reset to default', 'success');
        renderBranding();
      } catch (err) { Api.toast(err.message, 'error'); }
    });

    document.getElementById('favicon-upload-btn').addEventListener('click', async (e) => {
      const file = document.getElementById('favicon-file').files[0];
      if (!file) { Api.toast('Choose a file first', 'error'); return; }
      const form = new FormData();
      form.append('favicon', file);
      try {
        await Api.withLoading(e.currentTarget, 'Uploading…', async () => {
          const res = await fetch('/api/v1/branding/favicon', { method: 'POST', body: form, credentials: 'same-origin' });
          if (!res.ok) {
            const payload = await res.json().catch(() => null);
            throw new Error((payload && payload.error) || `Upload failed (${res.status})`);
          }
        });
        Api.toast('Favicon updated', 'success');
        renderBranding();
      } catch (err) { Api.toast(err.message, 'error'); }
    });

    const resetFaviconBtn = document.getElementById('favicon-reset-btn');
    if (resetFaviconBtn) resetFaviconBtn.addEventListener('click', async (e) => {
      try {
        await Api.withLoading(e.currentTarget, 'Removing…', () => Api.del('/branding/favicon'));
        Api.toast('Favicon removed', 'success');
        renderBranding();
      } catch (err) { Api.toast(err.message, 'error'); }
    });
  }

  // ---------- Security (self-service MFA enrollment) ----------
  async function renderSecurity() {
    contentEl.innerHTML = '<div class="card"><span class="spinner"></span> Loading…</div>';
    const { data } = await Api.get('/mfa/status');

    contentEl.innerHTML = `
      <div class="card">
        <h3>Authenticator app</h3>
        <div class="modal-note" style="margin-bottom:12px">Use Google Authenticator, Microsoft Authenticator, Authy or similar. A 6-digit code from the app is required at sign-in once enabled.</div>
        <div id="totp-status"></div>
      </div>
      <div class="card">
        <h3>Email codes</h3>
        <div class="modal-note" style="margin-bottom:12px">A 6-digit code is emailed to you at sign-in.</div>
        <div id="email-otp-status"></div>
      </div>
      ${data.totp_enabled ? `
      <div class="card">
        <h3>Backup codes</h3>
        <div class="modal-note" style="margin-bottom:12px">${data.backup_codes_remaining} unused code(s) remaining. Each works once, for when you don't have your authenticator app.</div>
        <button class="btn btn-ghost btn-sm" id="regen-backup-btn">Regenerate backup codes</button>
      </div>` : ''}
    `;

    // -- TOTP --
    const totpStatusEl = document.getElementById('totp-status');
    if (data.totp_enabled) {
      totpStatusEl.innerHTML = `
        <div class="row" style="gap:10px"><span class="badge badge-success">Enabled</span></div>
        <button class="btn btn-ghost btn-sm" id="totp-disable-btn" style="margin-top:10px;color:var(--color-danger)">Disable</button>`;
      document.getElementById('totp-disable-btn').addEventListener('click', () => {
        FormDrawer.open({
          title: 'Disable authenticator app',
          sub: 'Confirm your password to turn this off. Your backup codes will also be cleared.',
          sections: [{ label: 'Confirm', fields: [{ key: 'password', label: 'Password', type: 'text', value: '', required: true }] }],
          primaryLabel: 'Disable',
          onSave: async (v) => {
            await Api.post('/mfa/totp/disable', { password: v.password });
            Api.toast('Authenticator app disabled', 'success');
            renderSecurity();
          },
        });
      });
    } else {
      totpStatusEl.innerHTML = `<span class="badge badge-neutral">Not enabled</span><br /><button class="btn btn-primary btn-sm" id="totp-enable-btn" style="margin-top:10px">Set up authenticator app</button>`;
      document.getElementById('totp-enable-btn').addEventListener('click', startTotpEnroll);
    }

    // -- Email OTP --
    const emailStatusEl = document.getElementById('email-otp-status');
    if (data.email_otp_enabled) {
      emailStatusEl.innerHTML = `
        <div class="row" style="gap:10px"><span class="badge badge-success">Enabled</span></div>
        <button class="btn btn-ghost btn-sm" id="email-disable-btn" style="margin-top:10px;color:var(--color-danger)">Disable</button>`;
      document.getElementById('email-disable-btn').addEventListener('click', () => {
        FormDrawer.open({
          title: 'Disable email codes',
          sub: 'Confirm your password to turn this off.',
          sections: [{ label: 'Confirm', fields: [{ key: 'password', label: 'Password', type: 'text', value: '', required: true }] }],
          primaryLabel: 'Disable',
          onSave: async (v) => {
            await Api.post('/mfa/email-otp/disable', { password: v.password });
            Api.toast('Email codes disabled', 'success');
            renderSecurity();
          },
        });
      });
    } else {
      emailStatusEl.innerHTML = `<span class="badge badge-neutral">Not enabled</span><br /><button class="btn btn-primary btn-sm" id="email-enable-btn" style="margin-top:10px">Set up email codes</button>`;
      document.getElementById('email-enable-btn').addEventListener('click', startEmailOtpEnroll);
    }

    const regenBtn = document.getElementById('regen-backup-btn');
    if (regenBtn) regenBtn.addEventListener('click', () => {
      FormDrawer.open({
        title: 'Regenerate backup codes',
        sub: 'Old codes stop working immediately. Confirm your password.',
        sections: [{ label: 'Confirm', fields: [{ key: 'password', label: 'Password', type: 'text', value: '', required: true }] }],
        primaryLabel: 'Regenerate',
        onSave: async (v) => {
          const res = await Api.post('/mfa/backup-codes/regenerate', { password: v.password });
          showBackupCodes(res.data.backupCodes);
          renderSecurity();
        },
      });
    });
  }

  function showBackupCodes(codes) {
    Drawer.open({
      title: 'Your backup codes',
      sub: 'Save these somewhere safe — each works once, and this is the only time they\'re shown.',
      groups: [{ label: 'Backup codes', fields: codes.map((c, i) => ({ label: `Code ${i + 1}`, value: c })) }],
    });
  }

  async function startTotpEnroll() {
    const setup = await Api.post('/mfa/totp/setup');
    FormDrawer.open({
      title: 'Set up authenticator app',
      sub: 'Scan this with Google Authenticator, Microsoft Authenticator, Authy or similar, then enter the 6-digit code it shows.',
      extraHtml: `
        <div class="drawer-group">
          <div style="text-align:center;padding:8px 0">
            <img src="${setup.data.qrCodeDataUrl}" alt="Authenticator QR code" style="width:180px;height:180px;border:1px solid var(--color-neutral-200)" />
          </div>
          <div class="field-hint">Can't scan? Enter this key manually: <strong style="font-family:monospace">${setup.data.secret}</strong></div>
        </div>`,
      sections: [{ label: 'Confirm', fields: [{ key: 'code', label: '6-digit code', type: 'text', value: '', required: true, hint: 'From your authenticator app' }] }],
      primaryLabel: 'Enable',
      onSave: async (v) => {
        const res = await Api.post('/mfa/totp/confirm', { code: v.code });
        Api.toast('Authenticator app enabled', 'success');
        showBackupCodes(res.data.backupCodes);
        renderSecurity();
      },
    });
  }

  async function startEmailOtpEnroll() {
    await Api.post('/mfa/email-otp/start');
    Api.toast('Code sent to your email', 'success');
    FormDrawer.open({
      title: 'Confirm email codes',
      sub: 'Enter the 6-digit code we just emailed you.',
      sections: [{ label: 'Confirm', fields: [{ key: 'code', label: '6-digit code', type: 'text', value: '', required: true }] }],
      primaryLabel: 'Enable',
      onSave: async (v) => {
        await Api.post('/mfa/email-otp/confirm', { code: v.code });
        Api.toast('Email codes enabled', 'success');
        renderSecurity();
      },
    });
  }

  const renderers = { matrix: renderMatrix, roles: renderRoles, overrides: renderOverrides, notifications: renderNotifications, branding: renderBranding, org: renderOrgSettings, security: renderSecurity };
  document.getElementById('settings-tabs').querySelectorAll('.tab').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#settings-tabs .tab').forEach((t) => t.classList.remove('active'));
      el.classList.add('active');
      renderers[el.dataset.key]();
    });
  });
  renderers[isAdmin ? 'matrix' : 'security']();
})();
