(async () => {
  const shellData = await Shell.init('org');
  const orgScope = shellData.scope.org || {};
  const canCreate = orgScope.create;
  const canDelete = orgScope.delete;
  const canManagePeople = !!(shellData.scope.people && shellData.scope.people.update);
  if (canCreate) document.getElementById('new-unit-btn').style.display = '';

  // ---------------- view tabs ----------------
  document.querySelectorAll('#view-tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#view-tabs .tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isReporting = tab.dataset.view === 'reporting';
      document.getElementById('units-view').style.display = isReporting ? 'none' : '';
      document.getElementById('reporting-view').style.display = isReporting ? '' : 'none';
      if (isReporting && !reportingLoadedOnce) { reportingLoadedOnce = true; loadReporting(shellData.user.employeeNo); }
    });
  });

  // ---------------- units ----------------
  let units = [];
  let activeKind = '';
  const KIND_LABEL = { department: 'Department', committee: 'Committee', board: 'Board', group: 'Group', project_team: 'Project team' };

  async function loadUnits() {
    const { data } = await Api.get('/org');
    units = data;
    renderUnits();
  }

  function renderUnits() {
    const grid = document.getElementById('unit-grid');
    const filtered = activeKind ? units.filter((u) => u.kind === activeKind) : units;
    grid.innerHTML = filtered.map((u) => `
      <div class="card clickable" data-id="${u.id}">
        <div class="row between"><h3>${u.name}</h3><span class="badge badge-info">${KIND_LABEL[u.kind]}</span></div>
        <div class="muted">Lead: ${u.lead_name || '—'}</div>
        <div class="faint">${u.member_count} member(s)${u.duty_station ? ' · ' + u.duty_station : ''}</div>
      </div>
    `).join('') || '<div class="empty-state">No units yet.</div>';
    grid.querySelectorAll('.card[data-id]').forEach((el) => el.addEventListener('click', () => openUnit(el.dataset.id)));
  }

  document.querySelectorAll('#kind-filter .badge').forEach((el) => {
    el.addEventListener('click', () => {
      activeKind = el.dataset.kind;
      document.querySelectorAll('#kind-filter .badge').forEach((b) => b.className = 'badge badge-neutral clickable');
      el.className = 'badge badge-info clickable';
      renderUnits();
    });
  });

  const UNIT_ROLE_OPTIONS = ['Lead / Chair', 'Co-Lead', 'Secretary', 'Member'];

  function membersTableHtml(members) {
    const active = members.filter((m) => !m.to_date);
    return `
      <div class="drawer-group">
        <div class="drawer-group-label">Members (${active.length})</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Role</th><th></th></tr></thead>
          <tbody>${active.map((m) => `
            <tr data-membership="${m.id}">
              <td><a href="/employee.html?id=${encodeURIComponent(m.employee_no)}">${m.full_legal_name}</a></td>
              <td>${canUpdateOrg ? `<select data-role-select>${UNIT_ROLE_OPTIONS.map((r) => `<option ${r === (m.role_in_unit || 'Member') ? 'selected' : ''}>${r}</option>`).join('')}</select>` : (m.role_in_unit || 'Member')}</td>
              <td>${canUpdateOrg ? '<button class="btn btn-ghost btn-sm" data-remove-member style="color:var(--color-danger)">Remove</button>' : ''}</td>
            </tr>
          `).join('') || '<tr><td colspan="3" class="faint">No members yet.</td></tr>'}</tbody>
        </table></div>
        ${canUpdateOrg ? `
          <div class="row" style="gap:8px;margin-top:10px;align-items:flex-end">
            <div class="form-row" style="flex:1;margin-bottom:0"><label>Add member</label><select id="add-member-person"></select></div>
            <div class="form-row" style="margin-bottom:0"><label>Role</label><select id="add-member-role">${UNIT_ROLE_OPTIONS.map((r) => `<option>${r}</option>`).join('')}</select></div>
            <button class="btn btn-primary btn-sm" id="add-member-btn">Add</button>
          </div>` : ''}
      </div>`;
  }

  const canUpdateOrg = !!orgScope.update;

  async function openUnit(id) {
    const { data } = await Api.get(`/org/${id}`);
    const leadOptions = await managerOptionsForUnit();

    FormDrawer.open({
      title: data.name,
      sub: `${KIND_LABEL[data.kind]} · ${data.members.filter((m) => !m.to_date).length} member(s)`,
      readOnly: !canUpdateOrg,
      sections: [{
        label: 'Details',
        fields: [
          { key: 'kind', label: 'Kind', type: 'select', value: data.kind, options: Object.keys(KIND_LABEL).map((k) => ({ value: k, label: KIND_LABEL[k] })) },
          { key: 'name', label: 'Name', type: 'text', value: data.name, required: true },
          { key: 'lead_employee_no', label: 'Lead', type: 'select', value: data.lead_employee_no || '', options: leadOptions },
          { key: 'cost_centre', label: 'Cost centre', type: 'text', value: data.cost_centre },
          { key: 'duty_station', label: 'Location', type: 'text', value: data.duty_station, hint: 'e.g. Mbabane, Manzini' },
          { key: 'note', label: 'Description', type: 'textarea', value: data.note },
        ],
      }],
      extraHtml: membersTableHtml(data.members),
      afterRender: (root) => wireMemberManagement(root, id, data),
      primaryLabel: 'Save changes',
      onSave: async (v) => {
        await Api.put(`/org/${id}`, v);
        Api.toast('Unit updated', 'success');
        loadUnits();
      },
      onDelete: canDelete ? async () => {
        await Api.del(`/org/${id}`);
        Api.toast('Org unit deleted', 'success');
        loadUnits();
      } : undefined,
      deleteLabel: 'Delete unit',
    });
  }

  async function managerOptionsForUnit() {
    if (!peopleForUnits) { try { peopleForUnits = (await Api.get('/people')).data; } catch (e) { peopleForUnits = []; } }
    return [{ value: '', label: '— Unassigned —' }, ...peopleForUnits.map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` }))];
  }
  let peopleForUnits = null;

  async function wireMemberManagement(root, unitId, data) {
    if (!canUpdateOrg) return;

    root.querySelectorAll('[data-membership]').forEach((tr) => {
      const membershipId = tr.dataset.membership;
      const roleSelect = tr.querySelector('[data-role-select]');
      if (roleSelect) roleSelect.addEventListener('change', async () => {
        try {
          await Api.put(`/org/${unitId}/members/${membershipId}`, { role_in_unit: roleSelect.value });
          Api.toast('Role updated', 'success');
        } catch (err) {
          Api.toast(err.message, 'error');
        }
      });
      const removeBtn = tr.querySelector('[data-remove-member]');
      if (removeBtn) removeBtn.addEventListener('click', async () => {
        if (!confirm('Remove this member from the unit?')) return;
        await Api.withLoading(removeBtn, 'Removing…', () => Api.del(`/org/${unitId}/members/${membershipId}`));
        Api.toast('Member removed', 'success');
        FormDrawer.close();
        openUnit(unitId);
        loadUnits();
      });
    });

    await managerOptionsForUnit();
    const currentMemberIds = new Set(data.members.filter((m) => !m.to_date).map((m) => m.employee_no));
    const addSelect = root.querySelector('#add-member-person');
    if (addSelect) {
      addSelect.innerHTML = peopleForUnits.filter((p) => !currentMemberIds.has(p.employee_no))
        .map((p) => `<option value="${p.employee_no}">${p.preferred_name || p.full_legal_name} (${p.employee_no})</option>`).join('');
    }
    const addBtn = root.querySelector('#add-member-btn');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const employeeNo = addSelect.value;
      if (!employeeNo) return;
      await Api.withLoading(addBtn, 'Adding…', () => Api.post(`/org/${unitId}/members`, {
        employee_no: employeeNo,
        role_in_unit: root.querySelector('#add-member-role').value,
        from_date: new Date().toISOString().slice(0, 10),
      }));
      Api.toast('Member added', 'success');
      FormDrawer.close();
      openUnit(unitId);
      loadUnits();
    });
  }

  document.getElementById('new-unit-btn').addEventListener('click', async () => {
    const leadOptions = await managerOptionsForUnit();
    const parentOptions = [{ value: '', label: '— Top level —' }, ...units.map((u) => ({ value: u.id, label: u.name }))];

    FormDrawer.open({
      title: 'New org unit',
      sub: 'Departments, committees, boards, groups and project teams all live in the same structure table.',
      sections: [{
        label: 'Details',
        fields: [
          { key: 'kind', label: 'Kind', type: 'select', value: 'department', options: Object.keys(KIND_LABEL).map((k) => ({ value: k, label: KIND_LABEL[k] })) },
          { key: 'name', label: 'Name', type: 'text', value: '', required: true, hint: 'e.g. Finance' },
          { key: 'lead_employee_no', label: 'Lead', type: 'select', value: '', options: leadOptions },
          { key: 'parent_id', label: 'Parent unit', type: 'select', value: '', options: parentOptions, numeric: true },
          { key: 'cost_centre', label: 'Cost centre', type: 'text', value: '', hint: 'e.g. CC-1400' },
          { key: 'duty_station', label: 'Location', type: 'text', value: '', hint: 'e.g. Mbabane, Manzini' },
          { key: 'note', label: 'Description', type: 'textarea', value: '', hint: 'What this unit is responsible for' },
        ],
      }],
      primaryLabel: 'Create',
      onSave: async (v) => {
        await Api.post('/org', v);
        Api.toast('Org unit created', 'success');
        loadUnits();
      },
    });
  });

  // ---------------- reporting (Teams-style org chart) ----------------
  let reportingLoadedOnce = false;

  function personCard(p, { self, managerNo } = {}) {
    const initials = (p.name || '').split(' ').filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
    return `
      <div class="org-person-card ${self ? 'is-self' : ''}" data-id="${p.employee_no}" title="Click to re-centre the chart on ${p.name}">
        <div class="org-person-avatar">${initials}</div>
        <div class="org-person-name">${p.name}</div>
        <div class="org-person-title">${p.position_title || '—'}</div>
        <div class="org-person-dept">${p.department_name || ''}</div>
        <a href="/employee.html?id=${encodeURIComponent(p.employee_no)}" class="faint" data-profile-link style="margin-top:2px">View profile →</a>
        ${self && canManagePeople ? `<button class="btn btn-ghost btn-sm" data-reassign="${p.employee_no}" data-manager="${managerNo || ''}" style="margin-top:4px">Reassign manager</button>` : ''}
      </div>
    `;
  }

  async function openReassignDrawer(employeeNo, currentManagerNo) {
    let people;
    try { people = (await Api.get('/people')).data; } catch (e) { people = []; }
    const options = [{ value: '', label: '— No manager —' }, ...people.filter((p) => p.employee_no !== employeeNo).map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` }))];
    FormDrawer.open({
      title: 'Reassign manager',
      sub: `Updates who ${employeeNo} reports to — the chart refreshes immediately.`,
      sections: [{ label: 'Supervisor', fields: [{ key: 'reports_to_employee_no', label: 'Reports to', type: 'select', value: currentManagerNo || '', options }] }],
      primaryLabel: 'Save',
      onSave: async (v) => {
        await Api.patch(`/people/${employeeNo}/manager`, { reports_to_employee_no: v.reports_to_employee_no || null });
        Api.toast('Manager updated', 'success');
        loadReporting(employeeNo);
      },
    });
  }

  async function loadReporting(employeeNo) {
    const root = document.getElementById('org-chart-root');
    root.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';
    let rel;
    try {
      const res = await Api.get(`/people/${encodeURIComponent(employeeNo)}/relationships`);
      rel = res.data;
    } catch (err) {
      root.innerHTML = `<div class="empty-state">${err.message}</div>`;
      return;
    }

    const parts = [];
    if (rel.manager) {
      parts.push(`<div class="org-chart-label">Reports to</div>`);
      parts.push(`<div class="org-chart-row">${personCard(rel.manager)}</div>`);
      parts.push(`<div class="org-chart-connector"></div>`);
    }
    parts.push(`<div class="org-chart-row">${personCard(rel.self, { self: true, managerNo: rel.manager ? rel.manager.employee_no : '' })}</div>`);
    if (rel.directReports.length) {
      parts.push(`<div class="org-chart-connector"></div>`);
      parts.push(`<div class="org-chart-label">Direct reports (${rel.directReports.length})</div>`);
      parts.push(`<div class="org-chart-row">${rel.directReports.map((p) => personCard(p)).join('')}</div>`);
    }
    if (rel.peers.length) {
      parts.push(`<div class="org-worksWith-row">${rel.peers.map((p) => personCard(p)).join('')}</div>`);
      parts.push(`<div class="org-chart-label" style="margin-top:-4px">Works with — same manager</div>`);
    }

    root.innerHTML = `<div class="org-chart">${parts.join('')}</div>`;
    root.querySelectorAll('.org-person-card[data-id]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-profile-link], [data-reassign]')) return; // handled separately below
        loadReporting(el.dataset.id);
      });
    });
    root.querySelectorAll('[data-reassign]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openReassignDrawer(btn.dataset.reassign, btn.dataset.manager);
      });
    });
  }

  let searchDebounce;
  document.getElementById('reporting-search').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const q = e.target.value.trim();
    if (!q) return;
    searchDebounce = setTimeout(async () => {
      try {
        const { data } = await Api.get('/people?q=' + encodeURIComponent(q));
        if (data[0]) loadReporting(data[0].employee_no);
      } catch (err) { /* ignore */ }
    }, 300);
  });

  loadUnits();

  const focusId = new URLSearchParams(location.search).get('focus');
  if (focusId) {
    document.querySelector('#view-tabs .tab[data-view="reporting"]').click();
    reportingLoadedOnce = true;
    loadReporting(focusId);
  }
})();
