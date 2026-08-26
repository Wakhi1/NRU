// No icons in the sidebar, deliberately — plain text labels only.
const NAV = [
  ['Monitoring', [
    ['map', 'Live map'],
    ['devices', 'Handsets'],
    ['zones', 'Geofences & alerts'],
    ['history', 'Location history'],
  ]],
  ['Workforce', [
    ['staff', 'All employee devices'],
    ['myshift', 'My shift check-in'],
  ]],
  ['Administration', [
    ['admin', 'Users & permissions'],
    ['exec', 'Executive overview'],
    ['reports', 'Reports & export'],
  ]],
  ['Account', [
    ['account', 'Account & security'],
  ]],
];

// Base layers + a scale bar for every Leaflet map in the app — matches the prototype's own
// BASES/BASELIST (street/satellite/terrain), rendered as Leaflet's native layer-switcher control
// so every map gets the same "all map options" affordance without each page reimplementing it.
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

// Shared avatar renderer — a cached HRIS profile photo when reconcile.js has one, otherwise the
// same initials-monogram fallback the architecture doc calls for (§2.3). Used by the topbar's own
// user-chip and every people-listing page (staff/admin/map).
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
          <div class="sidebar-brand">${orgMarkHtml(branding, 20)}<span class="brand-text">SPTS</span></div>
          <nav class="sidebar-nav" id="sidebar-nav"></nav>
          <div class="sidebar-foot">Smart Phone Tracking &amp;<br>Data Collection Monitoring</div>
        </aside>
        <div class="main-col">
          <header class="topbar">
            <button class="hamburger" id="hamburger" aria-label="Menu">☰</button>
            <div class="org-lockup">${orgMarkHtml(branding, 34)}</div>
            <div class="topbar-title">Smart Phone Tracking<span>${esc(branding.org_name || 'NRU')} · Information Technology Department</span></div>
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
      document.getElementById('app').innerHTML = `<div class="empty-state">Your role does not include this screen.<br><a href="/${me.screens[0] || 'myshift'}.html">Go back</a></div>`;
      throw new Error('forbidden-screen');
    }
    render(activeScreen, branding);
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
