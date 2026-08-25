(async () => {
  const shellData = await Shell.init('directory');
  const scope = shellData.scope.people || {};
  const payrollScope = shellData.scope.payroll || {};
  const canCreate = !!scope.create;
  const canUpdate = !!scope.update;
  // Account provisioning (creating/managing app_user logins) is gated on role identity, same as
  // Settings > Roles & logins and every /api/v1/access/* route — not on the people:update scope
  // flag, which governs HR-record edits, a separate concern from who can sign in.
  const isAdmin = shellData.user.role === 'HR administrator' || shellData.user.role === 'System administrator';
  const money = (n) => 'E ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (canCreate) document.getElementById('new-person-btn').style.display = '';
  if (isAdmin) document.getElementById('migrate-users-btn').style.display = '';

  let rolesCache = [];
  async function ensureRoles() {
    if (!rolesCache.length) rolesCache = (await Api.get('/access/roles')).data;
    return rolesCache;
  }

  const qFromUrl = new URLSearchParams(location.search).get('q');
  if (qFromUrl) document.getElementById('q').value = qFromUrl;

  const deptFilter = document.getElementById('department-filter');
  let unitsCache = [];
  let peopleCache = [];
  try {
    unitsCache = (await Api.get('/org')).data;
    unitsCache.filter((u) => u.kind === 'department').forEach((u) => {
      deptFilter.insertAdjacentHTML('beforeend', `<option value="${u.id}">${u.name}</option>`);
    });
  } catch (e) { /* org may be out of scope for this role */ }

  let debounceTimer;
  async function load() {
    const params = new URLSearchParams();
    if (document.getElementById('q').value.trim()) params.set('q', document.getElementById('q').value.trim());
    if (deptFilter.value) params.set('department', deptFilter.value);
    if (document.getElementById('status-filter').value) params.set('status', document.getElementById('status-filter').value);

    const { data } = await Api.get('/people?' + params.toString());
    peopleCache = data;
    const tbody = document.querySelector('#people-table tbody');
    document.getElementById('people-empty').style.display = data.length ? 'none' : 'block';
    tbody.innerHTML = data.map((p) => `
      <tr class="clickable" data-id="${p.employee_no}">
        <td>${p.preferred_name || p.full_legal_name}</td>
        <td>${p.employee_no}</td>
        <td>${p.position_title || '—'}</td>
        <td>${p.department_name || '—'}</td>
        <td><span class="badge ${p.status === 'active' ? 'badge-success' : p.status === 'exited' ? 'badge-neutral' : 'badge-warning'}">${(p.status || '').replace('_', ' ')}</span></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openPersonDrawer(tr.dataset.id)));
  }

  document.getElementById('q').addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(load, 250); });
  deptFilter.addEventListener('change', load);
  document.getElementById('status-filter').addEventListener('change', load);

  function departmentOptions(selected) {
    return [{ value: '', label: '— None yet —' }, ...unitsCache.filter((u) => u.kind === 'department').map((u) => ({ value: u.id, label: u.name }))];
  }

  async function managerOptions(excludeEmployeeNo) {
    if (!peopleCache.length) { try { peopleCache = (await Api.get('/people')).data; } catch (e) { peopleCache = []; } }
    return [{ value: '', label: '— No manager —' }, ...peopleCache.filter((p) => p.employee_no !== excludeEmployeeNo).map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` }))];
  }

  // ---- Add employee (drawer) ----
  document.getElementById('new-person-btn').addEventListener('click', async () => {
    const mgrOptions = await managerOptions(null);
    FormDrawer.open({
      title: 'Add employee',
      sub: 'Creates the master person record — every other system (leave, payroll, access, VoIP) reads from this.',
      sections: [
        {
          label: 'Personal details',
          fields: [
            { key: 'full_legal_name', label: 'Full legal name', type: 'text', value: '', required: true, hint: 'As it appears on official documents' },
            { key: 'preferred_name', label: 'Preferred name', type: 'text', value: '' },
            { key: 'national_id', label: 'National ID', type: 'text', value: '' },
            { key: 'date_of_birth', label: 'Date of birth', type: 'date', value: '' },
            { key: 'gender', label: 'Gender', type: 'text', value: '' },
            { key: 'nationality', label: 'Nationality', type: 'text', value: '' },
            { key: 'marital_status', label: 'Marital status', type: 'text', value: '' },
            { key: 'languages', label: 'Languages', type: 'text', value: '', hint: 'e.g. siSwati, English' },
            { key: 'email', label: 'Email', type: 'email', value: '' },
            { key: 'phone', label: 'Phone', type: 'text', value: '' },
            { key: 'address', label: 'Address', type: 'text', value: '' },
            { key: 'next_of_kin_name', label: 'Next of kin', type: 'text', value: '' },
            { key: 'next_of_kin_relationship', label: 'Relationship', type: 'text', value: '' },
            { key: 'next_of_kin_phone', label: 'Next of kin phone', type: 'text', value: '' },
          ],
        },
        {
          label: 'Employment',
          fields: [
            { key: 'position_title', label: 'Position title', type: 'text', value: '', required: true, hint: 'e.g. Programme Officer' },
            { key: 'department_org_unit_id', label: 'Department', type: 'select', value: '', options: departmentOptions(), numeric: true },
            { key: 'duty_station', label: 'Duty station', type: 'text', value: '', hint: 'e.g. Mbabane' },
            { key: 'grade', label: 'Grade', type: 'text', value: '', hint: 'e.g. G6' },
            { key: 'cost_centre', label: 'Cost centre', type: 'text', value: '' },
            { key: 'contract_type', label: 'Contract type', type: 'select', value: 'permanent', options: [{ value: 'permanent', label: 'Permanent' }, { value: 'fixed_term', label: 'Fixed term' }, { value: 'consultant', label: 'Consultant' }, { value: 'intern', label: 'Intern' }] },
            { key: 'start_date', label: 'Start date', type: 'date', value: new Date().toISOString().slice(0, 10), required: true },
            { key: 'reports_to_employee_no', label: 'Reports to', type: 'select', value: '', options: mgrOptions },
            // Only offered to whoever can actually set a starting salary — setting a new hire's pay
            // is a payroll:create action, not a plain people:create one, same distinction the
            // backend enforces (basic_salary is stripped from GET /people/:id unless the viewer's
            // PAYROLL scope reaches that person, regardless of their people-module access).
            ...(payrollScope.create ? [{ key: 'basic_salary', label: 'Basic salary', type: 'number', value: '', hint: 'Monthly base pay — feeds their first payroll run automatically' }] : []),
          ],
        },
      ],
      primaryLabel: 'Create employee',
      onSave: async (v) => {
        const { data: person } = await Api.post('/people', {
          full_legal_name: v.full_legal_name, preferred_name: v.preferred_name, national_id: v.national_id,
          date_of_birth: v.date_of_birth, gender: v.gender, nationality: v.nationality, marital_status: v.marital_status,
          languages: v.languages, email: v.email, phone: v.phone, address: v.address,
          next_of_kin_name: v.next_of_kin_name, next_of_kin_relationship: v.next_of_kin_relationship, next_of_kin_phone: v.next_of_kin_phone,
        });
        await Api.post(`/people/${person.employee_no}/employment`, {
          position_title: v.position_title, department_org_unit_id: v.department_org_unit_id, duty_station: v.duty_station,
          grade: v.grade, cost_centre: v.cost_centre, contract_type: v.contract_type, start_date: v.start_date,
          reports_to_employee_no: v.reports_to_employee_no,
          ...(payrollScope.create && v.basic_salary != null ? { basic_salary: v.basic_salary } : {}),
        });
        Api.toast('Employee created', 'success');
        peopleCache = [];
        load();
      },
    });
  });

  // ---- View / edit a person (drawer) ----
  async function openPersonDrawer(employeeNo) {
    let person;
    try {
      person = (await Api.get(`/people/${employeeNo}`)).data;
    } catch (err) {
      Api.toast(err.message, 'error');
      return;
    }
    const current = (person.employment || []).find((e) => e.is_current) || person.employment[0] || {};
    const canEditThis = canUpdate; // /people list is already scope-filtered, so presence here + module update flag is sufficient
    const mgrOptions = canEditThis ? await managerOptions(employeeNo) : [];

    // "Manage them as a user, on top of them being employees" — surfaces whether this person has
    // a login right here, instead of requiring a trip to Settings > Roles & logins and hunting
    // for them by name in a flat list.
    let login = null;
    let roles = [];
    if (isAdmin) {
      try {
        const [{ data: users }, r] = await Promise.all([Api.get('/access/users'), ensureRoles()]);
        login = users.find((u) => u.employee_no === employeeNo) || null;
        roles = r;
      } catch (e) { /* non-fatal — the drawer still works without the account-access section */ }
    }

    FormDrawer.open({
      title: person.preferred_name || person.full_legal_name,
      sub: [person.employee_no, current.position_title, current.department_name].filter(Boolean).join(' · '),
      readOnly: !canEditThis,
      sections: [
        {
          label: 'Personal details',
          fields: [
            { key: 'full_legal_name', label: 'Full legal name', type: 'text', value: person.full_legal_name, required: true },
            { key: 'preferred_name', label: 'Preferred name', type: 'text', value: person.preferred_name },
            { key: 'email', label: 'Email', type: 'email', value: person.email },
            { key: 'phone', label: 'Phone', type: 'text', value: person.phone },
            { key: 'address', label: 'Address', type: 'text', value: person.address },
            { key: 'status', label: 'Employment status', type: 'select', value: person.status, options: [{ value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On leave' }, { value: 'suspended', label: 'Suspended' }, { value: 'exited', label: 'Exited' }] },
          ],
        },
        {
          label: 'Current position',
          fields: [
            { key: 'position_title', label: 'Job title', type: 'text', value: current.position_title, editable: false, hint: 'Change via a new employment record on the full profile' },
            { key: 'department_name', label: 'Department', type: 'text', value: current.department_name, editable: false },
            { key: 'reports_to_employee_no', label: 'Reports to', type: 'select', value: current.reports_to_employee_no || '', options: mgrOptions },
            // Absent entirely (not just masked) from `current` unless the viewer's payroll scope
            // reaches this person — see the GET /people/:id gate in people.routes.js.
            ...('basic_salary' in current ? [{ key: 'basic_salary_display', label: 'Basic salary', type: 'text', value: money(current.basic_salary || 0), editable: false, hint: 'Change via a new employment record on the full profile' }] : []),
          ],
        },
      ],
      extraHtml: `<a class="btn btn-ghost btn-sm" href="/employee.html?id=${encodeURIComponent(employeeNo)}">View full profile (leave, payroll, training, org chart) →</a>`
        + (isAdmin ? accountAccessHtml(login) : ''),
      afterRender: (root) => { if (isAdmin) wireAccountAccess(root, employeeNo, person, login, roles); },
      primaryLabel: 'Save changes',
      onSave: async (v) => {
        await Api.put(`/people/${employeeNo}`, {
          full_legal_name: v.full_legal_name, preferred_name: v.preferred_name, email: v.email, phone: v.phone,
          address: v.address, status: v.status,
        });
        if ((current.reports_to_employee_no || '') !== (v.reports_to_employee_no || '')) {
          await Api.patch(`/people/${employeeNo}/manager`, { reports_to_employee_no: v.reports_to_employee_no || null });
        }
        Api.toast('Profile updated', 'success');
        peopleCache = [];
        load();
      },
    });
  }

  function accountAccessHtml(login) {
    const isLocked = !!(login && login.locked_until && new Date(login.locked_until) > new Date());
    return `
      <div class="drawer-group">
        <div class="drawer-group-label">Account access</div>
        ${login ? `
          <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
            <span class="badge ${login.is_active ? 'badge-success' : 'badge-neutral'}">${login.is_active ? 'active' : 'suspended'}</span>
            ${isLocked ? '<span class="badge badge-danger">locked</span>' : ''}
            <span class="faint">${login.email} · ${login.role_name}</span>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="acct-edit">Edit role / email</button>
            <button class="btn btn-ghost btn-sm" id="acct-suspend" data-active="${login.is_active}">${login.is_active ? 'Suspend' : 'Reactivate'}</button>
            <button class="btn btn-ghost btn-sm" id="acct-lock" data-locked="${isLocked ? 1 : 0}">${isLocked ? 'Unlock' : 'Lock'}</button>
            <button class="btn btn-ghost btn-sm" id="acct-reset">Reset password</button>
            <button class="btn btn-ghost btn-sm" id="acct-remove" style="color:var(--color-danger)">Remove login</button>
          </div>` : `
          <div class="modal-note" style="margin-bottom:10px">This employee doesn't have a login yet.</div>
          <button class="btn btn-primary btn-sm" id="acct-create">Create login</button>`}
      </div>`;
  }

  function wireAccountAccess(root, employeeNo, person, login, roles) {
    const createBtn = root.querySelector('#acct-create');
    if (createBtn) createBtn.addEventListener('click', () => openUserAccountDrawer(person, null, roles, employeeNo));

    const editBtn = root.querySelector('#acct-edit');
    if (editBtn) editBtn.addEventListener('click', () => openUserAccountDrawer(person, login, roles, employeeNo));

    const suspendBtn = root.querySelector('#acct-suspend');
    if (suspendBtn) suspendBtn.addEventListener('click', async () => {
      const activeNow = suspendBtn.dataset.active === 'true';
      await Api.withLoading(suspendBtn, activeNow ? 'Suspending…' : 'Reactivating…', () => Api.put(`/access/users/${login.id}`, { is_active: !activeNow }));
      Api.toast(activeNow ? 'Login suspended' : 'Login reactivated', 'success');
      openPersonDrawer(employeeNo);
    });

    const lockBtn = root.querySelector('#acct-lock');
    if (lockBtn) lockBtn.addEventListener('click', async () => {
      const lockedNow = lockBtn.dataset.locked === '1';
      await Api.withLoading(lockBtn, lockedNow ? 'Unlocking…' : 'Locking…', () => Api.post(`/access/users/${login.id}/${lockedNow ? 'unlock' : 'lock'}`));
      Api.toast(lockedNow ? 'Login unlocked' : 'Login locked', 'success');
      openPersonDrawer(employeeNo);
    });

    const resetBtn = root.querySelector('#acct-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      FormDrawer.open({
        title: 'Reset password',
        sub: `${person.preferred_name || person.full_legal_name} (${employeeNo}) — sets a new password and clears any lockout.`,
        sections: [{ label: 'New password', fields: [{ key: 'password', label: 'New password', type: 'text', value: '', required: true, hint: 'At least 8 characters' }] }],
        primaryLabel: 'Reset password',
        onSave: async (v) => {
          if (!v.password || v.password.length < 8) throw new Error('Password must be at least 8 characters.');
          await Api.post(`/access/users/${login.id}/reset-password`, { password: v.password });
          Api.toast('Password reset', 'success');
          openPersonDrawer(employeeNo);
        },
      });
    });

    const removeBtn = root.querySelector('#acct-remove');
    if (removeBtn) removeBtn.addEventListener('click', async () => {
      if (!confirm('Remove this login? They will no longer be able to sign in.')) return;
      await Api.del(`/access/users/${login.id}`);
      Api.toast('Login removed', 'success');
      openPersonDrawer(employeeNo);
    });
  }

  function openUserAccountDrawer(person, login, roles, employeeNo) {
    const defaultRoleId = login ? login.role_id : (roles.find((r) => r.name === 'Employee') || roles[0] || {}).id;
    FormDrawer.open({
      title: login ? 'Edit login' : 'Create login',
      sub: `${person.preferred_name || person.full_legal_name} (${employeeNo})`,
      sections: [{
        label: 'Login',
        fields: [
          { key: 'email', label: 'Email', type: 'email', value: login ? login.email : (person.email || ''), required: true },
          { key: 'role_id', label: 'Role', type: 'select', value: defaultRoleId, numeric: true, options: roles.map((r) => ({ value: r.id, label: r.name })) },
          { key: 'password', label: login ? 'New password (leave blank to keep current)' : 'Temporary password', type: 'text', value: '', required: !login, hint: login ? undefined : 'At least 8 characters — share this with them after creating' },
        ],
      }],
      primaryLabel: login ? 'Save changes' : 'Create login',
      onSave: async (v) => {
        if (login) {
          const body = { email: v.email, role_id: v.role_id };
          if (v.password) body.password = v.password;
          await Api.put(`/access/users/${login.id}`, body);
        } else {
          if (!v.password || v.password.length < 8) throw new Error('Password must be at least 8 characters.');
          await Api.post('/access/users', { employee_no: employeeNo, email: v.email, password: v.password, role_id: v.role_id });
        }
        Api.toast(login ? 'Login updated' : 'Login created', 'success');
        openPersonDrawer(employeeNo);
      },
    });
  }

  // ---- Migrate to user accounts (bulk) ----
  document.getElementById('migrate-users-btn').addEventListener('click', async () => {
    const [{ data: candidates }, roles] = await Promise.all([Api.get('/access/users/candidates'), ensureRoles()]);
    showMigrateModal(candidates, roles);
  });

  function showMigrateModal(candidates, roles) {
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    const defaultRole = roles.find((r) => r.name === 'Employee') || roles[0];
    const roleOptionsHtml = roles.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');

    scrim.innerHTML = `
      <div class="modal modal-xl">
        <div class="modal-head">
          <div><strong>Migrate to user accounts</strong><div class="modal-note">Create a login for each selected employee, with a role, so they can sign in and use self-service features.</div></div>
          <button class="modal-close" id="mig-close">&times;</button>
        </div>
        <div class="modal-body">
          ${!candidates.length ? '<div class="empty-state">Every employee already has a login.</div>' : `
          <div class="row" style="gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
            <label class="row" style="gap:6px;cursor:pointer"><input type="checkbox" id="mig-select-all" checked style="width:auto" /> Select all</label>
            <span class="faint" style="margin-left:auto">Set role for checked:</span>
            <select id="mig-bulk-role">${roleOptionsHtml}</select>
            <button class="btn btn-ghost btn-sm" id="mig-apply-bulk-role">Apply</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th></th><th>Employee</th><th>Position</th><th>Email</th><th>Role</th></tr></thead>
              <tbody>
                ${candidates.map((c) => `
                  <tr>
                    <td><input type="checkbox" class="mig-check" data-emp="${c.employee_no}" ${c.email ? 'checked' : 'disabled'} style="width:auto" /></td>
                    <td>${c.full_legal_name} <span class="faint">(${c.employee_no})</span></td>
                    <td class="faint">${[c.position_title, c.department_name].filter(Boolean).join(' · ') || '—'}</td>
                    <td class="faint">${c.email || '<span style="color:var(--color-danger)">No email on file</span>'}</td>
                    <td><select class="mig-role" data-emp="${c.employee_no}" ${c.email ? '' : 'disabled'}>${roleOptionsHtml}</select></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" id="mig-cancel">Cancel</button>
          ${candidates.length ? '<button class="btn btn-primary" id="mig-submit">Create logins</button>' : ''}
        </div>
      </div>`;
    document.body.appendChild(scrim);

    if (defaultRole) scrim.querySelectorAll('.mig-role, #mig-bulk-role').forEach((sel) => { sel.value = defaultRole.id; });

    const close = () => scrim.remove();
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
    scrim.querySelector('#mig-close').addEventListener('click', close);
    scrim.querySelector('#mig-cancel').addEventListener('click', close);

    const selectAll = scrim.querySelector('#mig-select-all');
    if (selectAll) selectAll.addEventListener('change', () => {
      scrim.querySelectorAll('.mig-check:not(:disabled)').forEach((cb) => { cb.checked = selectAll.checked; });
    });

    const applyBulkBtn = scrim.querySelector('#mig-apply-bulk-role');
    if (applyBulkBtn) applyBulkBtn.addEventListener('click', () => {
      const roleId = scrim.querySelector('#mig-bulk-role').value;
      scrim.querySelectorAll('.mig-check:checked').forEach((cb) => {
        cb.closest('tr').querySelector('.mig-role').value = roleId;
      });
    });

    const submitBtn = scrim.querySelector('#mig-submit');
    if (submitBtn) submitBtn.addEventListener('click', async () => {
      const accounts = [];
      scrim.querySelectorAll('.mig-check:checked').forEach((cb) => {
        const row = cb.closest('tr');
        accounts.push({ employee_no: cb.dataset.emp, role_id: Number(row.querySelector('.mig-role').value) });
      });
      if (!accounts.length) { Api.toast('Select at least one employee', 'error'); return; }
      await Api.withLoading(submitBtn, 'Creating…', async () => {
        const { data: results } = await Api.post('/access/users/bulk', { accounts });
        showMigrateResults(scrim, results);
      });
    });
  }

  function showMigrateResults(scrim, results) {
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    scrim.querySelector('.modal').innerHTML = `
      <div class="modal-head">
        <div><strong>Logins created</strong><div class="modal-note">${succeeded.length} created, ${failed.length} failed. Share each password with its employee now — it won't be shown again. They can change it after signing in via Settings &rarr; Security.</div></div>
        <button class="modal-close" id="mig-close2">&times;</button>
      </div>
      <div class="modal-body">
        ${succeeded.length ? `
        <div class="table-wrap" style="margin-bottom:14px">
          <table>
            <thead><tr><th>Employee</th><th>Email</th><th>Temporary password</th></tr></thead>
            <tbody>${succeeded.map((r) => `<tr><td>${r.full_legal_name} <span class="faint">(${r.employee_no})</span></td><td>${r.email}</td><td style="font-family:monospace">${r.password}</td></tr>`).join('')}</tbody>
          </table>
        </div>` : ''}
        ${failed.length ? `
        <div class="modal-note" style="color:var(--color-danger);margin-bottom:6px">Not created:</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Reason</th></tr></thead>
            <tbody>${failed.map((r) => `<tr><td>${r.full_legal_name || r.employee_no}</td><td>${r.error}</td></tr>`).join('')}</tbody>
          </table>
        </div>` : ''}
      </div>
      <div class="modal-foot"><button class="btn btn-primary" id="mig-done">Done</button></div>`;
    const close = () => scrim.remove();
    scrim.querySelector('#mig-close2').addEventListener('click', close);
    scrim.querySelector('#mig-done').addEventListener('click', close);
    Api.toast(`${succeeded.length} login(s) created`, succeeded.length ? 'success' : 'error');
  }

  load();
})();
