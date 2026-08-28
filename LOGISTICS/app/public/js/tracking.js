// Live tracking — polls the simulated telemetry feed (platform/telemetry.js) every 5s and moves
// existing Leaflet markers rather than recreating the layer each tick, so positions animate instead
// of flickering. Same ensureMap()/addBaseLayers() pattern SPTS's own map.js uses.
let map, markersById = new Map(), refreshTimer;

function ensureMap() {
  if (map) return;
  map = L.map('map').setView([-26.4, 31.2], 9);
  addBaseLayers(map);
}

function popupHtml(v) {
  return `<b>${esc(v.reg_no)}</b> · ${esc(v.model)}<br>
    Driver: ${esc(v.driver_name || 'Unassigned')}<br>
    Speed: ${v.speed_kmh} km/h<br>
    Department: ${esc(v.department || '—')}`;
}

async function refresh() {
  const { data } = await Api.get('/tracking/live');
  const seen = new Set();

  data.forEach((v) => {
    if (v.current_lat == null || v.current_lng == null) return;
    seen.add(v.id);
    const latlng = [v.current_lat, v.current_lng];
    let marker = markersById.get(v.id);
    if (marker) {
      marker.setLatLng(latlng);
      marker.setPopupContent(popupHtml(v));
    } else {
      marker = L.circleMarker(latlng, { radius: 8, color: '#12557f', weight: 2, fillColor: '#1c8a63', fillOpacity: 1 }).addTo(map);
      marker.bindPopup(popupHtml(v));
      markersById.set(v.id, marker);
    }
  });

  // Remove markers for vehicles no longer on trip (trip closed since the last poll).
  [...markersById.keys()].forEach((id) => {
    if (!seen.has(id)) { markersById.get(id).remove(); markersById.delete(id); }
  });

  const list = document.getElementById('vehicle-list');
  if (data.length === 0) {
    list.innerHTML = '<div class="empty-state">No vehicles are currently on a trip.</div>';
  } else {
    list.innerHTML = `<div class="stack">${data.map((v) => `
      <div class="row between">
        <span><b>${esc(v.reg_no)}</b> <span class="faint">${esc(v.driver_name || 'Unassigned')}</span></span>
        <span class="badge badge-info">${v.speed_kmh} km/h</span>
      </div>`).join('')}</div>`;
  }

  document.getElementById('count').textContent = `${data.length} vehicle(s) on trip`;
}

(async () => {
  await Shell.init('tracking');
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Live tracking</h1>
      <p class="page-sub">Simulated telemetry for work vehicles currently on trip — executive vehicles are not shown here. Refreshes every 5 seconds. <span id="count"></span></p></div></div>
    <div class="card"><div class="mapbox tall" id="map"></div></div>
    <div class="card" id="vehicle-list" style="margin-top:14px"></div>`;

  ensureMap();
  await refresh();
  refreshTimer = setInterval(refresh, 5000);
})();
