// Renders the sidebar + topbar chrome on every page and exposes Shell.init(activeKey).
// Each page's own <script> calls Shell.init('leave') etc. after including this file.
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: '/index.html', module: null, group: '' },
  { key: 'directory', label: 'People records', href: '/directory.html', module: 'people', group: 'People' },
  { key: 'org', label: 'Org & groups', href: '/org.html', module: 'org', group: '' },
  { key: 'attendance', label: 'Time & attendance', href: '/attendance.html', module: 'attendance', group: 'Operations' },
  { key: 'leave', label: 'Leave', href: '/leave.html', module: 'leave', group: '' },
  { key: 'benefits', label: 'Benefits', href: '/benefits.html', module: 'benefits', group: '' },
  { key: 'payroll', label: 'Payroll', href: '/payroll.html', module: 'payroll', group: '' },
  { key: 'recruitment', label: 'Recruitment', href: '/recruitment.html', module: 'recruitment', group: '' },
  { key: 'performance', label: 'Performance', href: '/performance.html', module: 'performance', group: 'Development' },
  { key: 'succession', label: 'Succession', href: '/succession.html', module: 'succession', group: '' },
  { key: 'training', label: 'Training', href: '/training.html', module: 'training', group: '' },
  { key: 'intake', label: 'External data', href: '/intake.html', module: 'intake', group: 'Data' },
  { key: 'crm', label: 'CRM & programmes', href: '/crm.html', module: 'crm', group: '' },
  { key: 'voip', label: 'VoIP directory', href: '/voip.html', module: 'voip', group: '' },
  { key: 'reports', label: 'Reports', href: '/reports.html', module: 'reports', group: 'Insight' },
  { key: 'audit', label: 'Audit trail', href: '/audit.html', module: null, group: '', roles: ['HR administrator', 'System administrator'] },
  { key: 'integration', label: 'Integrations', href: '/integration.html', module: null, group: '', roles: ['HR administrator', 'System administrator'] },
  { key: 'assets', label: 'Asset declarations', href: '/assets.html', module: 'assets', group: 'Organisation' },
  { key: 'self', label: 'My workspace', href: '/self-service.html', module: null, group: '' },
  { key: 'settings', label: 'Settings', href: '/settings.html', module: null, group: '' },
];

const Shell = (() => {
  let meCache = null;

  async function me() {
    if (!meCache) meCache = await Api.get('/auth/me');
    return meCache;
  }

  function initials(name) {
    return name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
  }

  function avatarHtml(user) {
    if (user.photoUrl) return `<div class="avatar avatar-photo" style="background-image:url('${user.photoUrl}')"></div>`;
    return `<div class="avatar">${initials(user.name)}</div>`;
  }

  function renderNav(scope, activeKey, role) {
    let html = '';
    let lastGroup = '__none__';
    for (const item of NAV_ITEMS) {
      if (item.module && !(scope[item.module] && scope[item.module].read)) continue;
      if (item.roles && !item.roles.includes(role)) continue;
      if (item.group !== lastGroup) {
        if (item.group) html += `<div class="sidebar-group-label">${item.group}</div>`;
        lastGroup = item.group;
      }
      html += `<a class="sidebar-link ${item.key === activeKey ? 'active' : ''}" href="${item.href}">${item.label}</a>`;
    }
    return html;
  }

  function formatClock() {
    const now = new Date();
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  async function init(activeKey) {
    const [data, branding] = await Promise.all([me(), Api.getBranding()]);
    const root = document.createElement('div');
    root.id = 'shell-root';
    root.innerHTML = `
      <div class="sidebar-scrim"></div>
      <aside class="sidebar">
        <div class="sidebar-brand"><span class="brand-mark-crop" style="background-image:url('${branding.logo_url}')"></span><span class="brand-text">HRIS</span></div>
        <nav class="sidebar-nav">${renderNav(data.scope, activeKey, data.user.role)}</nav>
        <div class="sidebar-foot">${branding.org_name}</div>
      </aside>
      <div class="main-col">
        <header class="topbar">
          <button class="hamburger" aria-label="Toggle menu">&#9776;</button>
          <div class="org-lockup">
            <img class="org-logo" src="${branding.logo_url}" alt="${branding.org_name}" />
          </div>
          <div class="topbar-title" id="page-title"></div>
          <div class="topbar-right">
            <input class="search-input topbar-search" id="topbar-search" placeholder="Search people, records, partners…" />
            <div class="viewing-as">
              <span class="viewing-as-label">Viewing as</span>
              <span class="viewing-as-role">${data.user.role}</span>
            </div>
            <div class="live-indicator"><span class="live-dot"></span>Live <span class="live-clock" id="live-clock">${formatClock()}</span></div>
            <button class="btn btn-ghost btn-icon" id="refresh-btn" title="Refresh">&#8635;</button>
            <div class="user-chip">
              ${avatarHtml(data.user)}
              <div class="user-meta"><div class="name">${data.user.name}</div><div class="role">${data.user.employeeNo}</div></div>
            </div>
            <button class="btn btn-ghost btn-sm" id="logout-btn">Log out</button>
          </div>
        </header>
        <main id="page-main"></main>
      </div>
    `;

    const bodyContent = document.body.innerHTML;
    document.body.innerHTML = '';
    document.body.appendChild(root);
    document.getElementById('page-main').innerHTML = bodyContent;

    const isAdmin = data.user.role === 'HR administrator' || data.user.role === 'System administrator';
    if (!branding.is_configured && isAdmin && activeKey !== 'settings') {
      const banner = document.createElement('div');
      banner.className = 'setup-banner';
      banner.innerHTML = `<span><strong>Set up your organisation</strong> — this HRIS is still showing placeholder branding. Add your organisation's name and logo to finish setup.</span><a href="/settings.html" class="btn btn-ghost btn-sm">Go to Settings &rarr;</a>`;
      root.querySelector('.main-col').insertBefore(banner, document.getElementById('page-main'));
    }

    const navItem = NAV_ITEMS.find((n) => n.key === activeKey);
    document.getElementById('page-title').textContent = navItem ? navItem.label : 'NRU HRIS';

    const sidebar = root.querySelector('.sidebar');
    const scrim = root.querySelector('.sidebar-scrim');
    root.querySelector('.hamburger').addEventListener('click', () => {
      sidebar.classList.toggle('open');
      scrim.classList.toggle('open');
    });
    scrim.addEventListener('click', () => { sidebar.classList.remove('open'); scrim.classList.remove('open'); });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await Api.post('/auth/logout');
      location.href = '/login.html';
    });

    document.getElementById('refresh-btn').addEventListener('click', () => location.reload());

    document.getElementById('topbar-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        location.href = '/directory.html?q=' + encodeURIComponent(e.target.value.trim());
      }
    });

    setInterval(() => {
      const el = document.getElementById('live-clock');
      if (el) el.textContent = formatClock();
    }, 30000);

    if (data.scope.voip && data.scope.voip.read && window.VoipWidget) {
      window.VoipWidget.mount(data.user);
    }

    return data;
  }

  return { init, me };
})();
