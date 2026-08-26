// Reports & export — CSV only in this build (see scoping notes). Department managers automatically
// get department-scoped rows from the API, not the full org.
async function loadCheckins() {
  const { data } = await Api.get('/reports/checkins');
  document.getElementById('checkins-tbl').innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Employee</th><th>Department</th><th>Decision</th><th>Distance</th><th>Zone</th><th>Started</th><th>Ended</th>
  </tr></thead><tbody>${data.map((r) => `<tr>
    <td>${esc(r.full_legal_name)}</td><td>${esc(r.department || '—')}</td><td>${esc(r.decision)}</td>
    <td>${r.distance_m ?? '—'}m</td><td>${esc(r.zone_name || '—')}</td><td>${fmtTime(r.shift_started_at)}</td><td>${r.shift_ended_at ? fmtTime(r.shift_ended_at) : '—'}</td>
  </tr>`).join('') || '<tr><td colspan="7">No check-ins yet</td></tr>'}</tbody></table></div>`;
}

async function loadAlerts() {
  const { data } = await Api.get('/reports/alerts');
  document.getElementById('alerts-tbl').innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Employee</th><th>Department</th><th>Severity</th><th>Zone</th><th>Kind</th><th>When</th>
  </tr></thead><tbody>${data.map((r) => `<tr>
    <td>${esc(r.full_legal_name || '—')}</td><td>${esc(r.department || '—')}</td><td>${esc(r.severity)}</td>
    <td>${esc(r.zone_name || '—')}</td><td>${esc(r.kind)}</td><td>${fmtTime(r.created_at)}</td>
  </tr>`).join('') || '<tr><td colspan="6">No alerts yet</td></tr>'}</tbody></table></div>`;
}

(async () => {
  await Shell.init('reports');
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Reports &amp; export</h1>
      <p class="page-sub">CSV export of check-in and alert history. PDF/XLSX letterhead exports are a future addition.</p></div></div>
    <div class="page-head"><div><h1 style="font-size:16px;">Check-ins</h1></div></div>
    <a class="btn btn-ghost" href="/api/v1/reports/checkins?format=csv" style="margin-bottom:12px;display:inline-block;">⬇ Export CSV</a>
    <div class="card" id="checkins-tbl"></div>
    <div class="page-head" style="margin-top:24px;"><div><h1 style="font-size:16px;">Alerts</h1></div></div>
    <a class="btn btn-ghost" href="/api/v1/reports/alerts?format=csv" style="margin-bottom:12px;display:inline-block;">⬇ Export CSV</a>
    <div class="card" id="alerts-tbl"></div>`;
  await loadCheckins();
  await loadAlerts();
})();
