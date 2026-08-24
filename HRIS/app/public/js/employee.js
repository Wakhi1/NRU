const SELF_EDITABLE_FIELDS = ['preferred_name', 'email', 'phone', 'address', 'next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone', 'languages', 'marital_status'];
const HR_EDITABLE_FIELDS = ['full_legal_name', 'preferred_name', 'national_id', 'date_of_birth', 'gender', 'nationality', 'marital_status', 'languages', 'email', 'phone', 'address', 'next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone', 'status'];

const FIELD_META = {
  full_legal_name: { label: 'Full legal name', type: 'text' },
  preferred_name: { label: 'Preferred name', type: 'text' },
  national_id: { label: 'National ID', type: 'text' },
  date_of_birth: { label: 'Date of birth', type: 'date' },
  gender: { label: 'Gender', type: 'text' },
  nationality: { label: 'Nationality', type: 'text' },
  marital_status: { label: 'Marital status', type: 'text' },
  languages: { label: 'Languages', type: 'text' },
  email: { label: 'Email', type: 'email' },
  phone: { label: 'Phone', type: 'text' },
  address: { label: 'Address', type: 'text' },
  next_of_kin_name: { label: 'Next of kin', type: 'text' },
  next_of_kin_relationship: { label: 'Next of kin relationship', type: 'text' },
  next_of_kin_phone: { label: 'Next of kin phone', type: 'text' },
  status: { label: 'Status', type: 'select', options: ['active', 'on_leave', 'suspended', 'exited'] },
};

(async () => {
  const shellData = await Shell.init('directory');
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { document.getElementById('emp-name').textContent = 'No employee selected'; return; }

  let person;
  try {
    const res = await Api.get(`/people/${id}`);
    person = res.data;
  } catch (err) {
    document.getElementById('emp-name').textContent = 'Not found';
    document.getElementById('emp-sub').textContent = err.message;
    return;
  }

  const scope = shellData.scope;
  const isOwnRecord = id === shellData.user.employeeNo;
  const canUpdate = !!(scope.people && scope.people.update);
  const editableFields = (isOwnRecord && scope.people.dataScope === 'self') ? SELF_EDITABLE_FIELDS : HR_EDITABLE_FIELDS;

  function initials(name) {
    return (name || '').split(' ').filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
  }

  function renderHeader() {
    document.getElementById('emp-name').textContent = person.preferred_name || person.full_legal_name;
    const currentEmployment = (person.employment || []).find((e) => e.is_current) || person.employment[0];
    document.getElementById('emp-sub').textContent = [person.employee_no, currentEmployment && currentEmployment.position_title, currentEmployment && currentEmployment.department_name].filter(Boolean).join(' · ');

    const photoEl = document.getElementById('emp-photo');
    if (person.photo_url) {
      photoEl.style.backgroundImage = `url(${person.photo_url})`;
      photoEl.style.backgroundSize = 'cover';
      photoEl.style.backgroundPosition = 'center';
      photoEl.textContent = '';
    } else {
      photoEl.style.backgroundImage = '';
      photoEl.textContent = initials(person.preferred_name || person.full_legal_name);
    }
  }
  renderHeader();

  if (canUpdate) {
    document.getElementById('edit-toggle-btn').style.display = '';
    const editLabel = document.getElementById('emp-photo-edit');
    editLabel.style.display = 'flex';
    document.getElementById('emp-photo-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const form = new FormData();
      form.append('photo', file);
      try {
        const res = await fetch(`/api/v1/people/${id}/photo`, { method: 'POST', body: form, credentials: 'same-origin' });
        if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
        const { data } = await res.json();
        person.photo_url = data.photo_url;
        renderHeader();
        Api.toast('Photo updated', 'success');
      } catch (err) {
        Api.toast(err.message, 'error');
      }
    });
  }

  const tabs = [
    { key: 'personal', label: 'Personal', enabled: true },
    { key: 'employment', label: 'Employment', enabled: true },
    { key: 'structures', label: 'Structures', enabled: !!(scope.org && scope.org.read) },
    { key: 'leave', label: 'Leave', enabled: !!(scope.leave && scope.leave.read) },
    { key: 'payroll', label: 'Payroll', enabled: !!(scope.payroll && scope.payroll.read) },
    { key: 'training', label: 'Training & compliance', enabled: !!(scope.training && scope.training.read) },
  ].filter((t) => t.enabled);

  const tabsEl = document.getElementById('tabs');
  const contentEl = document.getElementById('tab-content');
  let editMode = false;

  function field(label, value) {
    if (value === undefined) return '';
    return `<div class="form-row"><label>${label}</label><div>${value || '<span class="faint">Not on file</span>'}</div></div>`;
  }

  function miniPersonCard(p) {
    const initials2 = (p.name || '').split(' ').filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
    return `
      <div class="org-person-card" data-id="${p.employee_no}">
        <div class="org-person-avatar">${initials2}</div>
        <div class="org-person-name">${p.name}</div>
        <div class="org-person-title">${p.position_title || '—'}</div>
      </div>`;
  }

  async function openReassignManagerDrawer() {
    const currentEmployment = (person.employment || []).find((e) => e.is_current);
    let people;
    try { people = (await Api.get('/people')).data; } catch (e) { people = []; }
    const options = [{ value: '', label: '— No manager —' }, ...people.filter((p) => p.employee_no !== id).map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` }))];

    FormDrawer.open({
      title: 'Reassign manager',
      sub: `${person.preferred_name || person.full_legal_name} currently reports to ${currentEmployment && currentEmployment.reports_to_employee_no ? currentEmployment.reports_to_employee_no : 'no one'}.`,
      sections: [{
        label: 'Supervisor',
        fields: [{ key: 'reports_to_employee_no', label: 'Reports to', type: 'select', value: currentEmployment ? (currentEmployment.reports_to_employee_no || '') : '', options }],
      }],
      primaryLabel: 'Save',
      onSave: async (v) => {
        await Api.patch(`/people/${id}/manager`, { reports_to_employee_no: v.reports_to_employee_no || null });
        Api.toast('Manager updated — reporting tree refreshed', 'success');
        if (currentEmployment) currentEmployment.reports_to_employee_no = v.reports_to_employee_no || null;
        renderMiniOrgChart();
      },
    });
  }

  async function renderMiniOrgChart() {
    const container = document.getElementById('mini-org-chart');
    if (!container) return;
    try {
      const { data: rel } = await Api.get(`/people/${encodeURIComponent(id)}/relationships`);
      const sections = [];
      if (rel.manager) sections.push(`<div><div class="org-chart-label">Reports to</div><div class="org-chart-row">${miniPersonCard(rel.manager)}</div></div>`);
      if (rel.directReports.length) sections.push(`<div><div class="org-chart-label">Direct reports (${rel.directReports.length})</div><div class="org-chart-row">${rel.directReports.map(miniPersonCard).join('')}</div></div>`);
      if (rel.peers.length) sections.push(`<div><div class="org-chart-label">Works with</div><div class="org-chart-row">${rel.peers.slice(0, 6).map(miniPersonCard).join('')}${rel.peers.length > 6 ? `<div class="faint" style="align-self:center">+${rel.peers.length - 6} more</div>` : ''}</div></div>`);

      const body = container.querySelector('.empty-state');
      if (!sections.length) { body.textContent = 'No reporting relationships on file.'; return; }
      body.outerHTML = `<div class="stack">${sections.join('')}</div>`;
      container.querySelectorAll('.org-person-card[data-id]').forEach((el) => {
        el.addEventListener('click', () => { location.href = '/employee.html?id=' + encodeURIComponent(el.dataset.id); });
      });
    } catch (err) {
      const body = container.querySelector('.empty-state');
      if (body) body.textContent = err.message;
    }
  }

  function renderPersonalView() {
    contentEl.innerHTML = `<div class="card"><div class="form-grid">
      ${field('Full legal name', person.full_legal_name)}
      ${field('Preferred name', person.preferred_name)}
      ${field('National ID', person.national_id)}
      ${field('Date of birth', person.date_of_birth)}
      ${field('Gender', person.gender)}
      ${field('Nationality', person.nationality)}
      ${field('Marital status', person.marital_status)}
      ${field('Languages', person.languages)}
      ${field('Email', person.email)}
      ${field('Phone', person.phone)}
      ${field('Address', person.address)}
      ${field('Next of kin', person.next_of_kin_name)}
      ${field('Next of kin relationship', person.next_of_kin_relationship)}
      ${field('Next of kin phone', person.next_of_kin_phone)}
      ${field('Status', person.status)}
    </div></div>`;
  }

  function renderPersonalEdit() {
    const allFields = Object.keys(FIELD_META);
    const rows = allFields.map((f) => {
      const meta = FIELD_META[f];
      const editable = editableFields.includes(f);
      const value = person[f] || '';
      if (!editable) return field(meta.label, value);
      if (meta.type === 'select') {
        return `<div class="form-row"><label>${meta.label}</label><select data-field="${f}">${meta.options.map((o) => `<option value="${o}" ${o === value ? 'selected' : ''}>${o.replace('_', ' ')}</option>`).join('')}</select></div>`;
      }
      return `<div class="form-row"><label>${meta.label}</label><input data-field="${f}" type="${meta.type}" value="${(value || '').replace(/"/g, '&quot;')}" /></div>`;
    }).join('');

    contentEl.innerHTML = `<div class="card">
      ${isOwnRecord && editableFields === SELF_EDITABLE_FIELDS ? '<div class="modal-note" style="margin-bottom:12px">You can update your own contact and next-of-kin details. Identity and employment fields are HR-controlled.</div>' : ''}
      <div class="form-grid">${rows}</div>
      <div class="field-error" id="edit-error" style="display:none"></div>
      <div class="row" style="margin-top:10px;gap:8px">
        <button class="btn btn-primary" id="edit-save-btn">Save changes</button>
        <button class="btn btn-ghost" id="edit-cancel-btn">Cancel</button>
      </div>
    </div>`;

    document.getElementById('edit-cancel-btn').addEventListener('click', () => { editMode = false; renderPersonalView(); });
    document.getElementById('edit-save-btn').addEventListener('click', async (e) => {
      const errEl = document.getElementById('edit-error');
      errEl.style.display = 'none';
      const body = {};
      contentEl.querySelectorAll('[data-field]').forEach((el) => { body[el.dataset.field] = el.value.trim() || null; });
      try {
        await Api.withLoading(e.currentTarget, 'Saving…', async () => {
          const { data } = await Api.put(`/people/${id}`, body);
          Object.assign(person, data);
        });
        Api.toast('Profile updated', 'success');
        editMode = false;
        renderHeader();
        renderPersonalView();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    });
  }

  document.getElementById('edit-toggle-btn').addEventListener('click', () => {
    tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.key === 'personal'));
    editMode = !editMode;
    if (editMode) renderPersonalEdit(); else renderPersonalView();
  });

  async function renderTab(key) {
    editMode = false;
    contentEl.innerHTML = '<div class="card"><span class="spinner"></span> Loading…</div>';

    if (key === 'personal') { renderPersonalView(); return; }

    if (key === 'employment') {
      // basic_salary is absent entirely (not masked/blank) from every row unless the viewer's
      // PAYROLL scope reaches this person — see the GET /people/:id gate in people.routes.js.
      // Same signal directory.js's profile drawer uses, so the two surfaces stay consistent.
      const salaryVisible = (person.employment || []).some((e) => 'basic_salary' in e);
      const money = (n) => 'E ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const rows = (person.employment || []).map((e) => `
        <tr>
          <td>${e.position_title}</td><td>${e.department_name || '—'}</td><td>${e.grade || '—'}</td>
          <td>${e.contract_type}</td><td>${e.start_date}${e.end_date ? ' → ' + e.end_date : ''}</td>
          ${salaryVisible ? `<td>${e.basic_salary != null ? money(e.basic_salary) : '—'}</td>` : ''}
          <td>${e.is_current ? '<span class="badge badge-success">Current</span>' : '<span class="badge badge-neutral">Past</span>'}</td>
        </tr>`).join('');
      contentEl.innerHTML = `<div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Position</th><th>Department</th><th>Grade</th><th>Contract</th><th>Dates</th>${salaryVisible ? '<th>Basic salary</th>' : ''}<th></th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
      return;
    }

    if (key === 'structures') {
      const rows = (person.memberships || []).map((m) => `
        <tr><td>${m.org_unit_name}</td><td>${m.kind}</td><td>${m.role_in_unit || '—'}</td><td>${m.from_date}${m.to_date ? ' → ' + m.to_date : ''}</td></tr>
      `).join('');
      const voip = person.voip ? `Extension ${person.voip.extension} (${person.voip.status})` : 'No extension assigned';
      contentEl.innerHTML = `<div class="card">
        <div class="table-wrap"><table><thead><tr><th>Unit</th><th>Kind</th><th>Role</th><th>Dates</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="faint">No memberships on file.</td></tr>'}</tbody></table></div>
        <div class="divider"></div><div class="faint">VoIP: ${voip}</div>
      </div>
      <div class="card" id="mini-org-chart">
        <div class="row between">
          <h3>Reports to &amp; works with</h3>
          <div class="row" style="gap:6px">
            ${scope.people && scope.people.update ? '<button class="btn btn-ghost btn-sm" id="reassign-manager-btn">Reassign manager</button>' : ''}
            <a class="btn btn-ghost btn-sm" href="/org.html?focus=${encodeURIComponent(id)}">Full org chart →</a>
          </div>
        </div>
        <div class="empty-state"><span class="spinner"></span></div>
      </div>`;
      renderMiniOrgChart();
      const reassignBtn = document.getElementById('reassign-manager-btn');
      if (reassignBtn) reassignBtn.addEventListener('click', openReassignManagerDrawer);
      return;
    }

    if (key === 'leave') {
      try {
        const [balances, requests] = await Promise.all([
          Api.get(`/leave/balances?employee_no=${id}`),
          Api.get(`/leave/requests?employee_no=${id}`),
        ]);
        const balRows = balances.data.map((b) => `<div class="kpi card"><div class="label">${b.leave_type}</div><div class="value">${(b.entitled_days - b.used_days).toFixed(1)}</div><div class="faint">of ${b.entitled_days} remaining</div></div>`).join('');
        const reqRows = requests.data.map((r) => `<tr><td>${r.leave_type}</td><td>${r.start_date} → ${r.end_date}</td><td>${r.days}</td><td><span class="badge ${r.status === 'approved' ? 'badge-success' : r.status === 'declined' ? 'badge-danger' : 'badge-warning'}">${r.status}</span></td></tr>`).join('');
        contentEl.innerHTML = `<div class="grid grid-3">${balRows}</div>
          <div class="card"><div class="table-wrap"><table><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th></tr></thead><tbody>${reqRows || '<tr><td colspan="4" class="faint">No requests.</td></tr>'}</tbody></table></div></div>`;
      } catch (err) {
        contentEl.innerHTML = `<div class="card faint">${err.message}</div>`;
      }
      return;
    }

    if (key === 'payroll') {
      // Same rich payslip experience as the dedicated Payroll page's "My payslips" view (status,
      // net, PDF download, itemized breakdown) — this tab used to be a bare flat table with no
      // actions at all, which was the actual "payslips on workspace" gap the user pointed at.
      const PAYROLL_STATUS_LABEL = {
        draft: 'Draft', inputs_locked: 'Inputs locked', in_review: 'In review',
        approved_finance: 'Approved — finance', approved_ed: 'Approved — ED', paid: 'Paid', closed: 'Closed',
      };
      const money = (n) => 'E ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const statusBadge = (status) => {
        const kind = status === 'closed' || status === 'paid' ? 'badge-success' : status === 'draft' ? 'badge-neutral' : 'badge-warning';
        return `<span class="badge ${kind}">${PAYROLL_STATUS_LABEL[status] || status}</span>`;
      };
      function breakdownHtml(p) {
        const items = p.items || [];
        const allowanceItems = items.filter((i) => i.kind === 'allowance');
        const deductionItems = items.filter((i) => i.kind === 'deduction');
        const gross = Number(p.basic) + Number(p.overtime) + Number(p.allowances);
        const earnRows = [`<tr><td>Basic Salary</td><td style="text-align:right">${money(p.basic)}</td></tr>`];
        if (Number(p.overtime) !== 0) earnRows.push(`<tr><td>Overtime</td><td style="text-align:right">${money(p.overtime)}</td></tr>`);
        if (allowanceItems.length) allowanceItems.forEach((i) => earnRows.push(`<tr><td>${i.label}</td><td style="text-align:right">${money(i.amount)}</td></tr>`));
        else if (Number(p.allowances) !== 0) earnRows.push(`<tr><td>Allowances</td><td style="text-align:right">${money(p.allowances)}</td></tr>`);
        const dedRows = deductionItems.length
          ? deductionItems.map((i) => `<tr><td>${i.label}</td><td style="text-align:right">${money(i.amount)}</td></tr>`).join('')
          : (Number(p.deductions) !== 0 ? `<tr><td>Deductions</td><td style="text-align:right">${money(p.deductions)}</td></tr>` : '<tr><td class="faint">No deductions</td><td></td></tr>');
        return `
          <div class="drawer-group">
            <div class="drawer-group-label">Earnings</div>
            <table style="width:100%"><tbody>${earnRows.join('')}</tbody></table>
            <div class="row between" style="font-weight:600;border-top:1px solid var(--color-neutral-200);padding-top:6px;margin-top:6px"><span>Gross pay</span><span>${money(gross)}</span></div>
          </div>
          <div class="drawer-group">
            <div class="drawer-group-label">Deductions</div>
            <table style="width:100%"><tbody>${dedRows}</tbody></table>
            <div class="row between" style="font-weight:600;border-top:1px solid var(--color-neutral-200);padding-top:6px;margin-top:6px"><span>Total deductions</span><span>${money(p.deductions)}</span></div>
          </div>
          <div class="row between" style="font-weight:700;font-size:15px;background:var(--color-neutral-100);padding:8px 10px">
            <span>Net pay</span><span>${money(p.net)}</span>
          </div>`;
      }
      try {
        const { data } = await Api.get(`/payroll/paylines?employee_no=${id}`);
        const rows = data.map((p) => `
          <tr data-id="${p.id}">
            <td>${p.period}</td><td>${statusBadge(p.run_status)}</td><td><strong>${money(p.net)}</strong></td>
            <td class="row" style="gap:6px">
              <a class="btn btn-ghost btn-sm" href="/api/v1/payroll/paylines/${p.id}/payslip.pdf" target="_blank" rel="noopener">Download PDF</a>
              <button class="btn btn-ghost btn-sm payslip-view-btn" data-id="${p.id}">View breakdown</button>
            </td>
          </tr>`).join('');
        contentEl.innerHTML = `<div class="card"><div class="table-wrap"><table>
          <thead><tr><th>Period</th><th>Status</th><th>Net</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="faint">No payslips yet.</td></tr>'}</tbody></table></div></div>`;
        contentEl.querySelectorAll('.payslip-view-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const p = data.find((x) => x.id === Number(btn.dataset.id));
            FormDrawer.open({
              title: `Payslip — ${p.period}`,
              sub: `Status: ${PAYROLL_STATUS_LABEL[p.run_status] || p.run_status}`,
              readOnly: true,
              sections: [],
              extraHtml: breakdownHtml(p),
            });
          });
        });
      } catch (err) {
        contentEl.innerHTML = `<div class="card faint">${err.message}</div>`;
      }
      return;
    }

    if (key === 'training') {
      const certs = (person.certifications || []).map((c) => {
        const expiring = c.expires_at && new Date(c.expires_at) < new Date(Date.now() + 90 * 86400000);
        return `<tr><td>${c.name}</td><td>${c.issuing_body || '—'}</td><td>${c.issued_at || '—'}</td><td>${c.expires_at || '—'} ${expiring ? '<span class="badge badge-warning">Expiring</span>' : ''}</td></tr>`;
      }).join('');
      contentEl.innerHTML = `<div class="card"><h3>Certifications</h3><div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Issuing body</th><th>Issued</th><th>Expires</th></tr></thead>
        <tbody>${certs || '<tr><td colspan="4" class="faint">No certifications on file.</td></tr>'}</tbody></table></div></div>`;
      return;
    }
  }

  tabsEl.innerHTML = tabs.map((t, i) => `<div class="tab ${i === 0 ? 'active' : ''}" data-key="${t.key}">${t.label}</div>`).join('');
  tabsEl.querySelectorAll('.tab').forEach((el) => {
    el.addEventListener('click', () => {
      tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      el.classList.add('active');
      renderTab(el.dataset.key);
    });
  });
  if (tabs.length) renderTab(tabs[0].key);
})();
