// Chart palette derived from the app's own CSS tokens (--color-primary, --color-accent-2, etc.)
// so charts read as part of the same design system rather than a bolted-on library's defaults.
const PALETTE = ['#12557f', '#1c8a63', '#8a5a00', '#9a3324', '#5b7c99', '#3d8f80', '#6b4f8f', '#a67c3d'];
const STATUS_COLORS = {
  approved: '#1c8a63', completed: '#1c8a63', hired: '#1c8a63', active: '#1c8a63', valid: '#1c8a63',
  pending: '#8a5a00', screening: '#8a5a00', interview: '#8a5a00', offer: '#8a5a00', in_progress: '#8a5a00', 'expiring within 90 days': '#8a5a00',
  declined: '#9a3324', rejected: '#9a3324', failed: '#9a3324', expired: '#9a3324', cancelled: '#5b6672',
  applied: '#5b7c99', enrolled: '#5b7c99', 'no expiry': '#5b7c99',
};

function monthLabel(ym) {
  const [y, m] = String(ym).split('-');
  if (!m) return ym;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}
function dayLabel(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function titleCase(s) {
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function colorFor(label, index) {
  const key = String(label).toLowerCase();
  return STATUS_COLORS[key] || PALETTE[index % PALETTE.length];
}

// Candidate quick-action shortcuts — each gated by a scope check against the viewer's own
// resolved scope, same shape as `shellData.scope.<module>.<action>` used everywhere else in
// this app. Only shortcuts the viewer's role/data_scope actually permits are ever offered as
// choosable, which is the RBAC half of dashboard personalization; the DATA behind every KPI and
// chart is already scope-filtered server-side in dashboard.routes.js — this list only controls
// which one-click links appear, not what data anyone can see.
const SHORTCUT_CATALOG = [
  { key: 'add-employee', label: '+ Add employee', href: '/directory.html', module: 'people', action: 'create' },
  { key: 'new-leave', label: '+ New leave request', href: '/leave.html', module: 'leave', action: 'create' },
  { key: 'clock', label: 'Clock in / out', href: '/attendance.html', module: 'attendance', action: 'create' },
  { key: 'new-payroll-run', label: '+ New payroll run', href: '/payroll.html', module: 'payroll', action: 'create' },
  { key: 'new-training', label: '+ New training enrollment', href: '/training.html', module: 'training', action: 'create' },
  { key: 'new-asset-decl', label: '+ Add asset declaration', href: '/assets.html', module: 'assets', action: 'create' },
];

(async () => {
  const shellData = await Shell.init('dashboard');
  document.getElementById('welcome-sub').textContent = `${shellData.user.name} · ${shellData.user.role}`;
  const canApproveLeave = !!(shellData.scope.leave && shellData.scope.leave.update);

  const [{ kpis, recentLeave, charts }, { data: prefsData }] = await Promise.all([
    Api.get('/dashboard/summary'),
    Api.get('/preferences'),
  ]);

  // Server-side, per-user preferences — replaces an earlier admin-only, browser-localStorage
  // version so every role can personalize their own dashboard and it follows them across
  // devices. `prefs` is mutated in place and pushed back with saveDashboardPrefs().
  const prefs = Object.assign({ hiddenKpis: [], hiddenCharts: [], quickShortcuts: null }, prefsData.dashboard || {});
  async function saveDashboardPrefs() {
    try { await Api.put('/preferences', { dashboard: prefs }); } catch (e) { Api.toast('Could not save dashboard preferences', 'error'); }
  }

  const eligibleShortcuts = SHORTCUT_CATALOG.filter((s) => shellData.scope[s.module] && shellData.scope[s.module][s.action]);
  // First time a user visits (quickShortcuts still null), default to every shortcut they're
  // eligible for so the row isn't empty before they've had a chance to configure it.
  if (prefs.quickShortcuts === null) prefs.quickShortcuts = eligibleShortcuts.map((s) => s.key);

  function renderShortcuts() {
    const row = document.getElementById('quick-shortcuts-row');
    const enabled = new Set(prefs.quickShortcuts || []);
    const chosen = eligibleShortcuts.filter((s) => enabled.has(s.key));
    row.innerHTML = chosen.map((s) => `<a class="btn btn-ghost btn-sm" href="${s.href}">${s.label}</a>`).join('');
  }
  renderShortcuts();

  const allCards = [
    { key: 'headcount', label: 'Active headcount (in scope)', value: kpis.headcount },
    { key: 'pendingLeave', label: 'Pending leave requests', value: kpis.pendingLeave },
    { key: 'attendanceToday', label: 'Clocked in today', value: kpis.attendanceToday },
    { key: 'openRequisitions', label: 'Open requisitions', value: kpis.openRequisitions },
  ];
  if (kpis.payrollRun) {
    allCards.push({ key: 'payrollRun', label: `Payroll run ${kpis.payrollRun.period}`, value: kpis.payrollRun.status.replace('_', ' ') });
  }
  allCards.push({ key: 'expiringCerts', label: 'Certifications expiring (90d)', value: kpis.expiringCertifications });

  function renderKpis() {
    const hidden = new Set(prefs.hiddenKpis || []);
    const kpiGrid = document.getElementById('kpi-grid');
    kpiGrid.innerHTML = allCards.filter((c) => !hidden.has(c.key)).map((c) => `
      <div class="card kpi"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>
    `).join('');
  }
  renderKpis();

  const tbody = document.querySelector('#leave-table tbody');
  if (!recentLeave.length) {
    document.getElementById('leave-empty').style.display = 'block';
  } else {
    tbody.innerHTML = recentLeave.map((l) => `
      <tr>
        <td>${l.full_legal_name}</td>
        <td>${l.leave_type}</td>
        <td>${l.start_date} → ${l.end_date}</td>
        <td>${l.days}</td>
        <td><span class="badge ${l.status === 'approved' ? 'badge-success' : l.status === 'declined' ? 'badge-danger' : 'badge-warning'}">${l.status}</span></td>
      </tr>
    `).join('');
  }

  // ==========================================================================================
  // Interactive charts — Chart.js (vendored locally, no CDN). Every chart is scope-filtered
  // server-side already (dashboard.routes.js), so what renders here is exactly what the viewer
  // is allowed to see — payroll/recruitment/training charts simply aren't in the payload at all
  // for a role without read access to that module. Hiding a chart via preferences is a purely
  // cosmetic, per-viewer choice layered on top of that — never a substitute for it.
  // ==========================================================================================
  Chart.defaults.font.family = "'Barlow', Arial, sans-serif";
  Chart.defaults.color = '#5b6672';

  function chartCard(canvasId, title, total, short) {
    const card = document.createElement('div');
    card.className = 'card chart-card';
    card.innerHTML = `<h3><span>${title}</span>${total != null ? `<span class="chart-total">${total}</span>` : ''}</h3>
      <div class="chart-canvas-wrap${short ? ' short' : ''}"><canvas id="${canvasId}"></canvas></div>`;
    return card;
  }
  function emptyCard(title) {
    const card = document.createElement('div');
    card.className = 'card chart-card';
    card.innerHTML = `<h3><span>${title}</span></h3><div class="empty-state">No data yet.</div>`;
    return card;
  }

  function doughnut(canvasId, rows, labelFn) {
    const ctx = document.getElementById(canvasId);
    const labels = rows.map((r) => (labelFn ? labelFn(r.label) : titleCase(r.label)));
    return new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: rows.map((r) => Number(r.value)), backgroundColor: rows.map((r, i) => colorFor(r.label, i)), borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (item) => `${item.label}: ${item.formattedValue}` } },
        },
      },
    });
  }

  function lineChart(canvasId, rows, labelFn, color) {
    const ctx = document.getElementById(canvasId);
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: rows.map((r) => (labelFn ? labelFn(r.label) : r.label)),
        datasets: [{
          data: rows.map((r) => Number(r.value)), borderColor: color, backgroundColor: color + '26',
          fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: color,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
      },
    });
  }

  function barChart(canvasId, rows, labelFn) {
    const ctx = document.getElementById(canvasId);
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map((r) => (labelFn ? labelFn(r.label) : titleCase(r.label))),
        datasets: [{ data: rows.map((r) => Number(r.value)), backgroundColor: rows.map((r, i) => colorFor(r.label, i)), borderRadius: 3, maxBarThickness: 42 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => `${item.formattedValue}` } } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
      },
    });
  }

  // Every available chart, data-driven, so hiding one via preferences is a simple filter rather
  // than duplicated conditional blocks. `key` is what's stored in prefs.hiddenCharts.
  const CHART_DEFS = [
    {
      key: 'dept', area: 'primary', available: () => charts.headcountByDept && charts.headcountByDept.length,
      title: 'Headcount by department',
      render: (container) => {
        const total = charts.headcountByDept.reduce((s, r) => s + Number(r.value), 0);
        container.appendChild(chartCard('c-dept', 'Headcount by department', `${total} total`));
        doughnut('c-dept', charts.headcountByDept);
      },
    },
    {
      key: 'hires', area: 'primary', available: () => true, title: 'Hires by month (12mo)',
      render: (container) => {
        if (charts.hiresTrend && charts.hiresTrend.length) {
          container.appendChild(chartCard('c-hires', 'Hires by month (12mo)'));
          lineChart('c-hires', charts.hiresTrend, monthLabel, '#12557f');
        } else {
          container.appendChild(emptyCard('Hires by month (12mo)'));
        }
      },
    },
    {
      key: 'leave-status', area: 'secondary', available: () => charts.leaveByStatus && charts.leaveByStatus.length,
      title: 'Leave requests by status',
      render: (container) => { container.appendChild(chartCard('c-leave-status', 'Leave requests by status', null, true)); doughnut('c-leave-status', charts.leaveByStatus); },
    },
    {
      key: 'leave-trend', area: 'secondary', available: () => charts.leaveTrend && charts.leaveTrend.length,
      title: 'Leave requests (6mo)',
      render: (container) => { container.appendChild(chartCard('c-leave-trend', 'Leave requests (6mo)', null, true)); barChart('c-leave-trend', charts.leaveTrend, monthLabel); },
    },
    {
      key: 'attendance', area: 'secondary', available: () => charts.attendanceTrend && charts.attendanceTrend.length,
      title: 'Daily attendance (14d)',
      render: (container) => { container.appendChild(chartCard('c-attendance', 'Daily attendance (14d)', null, true)); lineChart('c-attendance', charts.attendanceTrend, dayLabel, '#1c8a63'); },
    },
    {
      key: 'contract', area: 'secondary', available: () => charts.headcountByContract && charts.headcountByContract.length,
      title: 'Headcount by contract type',
      render: (container) => { container.appendChild(chartCard('c-contract', 'Headcount by contract type', null, true)); doughnut('c-contract', charts.headcountByContract); },
    },
    {
      key: 'certs', area: 'secondary', available: () => charts.certificationStatus && charts.certificationStatus.length,
      title: 'Certification status',
      render: (container) => { container.appendChild(chartCard('c-certs', 'Certification status', null, true)); doughnut('c-certs', charts.certificationStatus); },
    },
    {
      key: 'payroll', area: 'secondary', available: () => charts.payrollTrend && charts.payrollTrend.length,
      title: 'Net pay by period',
      render: (container) => { container.appendChild(chartCard('c-payroll', 'Net pay by period', null, true)); barChart('c-payroll', charts.payrollTrend, null); },
    },
    {
      key: 'recruit', area: 'secondary', available: () => charts.recruitmentFunnel && charts.recruitmentFunnel.length,
      title: 'Recruitment funnel',
      render: (container) => { container.appendChild(chartCard('c-recruit', 'Recruitment funnel', null, true)); barChart('c-recruit', charts.recruitmentFunnel, titleCase); },
    },
    {
      key: 'training', area: 'secondary', available: () => charts.trainingCompletion && charts.trainingCompletion.length,
      title: 'Training completion',
      render: (container) => { container.appendChild(chartCard('c-training', 'Training completion', null, true)); doughnut('c-training', charts.trainingCompletion); },
    },
  ];

  function renderCharts() {
    const primary = document.getElementById('chart-grid-primary');
    const secondary = document.getElementById('chart-grid-secondary');
    primary.innerHTML = '';
    secondary.innerHTML = '';
    const hidden = new Set(prefs.hiddenCharts || []);
    for (const def of CHART_DEFS) {
      if (hidden.has(def.key) || !def.available()) continue;
      def.render(def.area === 'primary' ? primary : secondary);
    }
  }
  renderCharts();

  // ---- Quick actions drawer: pending approvals + personal dashboard display options ----
  document.getElementById('quick-actions-btn').addEventListener('click', async () => {
    let pending = [];
    if (canApproveLeave) {
      try { pending = (await Api.get('/leave/requests?status=pending')).data; } catch (e) { pending = []; }
    }

    const pendingHtml = canApproveLeave ? `
      <div class="drawer-group">
        <div class="drawer-group-label">Pending leave approvals (${pending.length})</div>
        <div id="qa-pending-list">${pending.length ? pending.map((l) => `
          <div class="row between" style="padding:8px 0;border-bottom:1px solid var(--color-neutral-200)" data-leave-row="${l.id}">
            <div>
              <div style="font-size:13px;font-weight:600">${l.full_legal_name}</div>
              <div class="faint">${l.leave_type} · ${l.start_date} → ${l.end_date} · ${l.days} day(s)</div>
            </div>
            <div class="row" style="gap:6px">
              <button class="btn btn-primary btn-sm" data-approve="${l.id}">Approve</button>
              <button class="btn btn-ghost btn-sm" data-decline="${l.id}">Decline</button>
            </div>
          </div>
        `).join('') : '<div class="faint">Nothing pending — you\'re all caught up.</div>'}</div>
      </div>` : '';

    // Personalization is available to EVERY role, not just admins — it's a per-viewer cosmetic
    // choice (what shows on MY OWN dashboard), not a privileged action. The underlying data is
    // already scope-filtered server-side regardless of what's shown/hidden here.
    const shortcutsHtml = eligibleShortcuts.length ? `
      <div class="drawer-group">
        <div class="drawer-group-label">Quick-action shortcuts</div>
        <div class="stack" id="qa-shortcut-toggles">
          ${eligibleShortcuts.map((s) => `
            <label class="row" style="gap:8px;cursor:pointer">
              <input type="checkbox" data-shortcut-toggle="${s.key}" style="width:auto" ${(prefs.quickShortcuts || []).includes(s.key) ? 'checked' : ''} />
              <span>${s.label}</span>
            </label>
          `).join('')}
        </div>
      </div>` : '';

    const kpiToggleHtml = `
      <div class="drawer-group">
        <div class="drawer-group-label">KPI cards shown</div>
        <div class="stack" id="qa-kpi-toggles">
          ${allCards.map((c) => `
            <label class="row" style="gap:8px;cursor:pointer">
              <input type="checkbox" data-kpi-toggle="${c.key}" style="width:auto" ${(prefs.hiddenKpis || []).includes(c.key) ? '' : 'checked'} />
              <span>${c.label}</span>
            </label>
          `).join('')}
        </div>
      </div>`;

    const chartToggleHtml = `
      <div class="drawer-group">
        <div class="drawer-group-label">Charts shown</div>
        <div class="stack" id="qa-chart-toggles">
          ${CHART_DEFS.filter((d) => d.available()).map((d) => `
            <label class="row" style="gap:8px;cursor:pointer">
              <input type="checkbox" data-chart-toggle="${d.key}" style="width:auto" ${(prefs.hiddenCharts || []).includes(d.key) ? '' : 'checked'} />
              <span>${d.title}</span>
            </label>
          `).join('')}
        </div>
      </div>`;

    Drawer.open({
      title: 'Quick actions',
      sub: 'Process pending tasks and personalize what shows on your dashboard.',
      groups: [],
      people: [],
    });
    // Drawer's generic groups/people renderer doesn't support inline action buttons or checkbox
    // toggles — append the interactive content directly, same pattern used elsewhere for
    // injecting controls Drawer's declarative API doesn't cover.
    const body = document.querySelector('.drawer');
    if (body) {
      const wrap = document.createElement('div');
      wrap.innerHTML = pendingHtml + shortcutsHtml + kpiToggleHtml + chartToggleHtml;
      body.appendChild(wrap);

      wrap.querySelectorAll('[data-approve], [data-decline]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.approve || btn.dataset.decline;
          const status = btn.dataset.approve ? 'approved' : 'declined';
          btn.closest('.row.between').style.opacity = '0.5';
          try {
            await Api.put(`/leave/requests/${id}/decide`, { status });
            Api.toast(`Leave ${status}`, 'success');
            document.querySelector(`[data-leave-row="${id}"]`).remove();
          } catch (err) {
            Api.toast(err.message, 'error');
          }
        });
      });

      wrap.querySelectorAll('[data-shortcut-toggle]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const s = new Set(prefs.quickShortcuts || []);
          if (cb.checked) s.add(cb.dataset.shortcutToggle); else s.delete(cb.dataset.shortcutToggle);
          prefs.quickShortcuts = [...s];
          renderShortcuts();
          saveDashboardPrefs();
        });
      });

      wrap.querySelectorAll('[data-kpi-toggle]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const h = new Set(prefs.hiddenKpis || []);
          if (cb.checked) h.delete(cb.dataset.kpiToggle); else h.add(cb.dataset.kpiToggle);
          prefs.hiddenKpis = [...h];
          renderKpis();
          saveDashboardPrefs();
        });
      });

      wrap.querySelectorAll('[data-chart-toggle]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const h = new Set(prefs.hiddenCharts || []);
          if (cb.checked) h.delete(cb.dataset.chartToggle); else h.add(cb.dataset.chartToggle);
          prefs.hiddenCharts = [...h];
          renderCharts();
          saveDashboardPrefs();
        });
      });
    }
  });
})();
