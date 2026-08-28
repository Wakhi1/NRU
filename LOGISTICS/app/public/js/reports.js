const REPORT_TYPES = [
  { value: 'fuel_by_vehicle', label: 'Fuel consumption by vehicle' },
  { value: 'trip_cost_by_department', label: 'Trip cost by department' },
  { value: 'workshop_spend', label: 'Workshop spend' },
  { value: 'fleet_utilisation', label: 'Fleet utilisation' },
];
const PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'all_time', label: 'All time' },
];

function fmtCell(key, value) {
  if (value == null) return '—';
  if (/cost|amount/i.test(key)) return fmtMoney(value);
  return esc(String(value));
}

async function runReport(canExport) {
  const type = document.getElementById('report-type').value;
  const period = document.getElementById('report-period').value;
  const box = document.getElementById('report-body');
  box.innerHTML = '<p class="muted">Loading…</p>';

  const { data } = await Api.get(`/reports/${type}?period=${period}`);
  const exportLink = document.getElementById('export-link');
  if (canExport) exportLink.href = `/api/v1/reports/${type}/export?period=${period}`;

  if (data.rows.length === 0) {
    box.innerHTML = '<div class="empty-state">No data for this report and period.</div>';
    return;
  }

  box.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    ${data.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}
  </tr></thead><tbody>${data.rows.map((r) => `<tr>
    ${data.columns.map((c) => `<td>${fmtCell(c.key, r[c.key])}</td>`).join('')}
  </tr>`).join('')}</tbody></table></div>`;
}

(async () => {
  const me = await Shell.init('reports');
  const canExport = me.permissions.includes('report.export');

  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Reports &amp; export</h1>
      <p class="page-sub">Run a report against the fleet, trip, fuel and workshop data, then export to CSV.</p></div></div>
    <div class="card">
      <div class="toolbar">
        <select id="report-type">${REPORT_TYPES.map((t) => `<option value="${t.value}">${esc(t.label)}</option>`).join('')}</select>
        <select id="report-period">${PERIODS.map((p) => `<option value="${p.value}">${esc(p.label)}</option>`).join('')}</select>
        <button class="btn btn-primary" id="run-btn">Run report</button>
        ${canExport ? `<a class="btn btn-ghost" id="export-link" href="#" download>Export CSV</a>` : ''}
      </div>
      <div id="report-body"></div>
    </div>`;

  document.getElementById('run-btn').addEventListener('click', () => runReport(canExport));
  await runReport(canExport);
})();
