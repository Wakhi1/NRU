(async () => {
  const shellData = await Shell.init('leave');
  const selfId = shellData.user.employeeNo;
  const canApprove = shellData.scope.leave && shellData.scope.leave.update;
  const canManageTypes = shellData.scope.leave && shellData.scope.leave.create;
  const canEditTypes = shellData.scope.leave && shellData.scope.leave.update;
  const canDeleteTypes = shellData.scope.leave && shellData.scope.leave.delete;

  let typesCache = [];

  function typeOptions() { return typesCache.map((t) => ({ value: t.id, label: t.name })); }

  async function loadTypes() {
    const { data } = await Api.get('/leave/types');
    typesCache = data;

    if (canManageTypes) {
      document.getElementById('leave-types-card').style.display = '';
      document.querySelector('#types-table tbody').innerHTML = data.map((t) => `
        <tr>
          <td>${t.name}</td><td>${t.annual_entitlement_days}</td><td>${t.paid ? 'Yes' : 'No'}</td>
          <td>${canEditTypes ? `<button class="btn btn-ghost btn-sm" data-edit-type="${t.id}">Edit</button>` : ''}</td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="faint">No leave types configured.</td></tr>';

      document.querySelectorAll('[data-edit-type]').forEach((btn) => btn.addEventListener('click', () => openTypeDrawer(typesCache.find((t) => t.id === Number(btn.dataset.editType)))));
    }
  }

  function openTypeDrawer(t) {
    FormDrawer.open({
      title: t ? 'Edit leave type' : 'Add leave type',
      sub: 'Applies organisation-wide — existing balances are unaffected until the next cycle.',
      sections: [{
        label: 'Leave type',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: t ? t.name : '', required: true },
          { key: 'annual_entitlement_days', label: 'Annual entitlement (days)', type: 'number', value: t ? t.annual_entitlement_days : 0 },
          { key: 'paid', label: 'Paid', type: 'select', value: t ? String(!!t.paid) : 'true', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
        ],
      }],
      primaryLabel: t ? 'Save changes' : 'Create',
      onSave: async (v) => {
        const body = { ...v, paid: v.paid === 'true' };
        await (t ? Api.put(`/leave/types/${t.id}`, body) : Api.post('/leave/types', body));
        Api.toast('Leave type saved', 'success');
        loadTypes();
      },
      onDelete: t && canDeleteTypes ? async () => {
        await Api.del(`/leave/types/${t.id}`);
        Api.toast('Leave type deleted', 'success');
        loadTypes();
      } : undefined,
      deleteLabel: 'Delete type',
    });
  }
  document.getElementById('new-type-btn').addEventListener('click', () => openTypeDrawer(null));

  async function loadBalances() {
    const { data } = await Api.get('/leave/balances');
    document.getElementById('balance-grid').innerHTML = data.map((b) => `
      <div class="card kpi">
        <div class="label">${b.leave_type}</div>
        <div class="value">${(b.entitled_days - b.used_days).toFixed(1)}</div>
        <div class="faint">of ${b.entitled_days} remaining</div>
      </div>
    `).join('') || '<div class="empty-state">No balances on file.</div>';
  }

  async function loadMyRequests() {
    const { data } = await Api.get(`/leave/requests?employee_no=${encodeURIComponent(selfId)}`);
    const tbody = document.querySelector('#my-requests-table tbody');
    document.getElementById('my-requests-empty').style.display = data.length ? 'none' : 'block';
    tbody.innerHTML = data.map((r) => `
      <tr>
        <td>${r.leave_type}</td>
        <td>${r.start_date} → ${r.end_date}</td>
        <td>${r.days}</td>
        <td><span class="badge ${r.status === 'approved' ? 'badge-success' : r.status === 'declined' ? 'badge-danger' : 'badge-warning'}">${r.status}</span></td>
      </tr>
    `).join('');
  }

  async function loadApprovals() {
    if (!canApprove) return;
    document.getElementById('approvals-card').style.display = '';
    const { data } = await Api.get('/leave/requests?status=pending');
    const rows = data.filter((r) => r.employee_no !== selfId);
    document.getElementById('approvals-empty').style.display = rows.length ? 'none' : 'block';
    const tbody = document.querySelector('#approvals-table tbody');
    tbody.innerHTML = rows.map((r) => `
      <tr class="clickable" data-id="${r.id}">
        <td>${r.full_legal_name}</td>
        <td>${r.leave_type}</td>
        <td>${r.start_date} → ${r.end_date}</td>
        <td>${r.days}</td>
        <td class="faint">${r.reason || '—'}</td>
        <td><button class="btn btn-ghost btn-sm">Review</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => openApprovalDrawer(rows.find((r) => String(r.id) === tr.dataset.id)));
    });
  }

  // Approve/decline as a drawer showing the request detail, per the requested drawer-based
  // workflow — the underlying PUT /leave/requests/:id/decide already lets a Head of Department
  // approve their own team's requests (leave:update, data_scope 'department'), same as before.
  function openApprovalDrawer(r) {
    FormDrawer.open({
      title: `${r.full_legal_name} — ${r.leave_type}`,
      sub: `${r.start_date} → ${r.end_date} · ${r.days} day(s)`,
      sections: [{
        label: 'Request',
        fields: [
          { key: 'employee', label: 'Employee', type: 'text', value: r.full_legal_name, editable: false },
          { key: 'type', label: 'Type', type: 'text', value: r.leave_type, editable: false },
          { key: 'dates', label: 'Dates', type: 'text', value: `${r.start_date} → ${r.end_date} (${r.days} day(s))`, editable: false },
          { key: 'reason', label: 'Reason', type: 'text', value: r.reason || 'None given', editable: false },
        ],
      }],
      extraHtml: `
        <div class="row" style="gap:8px;margin-top:4px">
          <button class="btn btn-primary" id="fd-approve-btn" style="flex:1;justify-content:center">Approve</button>
          <button class="btn btn-ghost" id="fd-decline-btn" style="flex:1;justify-content:center;color:var(--color-danger)">Decline</button>
        </div>`,
      afterRender: (root) => {
        // No primary Save button for this drawer (approve/decline replace it) — hide it.
        const saveBtn = document.getElementById('fd-save');
        if (saveBtn) saveBtn.style.display = 'none';
        root.querySelector('#fd-approve-btn').addEventListener('click', async (e) => {
          await Api.withLoading(e.currentTarget, 'Approving…', () => Api.put(`/leave/requests/${r.id}/decide`, { status: 'approved' }));
          Api.toast('Approved', 'success');
          FormDrawer.close();
          loadApprovals(); loadMyRequests(); loadBalances();
        });
        root.querySelector('#fd-decline-btn').addEventListener('click', async (e) => {
          await Api.withLoading(e.currentTarget, 'Declining…', () => Api.put(`/leave/requests/${r.id}/decide`, { status: 'declined' }));
          Api.toast('Declined', 'success');
          FormDrawer.close();
          loadApprovals(); loadMyRequests(); loadBalances();
        });
      },
      // A no-op onSave is required by FormDrawer's API even though this drawer's actions
      // (approve/decline) bypass it entirely via the buttons above.
      onSave: async () => { FormDrawer.close(); },
    });
  }

  // ---- Adjust a balance (HR/manager correction tool, not the automatic approve-triggered one) ----
  // No primary Save button for this drawer — "Load" and each row's "Save" are both plain
  // buttons wired in afterRender, entirely independent of FormDrawer's own onSave/close cycle,
  // so picking a person never closes the drawer.
  document.getElementById('adjust-balance-btn').addEventListener('click', async () => {
    let people = [];
    try { people = (await Api.get('/people')).data; } catch (e) { /* out of scope */ }

    FormDrawer.open({
      title: 'Adjust a leave balance',
      sub: 'Pick a person to load and correct their current balances.',
      sections: [{
        label: 'Person',
        fields: [{ key: 'employee_no', label: 'Employee', type: 'select', value: '', options: people.map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` })) }],
      }],
      extraHtml: `
        <div class="row" style="gap:8px;margin-top:-6px">
          <button class="btn btn-ghost btn-sm" id="load-balances-btn">Load balances</button>
        </div>
        <div id="balance-adjust-list" class="faint" style="margin-top:8px">Choose a person, then click Load balances.</div>`,
      afterRender: (root) => {
        document.getElementById('fd-save').style.display = 'none'; // this drawer has no single "save" step
        root.querySelector('#load-balances-btn').addEventListener('click', async (e) => {
          const employeeNo = root.querySelector('[data-fd-field="employee_no"]').value;
          if (!employeeNo) { Api.toast('Choose a person first', 'error'); return; }
          const listEl = root.querySelector('#balance-adjust-list');
          await Api.withLoading(e.currentTarget, 'Loading…', async () => {
            const { data } = await Api.get(`/leave/balances/for/${encodeURIComponent(employeeNo)}`);
            listEl.innerHTML = data.map((b) => `
              <div class="row" style="gap:8px;align-items:flex-end;padding:8px 0;border-bottom:1px solid var(--color-neutral-200)">
                <div style="flex:1"><strong>${b.leave_type}</strong></div>
                <div class="form-row" style="margin-bottom:0;width:110px"><label>Entitled</label><input type="number" step="0.5" value="${b.entitled_days}" data-entitled="${b.id}" /></div>
                <div class="form-row" style="margin-bottom:0;width:110px"><label>Used</label><input type="number" step="0.5" value="${b.used_days}" data-used="${b.id}" /></div>
                <button class="btn btn-ghost btn-sm" data-save-balance="${b.id}">Save</button>
              </div>
            `).join('') || '<div class="faint">No balances for this person.</div>';
            listEl.querySelectorAll('[data-save-balance]').forEach((btn) => {
              btn.addEventListener('click', async () => {
                const id = btn.dataset.saveBalance;
                const entitled = Number(listEl.querySelector(`[data-entitled="${id}"]`).value);
                const used = Number(listEl.querySelector(`[data-used="${id}"]`).value);
                await Api.withLoading(btn, 'Saving…', () => Api.put(`/leave/balances/${id}`, { entitled_days: entitled, used_days: used }));
                Api.toast('Balance updated', 'success');
                loadBalances();
              });
            });
          });
        });
      },
      onSave: async () => { /* unused — see comment above */ },
    });
  });
  if (canApprove) document.getElementById('adjust-balance-btn').style.display = '';

  // ---- Request leave ----
  document.getElementById('new-request-btn').addEventListener('click', () => {
    FormDrawer.open({
      title: 'Request leave',
      sub: 'Routes to your line manager, then HR review, before it counts against your balance.',
      sections: [{
        label: 'Request',
        fields: [
          { key: 'leave_type_id', label: 'Leave type', type: 'select', value: typesCache[0] ? typesCache[0].id : '', required: true, options: typeOptions(), numeric: true },
          { key: 'start_date', label: 'Start date', type: 'date', value: '', required: true },
          { key: 'end_date', label: 'End date', type: 'date', value: '', required: true },
          { key: 'days', label: 'Days', type: 'number', value: '', required: true },
          { key: 'reason', label: 'Reason', type: 'textarea', value: '' },
        ],
      }],
      primaryLabel: 'Submit',
      onSave: async (v) => {
        await Api.post('/leave/requests', v);
        Api.toast('Leave request submitted', 'success');
        loadMyRequests();
      },
    });
  });

  loadTypes();
  loadBalances();
  loadMyRequests();
  loadApprovals();
})();
