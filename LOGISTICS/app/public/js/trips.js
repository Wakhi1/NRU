function statusChip(s) {
  const map = { Pending: 'badge-warning', 'In progress': 'badge-info', Completed: 'badge-success', Rejected: 'badge-danger' };
  return `<span class="badge ${map[s] || 'badge-neutral'}">${esc(s)}</span>`;
}

function tripActionsHtml(t) {
  if (t.status === 'Pending') {
    return `<div class="row" style="gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" id="act-reject" style="color:var(--color-danger)">Reject</button>
      <button class="btn btn-primary btn-sm" id="act-authorise">Authorise trip</button>
    </div>`;
  }
  if (t.status === 'In progress') {
    return `<div class="row" style="gap:8px;justify-content:flex-end">
      <button class="btn btn-primary btn-sm" id="act-close">Close trip</button>
    </div>`;
  }
  return '';
}

async function openTrip(t, reload) {
  FormDrawer.open({
    title: `${t.trip_code} · ${t.origin} → ${t.destination}`,
    sub: `${fmtTime(t.requested_at)} · ${t.purpose || 'Official duty'}`,
    readOnly: true,
    sections: [{ label: 'Trip record', fields: [
      { key: 'status', label: 'Status', value: t.status },
      { key: 'vehicle', label: 'Vehicle', value: t.reg_no ? `${t.reg_no} · ${t.model}` : '—' },
      { key: 'driver', label: 'Driver', value: t.driver_name || 'Unassigned' },
      { key: 'requester', label: 'Requested by', value: t.requester_name || '—' },
      { key: 'distance', label: 'Distance', value: `${Number(t.distance_km).toLocaleString()} km` },
      { key: 'cost', label: 'Cost', value: t.cost != null ? fmtMoney(t.cost) : 'Posts on close' },
    ] }],
    extraHtml: `<div class="divider"></div>${tripActionsHtml(t)}`,
    afterRender: (root) => {
      const authBtn = root.querySelector('#act-authorise');
      const rejectBtn = root.querySelector('#act-reject');
      const closeBtn = root.querySelector('#act-close');
      async function run(action, btn) {
        btn.disabled = true;
        try {
          const { data } = await Api.put(`/trips/${t.id}/decision`, { action });
          FormDrawer.close();
          (data.warnings || []).forEach((w) => Api.toast(w, true));
          Api.toast(`${t.trip_code} ${action === 'authorise' ? 'authorised' : action === 'reject' ? 'rejected' : 'closed'}`);
          reload();
        } catch (err) {
          Api.toast(err.message, true);
          btn.disabled = false;
        }
      }
      if (authBtn) authBtn.addEventListener('click', () => run('authorise', authBtn));
      if (rejectBtn) rejectBtn.addEventListener('click', () => { if (confirm('Reject this trip request?')) run('reject', rejectBtn); });
      if (closeBtn) closeBtn.addEventListener('click', () => run('close', closeBtn));
    },
  });
}

async function loadTrips() {
  const { data } = await Api.get('/trips');
  const tbl = document.getElementById('tbl');
  tbl.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Trip</th><th>Route</th><th>Vehicle</th><th>Driver</th><th>Requester</th><th>Distance</th><th>Status</th>
  </tr></thead><tbody>${data.map((t) => `<tr class="clickable" data-id="${t.id}">
    <td>${esc(t.trip_code)}</td><td>${esc(t.origin)} → ${esc(t.destination)}</td>
    <td>${esc(t.reg_no || '—')}</td><td>${esc(t.driver_name || 'Unassigned')}</td><td>${esc(t.requester_name || '—')}</td>
    <td>${Number(t.distance_km).toLocaleString()} km</td><td>${statusChip(t.status)}</td>
  </tr>`).join('') || '<tr><td colspan="7">No trips in the queue</td></tr>'}</tbody></table></div>`;

  [...tbl.querySelectorAll('tr[data-id]')].forEach((tr) => tr.addEventListener('click', () => {
    const t = data.find((x) => x.id === Number(tr.dataset.id));
    openTrip(t, loadTrips);
  }));
}

(async () => {
  await Shell.init('trips');
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Trip authorisation</h1>
      <p class="page-sub">Authorise, reject or close trip requests. Closing posts the fuel cost to the vehicle's cost centre.</p></div></div>
    <div class="card" id="tbl"></div>`;
  await loadTrips();
})();
