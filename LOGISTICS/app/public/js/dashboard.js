function statusChip(s) {
  const map = { 'On trip': 'badge-info', Available: 'badge-success', Workshop: 'badge-warning', Grounded: 'badge-danger' };
  return `<span class="badge ${map[s] || 'badge-neutral'}">${esc(s)}</span>`;
}

(async () => {
  const me = await Shell.init('dashboard');
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Command overview</h1>
      <p class="page-sub">Fleet availability, trip queue, fuel spend and workshop load at a glance.</p></div></div>
    <div id="kpis" class="grid grid-4" style="margin-bottom:14px"></div>
    <div class="grid grid-2">
      <div class="card">
        <h3 style="margin-top:0">Fleet by status</h3>
        <div id="status-rows"></div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Top fuel consumers this month</h3>
        <div id="consumers"></div>
      </div>
    </div>`;

  const { data } = await Api.get('/dashboard');

  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><span class="label">Fleet available</span><span class="value">${data.fleetAvailable} / ${data.fleetTotal}</span><span class="delta">vehicles ready to dispatch</span></div>
    <div class="kpi"><span class="label">Trips pending</span><span class="value">${data.pendingTrips}</span><span class="delta">${data.activeTrips} currently in progress</span></div>
    <div class="kpi"><span class="label">Fuel this month</span><span class="value">${data.fuelLitresThisMonth.toFixed(0)} L</span><span class="delta">${fmtMoney(data.fuelCostThisMonth)} spent</span></div>
    <div class="kpi"><span class="label">Workshop load</span><span class="value">${data.openWorkOrders}</span><span class="delta ${data.fuelExceptions ? 'down' : ''}">${data.fuelExceptions} fuel exception(s)</span></div>`;

  document.getElementById('status-rows').innerHTML = data.statusCounts.length
    ? `<div class="stack">${data.statusCounts.map((s) => `<div class="row between"><span>${statusChip(s.status)}</span><b>${s.n}</b></div>`).join('')}</div>`
    : '<p class="muted">No vehicles registered yet.</p>';

  document.getElementById('consumers').innerHTML = data.topConsumers.length
    ? `<div class="tbl-wrap"><table><thead><tr><th>Vehicle</th><th>Litres</th><th>Cost</th></tr></thead><tbody>
        ${data.topConsumers.map((c) => `<tr><td>${esc(c.reg_no)} <span class="faint">${esc(c.model)}</span></td><td>${Number(c.litres).toFixed(1)} L</td><td>${fmtMoney(c.cost)}</td></tr>`).join('')}
      </tbody></table></div>`
    : '<p class="muted">No fuel transactions this month.</p>';
})();
