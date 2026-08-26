// Live map — Head of IT / Control-room supervisor only (architecture doc §3.3: the most
// restricted screen in the system). Leaflet markers per open shift, geofence circles from zone.
let map, markers = [], fenceLayers = [], refreshTimer;

function ensureMap() {
  if (map) return;
  map = L.map('map').setView([-26.44, 31.28], 9);
  addBaseLayers(map);
}

function decisionColor(d) {
  return { confirmed: '#1c8a63', outside: '#9a3324', stale: '#8a5a00' }[d] || '#7e8892';
}

async function refresh() {
  const [{ data: devices }, { data: fences }] = await Promise.all([Api.get('/map/live'), Api.get('/map/geofences')]);

  fenceLayers.forEach((l) => l.remove());
  fenceLayers = fences.map((z) => L.circle([z.center_lat, z.center_lng], {
    radius: z.radius_m, color: '#5b646d', weight: 1.5, dashArray: '4 4', fillOpacity: 0.04,
  }).addTo(map).bindTooltip(z.name));

  markers.forEach((m) => m.remove());
  markers = devices.filter((d) => d.lat != null).map((d) => {
    const marker = L.circleMarker([d.lat, d.lng], {
      radius: 8, color: '#201e1d', weight: 2, fillColor: decisionColor(d.decision), fillOpacity: 1,
    }).addTo(map);
    marker.bindPopup(`<div class="row" style="margin-bottom:6px;">${avatarHtml(d.photo_path, d.full_legal_name, 30)}<b>${esc(d.full_legal_name)}</b></div>
      ${esc(d.position_title || '')} · ${esc(d.department || '')}<br>
      Zone: ${esc(d.zone_name || '—')}<br>Handset: ${esc(d.asset_tag || '—')} ${d.battery_pct != null ? `(${d.battery_pct}%)` : ''}<br>
      On shift since ${fmtTime(d.shift_started_at)}<br>Last fix: ${fmtTime(d.last_seen) || 'at check-in'}`);
    return marker;
  });

  document.getElementById('count').textContent = `${devices.length} on shift`;
  if (!window.__fitted && (fenceLayers.length || markers.length)) {
    const group = L.featureGroup([...fenceLayers, ...markers]);
    if (group.getLayers().length) map.fitBounds(group.getBounds().pad(0.2));
    window.__fitted = true;
  }
}

(async () => {
  await Shell.init('map');
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Live map</h1>
      <p class="page-sub">Every open shift right now, with the geofence each person is checked against. Refreshes every 15 seconds. <span id="count"></span></p></div></div>
    <div class="card"><div class="mapbox tall" id="map"></div></div>`;
  ensureMap();
  await refresh();
  refreshTimer = setInterval(refresh, 15000);
})();
