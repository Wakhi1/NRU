// No icons in the sidebar, deliberately — plain text labels only. Same shell pattern as SPTS's own
// shell.js (both apps read /auth/me and render the same sidebar/topbar shape from it).
const NAV = [
  ['Overview', [
    ['dashboard', 'Command overview'],
  ]],
  ['Fleet', [
    ['fleet', 'Fleet register'],
    ['trips', 'Trip authorisation'],
    ['tracking', 'Live tracking'],
  ]],
  ['Fuel & workshop', [
    ['fuel', 'Fuel log'],
    ['maintenance', 'Maintenance'],
  ]],
  ['Workforce', [
    ['drivers', 'Drivers'],
    ['mytrips', 'My trips'],
  ]],
  ['Communication', [
    ['voip', 'Calls'],
  ]],
  ['Administration', [
    ['admin', 'Users & permissions'],
    ['reports', 'Reports & export'],
  ]],
  ['Account', [
    ['account', 'Account & security'],
  ]],
];

// Base layers + a scale bar for every Leaflet map in the app — same pattern SPTS's own shell.js uses.
const MAP_BASES = {
  Street: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors', maxZoom: 19 },
  Satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery © Esri, Maxar, Earthstar Geographics', maxZoom: 19 },
  Terrain: { url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '© OpenTopoMap (CC-BY-SA) · © OpenStreetMap contributors', maxZoom: 17 },
};
function addBaseLayers(map, defaultLayer) {
  defaultLayer = defaultLayer || 'Street';
  const layers = {};
  Object.entries(MAP_BASES).forEach(([name, cfg]) => { layers[name] = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom }); });
  layers[defaultLayer].addTo(map);
  L.control.layers(layers, null, { position: 'topright', collapsed: true }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
  return layers;
}

function initials(name) {
  return String(name || '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function avatarHtml(photoPath, name, size) {
  size = size || 34;
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;`;
  if (photoPath) return `<div class="avatar avatar-photo" style="${style}background-image:url('${esc(photoPath)}')"></div>`;
  return `<div class="avatar" style="${style}">${esc(initials(name))}</div>`;
}

let brandingCache = null;
async function getBranding() {
  if (brandingCache) return brandingCache;
  try {
    const { data } = await Api.get('/branding');
    brandingCache = data;
  } catch {
    brandingCache = { logo_url: null, org_name: 'NRU', is_default_logo: true };
  }
  if (brandingCache.favicon_url) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = brandingCache.favicon_url;
  }
  return brandingCache;
}

function orgMarkHtml(branding, size) {
  size = size || 34;
  if (branding.logo_url) return `<img src="${esc(branding.logo_url)}" alt="${esc(branding.org_name)}" style="width:${size}px;height:${size}px;object-fit:contain;">`;
  return `<span class="mark" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.3)}px;">${esc((branding.org_name || 'NRU').slice(0, 3).toUpperCase())}</span>`;
}

const Shell = (() => {
  let me = null;

  function render(activeScreen, branding) {
    const root = document.getElementById('app');
    root.innerHTML = `
      <div id="shell-root">
        <div class="sidebar-scrim" id="sidebar-scrim"></div>
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-brand">${orgMarkHtml(branding, 20)}<span class="brand-text">FLMS</span></div>
          <nav class="sidebar-nav" id="sidebar-nav"></nav>
          <div class="sidebar-foot">Fleet &amp; Logistics<br>Management System</div>
        </aside>
        <div class="main-col">
          <header class="topbar">
            <button class="hamburger" id="hamburger" aria-label="Menu">☰</button>
            <div class="org-lockup">${orgMarkHtml(branding, 34)}</div>
            <div class="topbar-title">Fleet &amp; Logistics<span>${esc(branding.org_name || 'NRU')} · Transport &amp; Operations</span></div>
            <div class="topbar-right">
              <div class="viewing-as"><span class="viewing-as-label">Role</span><span class="viewing-as-role">${esc(me.roleLabels.join(' · '))}</span></div>
              <div class="user-chip">
                ${avatarHtml(me.photoPath, me.name, 34)}
                <div class="user-meta"><div class="name">${esc(me.name)}</div><div class="role">${esc(me.employeeNo)}</div></div>
              </div>
              <button class="btn btn-ghost btn-icon" id="logout-btn" title="Sign out">⏻</button>
            </div>
          </header>
          <div class="page" id="main"></div>
        </div>
      </div>`;

    const nav = document.getElementById('sidebar-nav');
    nav.innerHTML = NAV.map(([group, items]) => {
      const visible = items.filter(([key]) => me.screens.includes(key));
      if (visible.length === 0) return '';
      return `<div class="sidebar-group-label">${esc(group)}</div>` + visible.map(([key, label]) =>
        `<a class="sidebar-link ${key === activeScreen ? 'active' : ''}" href="/${key}.html">${esc(label)}</a>`
      ).join('');
    }).join('');

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await Api.post('/auth/logout');
      window.location.href = '/login.html';
    });
    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebar-scrim');
    hamburger.addEventListener('click', () => { sidebar.classList.toggle('open'); scrim.classList.toggle('open'); });
    scrim.addEventListener('click', () => { sidebar.classList.remove('open'); scrim.classList.remove('open'); });
  }

  async function init(activeScreen) {
    const [{ data }, branding] = await Promise.all([Api.get('/auth/me'), getBranding()]);
    me = data;
    if (activeScreen && !me.screens.includes(activeScreen)) {
      document.getElementById('app').innerHTML = `<div class="empty-state">Your role does not include this screen.<br><a href="/${me.screens[0] || 'mytrips'}.html">Go back</a></div>`;
      throw new Error('forbidden-screen');
    }
    render(activeScreen, branding);
    // Floating VoIP quick-dial button — starts once per page load regardless of which screen this
    // is, so a call can ring anywhere in the app. Gated on the permission (not the screen list)
    // since it has no page of its own to fail into. NOTE: voip-call.js declares `const VoipCall`, a
    // top-level lexical binding — unlike `var` or a function declaration, that does NOT become a
    // `window` property, so `window.VoipCall` is always undefined even though the bare name
    // resolves fine (both files share the same global script scope). Check with `typeof`, not a
    // `window.` property lookup.
    if (me.permissions.includes('voice.call') && typeof VoipCall !== 'undefined') VoipCall.start();
    return me;
  }

  return { init, get me() { return me; } };
})();

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T'));
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtMoney(n) {
  return 'E ' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
