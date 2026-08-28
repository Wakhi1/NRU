function fmtKm(n) {
  n = Number(n || 0);
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
}

function expiryHtml(dateStr) {
  if (!dateStr) return '<span class="faint">Not set</span>';
  const days = Math.round((new Date(dateStr) - new Date()) / 86400000);
  const label = new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  if (days < 0) return `<span style="color:var(--color-danger)">${esc(label)} (expired)</span>`;
  if (days <= 30) return `<span style="color:var(--color-danger)">${esc(label)} (${days}d)</span>`;
  return esc(label);
}

function openAdd(candidates) {
  FormDrawer.open({
    title: 'Add driver',
    sub: 'Attach licence and safety profile data to an employee',
    sections: [{ label: 'Driver', fields: [
      { key: 'employee_no', label: 'Employee', type: 'select', required: true, value: '',
        options: candidates.map((e) => ({ value: e.employee_no, label: e.full_legal_name })) },
      { key: 'licence_no', label: 'Licence number', value: '', hint: 'EC 4471' },
      { key: 'licence_expiry', label: 'Licence expiry', type: 'date', value: '' },
      { key: 'safety_score', label: 'Safety score', type: 'number', value: 100, numeric: true },
      { key: 'note', label: 'Note', type: 'textarea', value: '' },
    ] }],
    primaryLabel: 'Add driver',
    onSave: async (values) => {
      await Api.post('/drivers', values);
      Api.toast('Driver added');
      loadDrivers();
    },
  });
}

function openDriver(d, canManage) {
  FormDrawer.open({
    title: d.full_legal_name,
    sub: d.department || '',
    readOnly: !canManage,
    sections: [{ label: 'Driver profile', fields: [
      { key: 'licence_no', label: 'Licence number', value: d.licence_no || '', hint: 'EC 4471' },
      { key: 'licence_expiry', label: 'Licence expiry', type: 'date', value: d.licence_expiry || '' },
      { key: 'safety_score', label: 'Safety score', type: 'number', value: d.safety_score, numeric: true },
      { key: 'note', label: 'Note', type: 'textarea', value: d.note || '' },
      { key: 'trips', label: 'Trips', value: d.trip_count, editable: false },
      { key: 'km', label: 'Total distance', value: `${Number(d.total_km).toLocaleString()} km`, editable: false },
    ] }],
    primaryLabel: 'Save changes',
    deleteLabel: canManage ? 'Remove driver' : undefined,
    onSave: canManage ? async (values) => {
      await Api.put(`/drivers/${d.employee_no}`, values);
      Api.toast('Driver profile updated');
      loadDrivers();
    } : undefined,
    onDelete: canManage ? async () => {
      await Api.del(`/drivers/${d.employee_no}`);
      Api.toast('Driver profile removed');
      loadDrivers();
    } : undefined,
  });
}

async function loadDrivers() {
  const me = Shell.me;
  const canManage = me.permissions.includes('driver.manage');
  const { data } = await Api.get('/drivers');
  const tbl = document.getElementById('tbl');
  tbl.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Name</th><th>Department</th><th>Licence</th><th>Expiry</th><th>Trips</th><th>KM</th><th>Score</th>
  </tr></thead><tbody>${data.map((d) => `<tr class="clickable" data-emp="${esc(d.employee_no)}">
    <td>${esc(d.full_legal_name)}</td><td>${esc(d.department || '—')}</td><td>${esc(d.licence_no || '—')}</td>
    <td>${expiryHtml(d.licence_expiry)}</td><td>${d.trip_count}</td><td>${fmtKm(d.total_km)}</td><td>${d.safety_score}</td>
  </tr>`).join('') || '<tr><td colspan="7">No driver profiles yet</td></tr>'}</tbody></table></div>`;

  [...tbl.querySelectorAll('tr[data-emp]')].forEach((tr) => tr.addEventListener('click', () => {
    const d = data.find((x) => x.employee_no === tr.dataset.emp);
    openDriver(d, canManage);
  }));
}

(async () => {
  const me = await Shell.init('drivers');
  const canManage = me.permissions.includes('driver.manage');

  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Drivers</h1>
      <p class="page-sub">Licence, safety score and trip history for every registered driver.</p></div>
      ${canManage ? '<button class="btn btn-primary" id="add-btn">+ Add driver</button></div>' : '</div>'}
    <div class="card" id="tbl"></div>`;

  if (canManage) {
    document.getElementById('add-btn').addEventListener('click', async () => {
      const { data: candidates } = await Api.get('/drivers/candidates');
      openAdd(candidates);
    });
  }
  await loadDrivers();
})();
