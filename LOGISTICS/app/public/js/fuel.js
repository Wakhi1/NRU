let lookups = { vehicles: [], employees: [] };

function flagChip(f) {
  const map = { Verified: 'badge-success', Pending: 'badge-warning', Exception: 'badge-danger' };
  return `<span class="badge ${map[f] || 'badge-neutral'}">${esc(f)}</span>`;
}

function captureFields() {
  return [
    { key: 'vehicle_id', label: 'Vehicle', type: 'select', value: '', required: true, numeric: true,
      options: lookups.vehicles.map((v) => ({ value: v.id, label: `${v.reg_no} · ${v.model}` })) },
    { key: 'driver_employee_no', label: 'Driver', type: 'select', value: '',
      options: [{ value: '', label: '— unassigned —' }, ...lookups.employees.map((e) => ({ value: e.employee_no, label: e.full_legal_name }))] },
    { key: 'station', label: 'Station', value: '', required: true, hint: 'e.g. Total Mbabane' },
    { key: 'litres', label: 'Litres', type: 'number', value: '', required: true, numeric: true },
    { key: 'rate', label: 'Rate (E/L)', type: 'number', value: '', required: true, numeric: true },
    { key: 'odometer_km', label: 'Odometer (km)', type: 'number', value: '', required: true, numeric: true },
  ];
}

function fuelActionsHtml(f) {
  if (f.flag === 'Verified') return '';
  return `<div class="row" style="gap:8px;justify-content:flex-end">
    <button class="btn btn-ghost btn-sm" id="act-reject" style="color:var(--color-danger)">Reject transaction</button>
    <button class="btn btn-primary btn-sm" id="act-verify">Verify &amp; post</button>
  </div>`;
}

function openTxn(f, reload) {
  FormDrawer.open({
    title: `Fuel transaction · ${f.reg_no || 'Vehicle removed'}`,
    sub: `${fmtTime(f.transacted_at)} · ${f.station}`,
    readOnly: true,
    sections: [{ label: 'Transaction', fields: [
      { key: 'litres', label: 'Litres', value: `${Number(f.litres).toFixed(1)} L` },
      { key: 'rate', label: 'Rate', value: `E ${Number(f.rate).toFixed(2)} / L` },
      { key: 'amount', label: 'Amount', value: fmtMoney(f.litres * f.rate) },
      { key: 'odometer', label: 'Odometer', value: `${Number(f.odometer_km).toLocaleString()} km` },
      { key: 'driver', label: 'Driver', value: f.driver_name || 'Unassigned' },
      { key: 'station', label: 'Station', value: f.station },
      { key: 'flag', label: 'Flag', value: f.flag },
    ] }],
    extraHtml: `<div class="divider"></div>${fuelActionsHtml(f)}`,
    afterRender: (root) => {
      const verifyBtn = root.querySelector('#act-verify');
      const rejectBtn = root.querySelector('#act-reject');
      async function run(action, btn) {
        btn.disabled = true;
        try {
          await Api.put(`/fuel/${f.id}/decision`, { action });
          FormDrawer.close();
          Api.toast(action === 'verify' ? 'Transaction verified and posted' : 'Transaction rejected');
          reload();
        } catch (err) {
          Api.toast(err.message, true);
          btn.disabled = false;
        }
      }
      if (verifyBtn) verifyBtn.addEventListener('click', () => run('verify', verifyBtn));
      if (rejectBtn) rejectBtn.addEventListener('click', () => { if (confirm('Reject this transaction? It will be removed from the ledger.')) run('reject', rejectBtn); });
    },
  });
}

function openCapture() {
  FormDrawer.open({
    title: 'Capture a fuel transaction',
    sub: 'Litres exceeding the vehicle\'s tank capacity are auto-flagged as an exception',
    sections: [{ label: 'Transaction', fields: captureFields() }],
    primaryLabel: 'Capture',
    onSave: async (values) => {
      await Api.post('/fuel', {
        ...values,
        driver_employee_no: values.driver_employee_no || null,
      });
      Api.toast('Fuel transaction captured');
      loadFuel();
    },
  });
}

async function loadFuel() {
  const { data } = await Api.get('/fuel');
  const tbl = document.getElementById('tbl');
  tbl.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Date</th><th>Vehicle</th><th>Driver</th><th>Station</th><th>Litres</th><th>Rate</th><th>Amount</th><th>Flag</th>
  </tr></thead><tbody>${data.map((f) => `<tr class="clickable" data-id="${f.id}">
    <td>${fmtTime(f.transacted_at)}</td><td>${esc(f.reg_no || '—')}</td><td>${esc(f.driver_name || 'Unassigned')}</td>
    <td>${esc(f.station)}</td><td>${Number(f.litres).toFixed(1)} L</td><td>E ${Number(f.rate).toFixed(2)}</td>
    <td>${fmtMoney(f.litres * f.rate)}</td><td>${flagChip(f.flag)}</td>
  </tr>`).join('') || '<tr><td colspan="8">No fuel transactions yet</td></tr>'}</tbody></table></div>`;

  [...tbl.querySelectorAll('tr[data-id]')].forEach((tr) => tr.addEventListener('click', () => {
    const f = data.find((x) => x.id === Number(tr.dataset.id));
    openTxn(f, loadFuel);
  }));
}

(async () => {
  const me = await Shell.init('fuel');
  const canCapture = me.permissions.includes('fuel.verify');
  const { data: look } = await Api.get('/fuel/lookups');
  lookups = look;

  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Fuel log</h1>
      <p class="page-sub">Every fuel transaction — verify to post to the general ledger, or reject to refer back to the supplier.</p></div>
      ${canCapture ? '<button class="btn btn-primary" id="capture-btn">+ Capture transaction</button>' : ''}</div>
    <div class="card" id="tbl"></div>`;

  if (canCapture) document.getElementById('capture-btn').addEventListener('click', openCapture);
  await loadFuel();
})();
