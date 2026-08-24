(async () => {
  const shellData = await Shell.init('directory');
  const scope = shellData.scope.people || {};
  const payrollScope = shellData.scope.payroll || {};
  const canCreate = !!scope.create;
  const canUpdate = !!scope.update;
  const money = (n) => 'E ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (canCreate) document.getElementById('new-person-btn').style.display = '';

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
      extraHtml: `<a class="btn btn-ghost btn-sm" href="/employee.html?id=${encodeURIComponent(employeeNo)}">View full profile (leave, payroll, training, org chart) →</a>`,
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

  load();
})();
