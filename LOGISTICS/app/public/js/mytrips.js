let lookups = { vehicles: [], employees: [] };

function statusChip(s) {
  const map = { Pending: 'badge-warning', 'In progress': 'badge-info', Completed: 'badge-success', Rejected: 'badge-danger' };
  return `<span class="badge ${map[s] || 'badge-neutral'}">${esc(s)}</span>`;
}

function openRequest() {
  FormDrawer.open({
    title: 'Request a trip',
    sub: 'Submitted for Transport Officer authorisation before a vehicle is dispatched',
    sections: [{ label: 'Trip details', fields: [
      { key: 'origin', label: 'Origin', value: 'Mbabane HQ', required: true, hint: 'e.g. Mbabane HQ' },
      { key: 'destination', label: 'Destination', value: '', required: true, hint: 'e.g. Siteki Clinic' },
      { key: 'vehicle_id', label: 'Preferred vehicle', type: 'select', value: '', numeric: true,
        options: [{ value: '', label: '— let the Transport Officer assign —' }, ...lookups.vehicles.map((v) => ({ value: v.id, label: `${v.reg_no} · ${v.model}` }))] },
      { key: 'driver_employee_no', label: 'Preferred driver', type: 'select', value: '',
        options: [{ value: '', label: '— let the Transport Officer assign —' }, ...lookups.employees.map((e) => ({ value: e.employee_no, label: e.full_legal_name }))] },
      { key: 'distance_km', label: 'Estimated distance (km)', type: 'number', value: '', required: true, numeric: true },
      { key: 'purpose', label: 'Purpose', type: 'textarea', value: '', hint: 'e.g. Field data collection' },
    ] }],
    primaryLabel: 'Submit for authorisation',
    onSave: async (values) => {
      await Api.post('/trips', { ...values, vehicle_id: values.vehicle_id || null, driver_employee_no: values.driver_employee_no || null });
      Api.toast('Trip request submitted');
      loadMine();
    },
  });
}

function viewTrip(t) {
  FormDrawer.open({
    title: `${t.trip_code} · ${t.origin} → ${t.destination}`,
    sub: `${fmtTime(t.requested_at)} · ${t.purpose || 'Official duty'}`,
    readOnly: true,
    sections: [{ label: 'Trip record', fields: [
      { key: 'status', label: 'Status', value: t.status },
      { key: 'vehicle', label: 'Vehicle', value: t.reg_no ? `${t.reg_no} · ${t.model}` : 'Not yet assigned' },
      { key: 'driver', label: 'Driver', value: t.driver_name || 'Not yet assigned' },
      { key: 'distance', label: 'Distance', value: `${Number(t.distance_km).toLocaleString()} km` },
      { key: 'cost', label: 'Cost', value: t.cost != null ? fmtMoney(t.cost) : 'Posts on close' },
    ] }],
  });
}

async function loadMine() {
  const { data } = await Api.get('/trips/mine');
  const tbl = document.getElementById('tbl');
  tbl.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Trip</th><th>Route</th><th>Vehicle</th><th>Requested</th><th>Status</th>
  </tr></thead><tbody>${data.map((t) => `<tr class="clickable" data-id="${t.id}">
    <td>${esc(t.trip_code)}</td><td>${esc(t.origin)} → ${esc(t.destination)}</td>
    <td>${esc(t.reg_no || 'Not yet assigned')}</td><td>${fmtTime(t.requested_at)}</td><td>${statusChip(t.status)}</td>
  </tr>`).join('') || '<tr><td colspan="5">You have not requested any trips yet</td></tr>'}</tbody></table></div>`;

  [...tbl.querySelectorAll('tr[data-id]')].forEach((tr) => tr.addEventListener('click', () => {
    const t = data.find((x) => x.id === Number(tr.dataset.id));
    viewTrip(t);
  }));
}

(async () => {
  await Shell.init('mytrips');
  const { data: look } = await Api.get('/trips/lookups');
  lookups = look;

  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>My trips</h1>
      <p class="page-sub">Request a vehicle for official travel and track its authorisation status.</p></div>
      <button class="btn btn-primary" id="request-btn">+ Request a trip</button></div>
    <div class="card" id="tbl"></div>`;

  document.getElementById('request-btn').addEventListener('click', openRequest);
  await loadMine();
})();
