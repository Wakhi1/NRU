let lookups = { employees: [], departments: [] };
let categoryFilter = 'All';

function statusChip(s) {
  const map = { 'On trip': 'badge-info', Available: 'badge-success', Workshop: 'badge-warning', Grounded: 'badge-danger' };
  return `<span class="badge ${map[s] || 'badge-neutral'}">${esc(s)}</span>`;
}

// Separates the operational pool (dispatched for field work, tracked live on the Live tracking
// screen) from executive vehicles, which are deliberately excluded from that screen — see
// tracking.routes.js.
function categoryChip(c) {
  return c === 'executive' ? '<span class="badge badge-info">Executive</span>' : '<span class="badge badge-neutral">Work</span>';
}

function driverOptions(current) {
  return [{ value: '', label: '— unassigned —' }, ...lookups.employees.map((e) => ({ value: e.employee_no, label: e.full_legal_name }))];
}

function vehicleFields(v) {
  return [
    { key: 'reg_no', label: 'Registration', value: v?.reg_no || '', required: true, hint: 'SD 412 AM' },
    { key: 'model', label: 'Model', value: v?.model || '', required: true, hint: 'Toyota Hilux 2.4 D4D' },
    { key: 'vehicle_type', label: 'Type', type: 'select', value: v?.vehicle_type || 'pickup',
      options: ['pickup', '4x4', 'truck', 'bus', 'van', 'sedan', 'other'] },
    { key: 'category', label: 'Category', type: 'select', value: v?.category || 'work',
      options: [{ value: 'work', label: 'Work — operational, tracked live' }, { value: 'executive', label: 'Executive — excluded from live tracking' }] },
    { key: 'department', label: 'Department / cost centre', type: 'select', value: v?.department || '',
      options: [{ value: '', label: '— none —' }, ...lookups.departments.map((d) => ({ value: d, label: d }))] },
    { key: 'assigned_driver_employee_no', label: 'Default driver', type: 'select', value: v?.assigned_driver_employee_no || '', options: driverOptions() },
    { key: 'status', label: 'Status', type: 'select', value: v?.status || 'Available', options: ['Available', 'On trip', 'Workshop', 'Grounded'] },
    { key: 'odometer_km', label: 'Odometer (km)', type: 'number', value: v?.odometer_km ?? 0, numeric: true },
    { key: 'fuel_pct', label: 'Fuel level (%)', type: 'number', value: v?.fuel_pct ?? 100, numeric: true },
    { key: 'tank_capacity_l', label: 'Tank capacity (L)', type: 'number', value: v?.tank_capacity_l ?? 80, numeric: true },
    { key: 'efficiency_l100km', label: 'Current efficiency (L/100km)', type: 'number', value: v?.efficiency_l100km ?? '', numeric: true },
    { key: 'target_l100km', label: 'Target efficiency (L/100km)', type: 'number', value: v?.target_l100km ?? '', numeric: true },
    { key: 'next_service_note', label: 'Next service note', value: v?.next_service_note || '', hint: 'e.g. "12 Sep 2026" or "Overdue 1 400 km"' },
    { key: 'next_service_date', label: 'Next service date', type: 'date', value: v?.next_service_date || '' },
  ];
}

let fleetCache = [];

async function loadFleet(canManage) {
  const { data } = await Api.get('/fleet');
  fleetCache = data;
  renderFleetTable(canManage);
}

function renderFleetTable(canManage) {
  const data = categoryFilter === 'All' ? fleetCache : fleetCache.filter((v) => v.category === categoryFilter.toLowerCase());
  const tbl = document.getElementById('tbl');
  tbl.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Reg</th><th>Model</th><th>Category</th><th>Department</th><th>Driver</th><th>Status</th><th>Odometer</th><th>Fuel</th><th>Efficiency</th>${canManage ? '<th></th>' : ''}
  </tr></thead><tbody>${data.map((v) => `<tr class="clickable" data-id="${v.id}">
    <td>${esc(v.reg_no)}</td><td>${esc(v.model)}</td><td>${categoryChip(v.category)}</td><td>${esc(v.department || '—')}</td><td>${esc(v.driver_name || 'Unassigned')}</td>
    <td>${statusChip(v.status)}</td><td>${Number(v.odometer_km).toLocaleString()} km</td><td>${v.fuel_pct}%</td>
    <td>${v.efficiency_l100km != null ? Number(v.efficiency_l100km).toFixed(1) + ' / ' + Number(v.target_l100km || 0).toFixed(1) : '—'}</td>
    ${canManage ? `<td><button class="btn btn-ghost btn-sm" data-edit="${v.id}">Edit</button></td>` : ''}
  </tr>`).join('') || `<tr><td colspan="10">No vehicles in this category</td></tr>`}</tbody></table></div>`;

  if (canManage) {
    [...tbl.querySelectorAll('[data-edit]')].forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = fleetCache.find((x) => x.id === Number(b.dataset.edit));
      openEdit(v);
    }));
  }
}

function openEdit(v) {
  FormDrawer.open({
    title: v.reg_no, sub: v.model,
    sections: [{ label: 'Vehicle', fields: vehicleFields(v) }],
    primaryLabel: 'Save changes',
    deleteLabel: 'Remove vehicle',
    onSave: async (values) => {
      await Api.put(`/fleet/${v.id}`, { ...values, assigned_driver_employee_no: values.assigned_driver_employee_no || null });
      Api.toast('Vehicle updated');
      loadFleet(true);
    },
    onDelete: async () => {
      await Api.del(`/fleet/${v.id}`);
      Api.toast('Vehicle removed');
      loadFleet(true);
    },
  });
}

function openRegister() {
  FormDrawer.open({
    title: 'Register a vehicle',
    sub: 'Add a new organisation-owned vehicle to the fleet register',
    sections: [{ label: 'Vehicle', fields: vehicleFields(null) }],
    primaryLabel: 'Register',
    onSave: async (values) => {
      await Api.post('/fleet', { ...values, assigned_driver_employee_no: values.assigned_driver_employee_no || null });
      Api.toast('Vehicle registered');
      loadFleet(true);
    },
  });
}

(async () => {
  const me = await Shell.init('fleet');
  const canManage = me.permissions.includes('fleet.manage');
  const { data: look } = await Api.get('/fleet/lookups');
  lookups = look;

  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Fleet register</h1>
      <p class="page-sub">Every organisation-owned vehicle — work vehicles are tracked live; executive vehicles are kept off the Live tracking screen.</p></div>
      ${canManage ? '<button class="btn btn-primary" id="register-btn">+ Register vehicle</button>' : ''}</div>
    <div class="tabs" id="category-tabs"></div>
    <div class="card" id="tbl"></div>`;

  const tabsEl = document.getElementById('category-tabs');
  function renderTabs() {
    tabsEl.innerHTML = ['All', 'Work', 'Executive'].map((c) =>
      `<div class="tab ${c === categoryFilter ? 'active' : ''}" data-cat="${c}">${c}</div>`).join('');
    [...tabsEl.querySelectorAll('[data-cat]')].forEach((el) => el.addEventListener('click', () => {
      categoryFilter = el.dataset.cat;
      renderTabs();
      renderFleetTable(canManage);
    }));
  }
  renderTabs();

  if (canManage) document.getElementById('register-btn').addEventListener('click', openRegister);
  await loadFleet(canManage);
})();
