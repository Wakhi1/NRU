// Executive overview — organisation totals only, never an individual position (architecture doc §3.3).
(async () => {
  await Shell.init('exec');
  const { data } = await Api.get('/exec/summary');
  const confirmed = data.todayCheckins.find((c) => c.decision === 'confirmed')?.n || 0;
  const outside = data.todayCheckins.find((c) => c.decision === 'outside')?.n || 0;

  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Executive overview</h1>
      <p class="page-sub">Organisation totals only — no individual-level location or timesheet data appears on this screen.</p></div></div>
    <div class="grid grid-3" style="margin-bottom:16px;">
      <div class="card kpi"><span class="label">Active employees</span><span class="value">${data.headcount}</span></div>
      <div class="card kpi"><span class="label">On shift right now</span><span class="value">${data.onShift}</span></div>
      <div class="card kpi"><span class="label">Geofence zones</span><span class="value">${data.zones}</span></div>
      <div class="card kpi"><span class="label">Open alerts</span><span class="value">${data.openAlerts}</span></div>
      <div class="card kpi"><span class="label">Confirmed check-ins today</span><span class="value">${confirmed}</span></div>
      <div class="card kpi"><span class="label">Outside-zone attempts today</span><span class="value">${outside}</span></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h3 style="margin-top:0;">Headcount by department</h3>
        ${data.byDepartment.map((d) => barRow(d.department, d.n, data.headcount)).join('') || '<p class="note">No data</p>'}
      </div>
      <div class="card">
        <h3 style="margin-top:0;">Fleet status</h3>
        ${data.deviceStatus.map((d) => barRow(d.status, d.n, Math.max(1, data.deviceStatus.reduce((a, b) => a + b.n, 0)))).join('') || '<p class="note">No devices registered</p>'}
      </div>
    </div>`;
})();

function barRow(label, n, total) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return `<div style="margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;"><span>${esc(label)}</span><b>${n}</b></div>
    <div style="height:6px;background:var(--color-neutral-300);"><div style="height:100%;width:${pct}%;background:var(--color-primary);"></div></div>
  </div>`;
}
