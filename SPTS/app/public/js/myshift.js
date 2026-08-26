// Self-service clock-in — every employee gets this screen regardless of console role (the user's
// explicit ask: "employees can have the clock-in feature, like most apps"). The gate itself is
// still a server decision (architecture doc §5) — this page only collects a GPS fix and shows what
// the server decided; it never grants itself a shift.
let map, zoneCircles = [], meMarker, trackLine, trackPoints = [];
let watchId = null, lastPostAt = 0, pollTimer = null;
const FIX_INTERVAL_MS = 25000;

function decisionCopy(d) {
  return {
    confirmed: { cls: 'gate-confirmed', title: 'Confirmed in zone', body: 'Your shift is open.' },
    outside: { cls: 'gate-outside', title: 'Outside assigned zone', body: 'A request has been sent to your supervisor for an override.' },
    stale: { cls: 'gate-stale', title: 'Fix not accurate enough', body: 'Move to open sky and try again.' },
    blocked: { cls: 'gate-blocked', title: 'Check-in blocked', body: '' },
  }[d] || { cls: 'gate-blocked', title: d, body: '' };
}

function getFix() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser has no location support'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: Math.round(pos.coords.accuracy) }),
      (err) => reject(new Error('Could not get a GPS fix: ' + err.message)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function ensureMap() {
  if (map) return;
  map = L.map('map', { zoomControl: true }).setView([-26.44, 31.28], 9);
  addBaseLayers(map);
}

function drawZones(zones) {
  zoneCircles.forEach((c) => c.remove());
  zoneCircles = zones.map((z) => L.circle([z.center_lat, z.center_lng], {
    radius: z.radius_m, color: '#12557f', weight: 2, fillOpacity: 0.08,
  }).addTo(map).bindTooltip(z.name));
  if (zones.length) {
    const group = L.featureGroup(zoneCircles);
    map.fitBounds(group.getBounds().pad(0.3));
  }
}

function placeMe(lat, lng) {
  if (meMarker) meMarker.setLatLng([lat, lng]);
  else meMarker = L.circleMarker([lat, lng], { radius: 7, color: '#0d0f12', fillColor: '#1c8a63', fillOpacity: 1, weight: 2 }).addTo(map).bindTooltip('You');
}

function pushTrackPoint(lat, lng) {
  trackPoints.push([lat, lng]);
  if (trackLine) trackLine.setLatLngs(trackPoints);
  else trackLine = L.polyline(trackPoints, { color: '#1c8a63', weight: 3, opacity: 0.85 }).addTo(map);
}

function renderPanel(state) {
  const panel = document.getElementById('panel');
  const { open, zones } = state;

  if (open && open.status === 'open') {
    const started = fmtTime(open.shift_started_at);
    panel.innerHTML = `
      <div class="gate-status gate-confirmed"><b>On shift</b></div>
      <p><b>Zone:</b> ${esc(open.zone_name || '—')}<br><b>Started:</b> ${started}<br><b>Distance at check-in:</b> ${open.distance_m ?? '—'} m</p>
      <button class="btn btn-danger btn-lg" id="clockout-btn">Clock out</button>
      <p class="note" style="margin-top:12px;">Your position is being recorded every ${FIX_INTERVAL_MS / 1000}s while this shift is open — see it appear on the map as a track.</p>`;
    document.getElementById('clockout-btn').addEventListener('click', () => clockOut(open.id));
    return;
  }

  const zoneChips = zones.length
    ? zones.map((z) => `<span class="badge badge-info">${esc(z.name)}</span>`).join(' ')
    : '<span class="badge badge-neutral">No zone assigned yet</span>';
  panel.innerHTML = `
    <p>You are not on shift.</p>
    <p><b>Your assigned zone${zones.length === 1 ? '' : 's'}:</b><br>${zoneChips}</p>
    <button class="btn btn-primary btn-lg" id="clockin-btn">Clock in</button>
    <div id="gate-result" style="margin-top:14px;"></div>`;
  document.getElementById('clockin-btn').addEventListener('click', attemptClockIn);
}

async function loadState() {
  const { data } = await Api.get('/checkin/me');
  drawZones(data.zones);
  renderPanel(data);
  renderRecent();
  if (data.open && data.open.status === 'open') {
    if (data.open.lat) placeMe(data.open.lat, data.open.lng);
    startTracking(data.open.id);
  } else {
    stopTracking();
    try {
      const fix = await getFix();
      placeMe(fix.lat, fix.lng);
      if (data.zones.length === 0) map.setView([fix.lat, fix.lng], 12);
    } catch { /* fine — user just hasn't granted location yet */ }
  }
  return data;
}

async function attemptClockIn() {
  const btn = document.getElementById('clockin-btn');
  const resultBox = document.getElementById('gate-result');
  try {
    const fix = await Api.withLoading(btn, 'Getting GPS fix…', getFix);
    placeMe(fix.lat, fix.lng);
    const { data } = await Api.post('/checkin', fix);
    const copy = decisionCopy(data.decision);
    resultBox.innerHTML = `<div class="gate-status ${copy.cls}"><div><b>${esc(copy.title)}</b><br>
      ${data.zone ? `${esc(data.zone)} — ${data.distance_m}m` : ''} ${esc(data.reason || copy.body)}</div></div>`;
    if (data.decision === 'confirmed') {
      setTimeout(loadState, 600);
    } else if (data.decision === 'outside') {
      pollForOverride(data.check_in_id);
    }
  } catch (e) {
    resultBox.innerHTML = `<div class="gate-status gate-blocked"><b>${esc(e.message)}</b></div>`;
  }
}

function pollForOverride(checkInId) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const { data } = await Api.get('/checkin/me');
    if (data.open && data.open.id === checkInId && data.open.decision === 'confirmed') {
      clearInterval(pollTimer);
      Api.toast('Override granted — your shift is now open');
      loadState();
    }
  }, 8000);
}

async function clockOut(id) {
  await Api.post(`/checkin/${id}/close`);
  stopTracking();
  Api.toast('Clocked out');
  loadState();
}

function startTracking(checkInId) {
  if (watchId != null) return;
  trackPoints = []; if (trackLine) { trackLine.remove(); trackLine = null; }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude, accuracy_m = Math.round(pos.coords.accuracy);
      placeMe(lat, lng);
      pushTrackPoint(lat, lng);
      const now = Date.now();
      if (now - lastPostAt > FIX_INTERVAL_MS) {
        lastPostAt = now;
        Api.post(`/checkin/${checkInId}/fix`, { lat, lng, accuracy_m }).catch(() => {});
      }
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
}

function stopTracking() {
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  clearInterval(pollTimer);
}

async function renderRecent() {
  const { data } = await Api.get('/history/shifts');
  const box = document.getElementById('recent');
  if (!box) return;
  if (data.length === 0) { box.innerHTML = '<p class="note">No completed shifts yet.</p>'; return; }
  box.innerHTML = `<h3 style="margin-top:0;">Recent shifts</h3><div class="tbl-wrap"><table>
    <thead><tr><th>Started</th><th>Zone</th><th>Fixes recorded</th><th>Status</th><th></th></tr></thead>
    <tbody>${data.map((s) => `<tr>
      <td>${fmtTime(s.shift_started_at)}</td><td>${esc(s.zone_name || '—')}</td><td>${s.fix_count}</td>
      <td>${s.status === 'open' ? '<span class="badge badge-info">Open</span>' : '<span class="badge badge-neutral">Closed</span>'}</td>
      <td><a href="/history.html?shift=${s.id}">View track →</a></td>
    </tr>`).join('')}</tbody></table></div>`;
}

(async () => {
  await Shell.init('myshift');
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>My shift check-in</h1>
      <p class="page-sub">Your location is confirmed against your assigned geofence before a shift opens — this is the login, not a warning.</p></div></div>
    <div class="grid grid-2">
      <div class="card"><div class="mapbox" id="map"></div></div>
      <div class="card" id="panel"><p>Loading…</p></div>
    </div>
    <div class="card" style="margin-top:16px;" id="recent"></div>`;
  ensureMap();
  await loadState();
})();
