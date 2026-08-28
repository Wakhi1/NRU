// Self-service clock-in — every employee gets this screen regardless of console role (the user's
// explicit ask: "employees can have the clock-in feature, like most apps"). The gate itself is
// still a server decision (architecture doc §5) — this page only collects a GPS fix and shows what
// the server decided; it never grants itself a shift.
let map, zoneCircles = [], meMarker, trackLine, trackPoints = [];
let watchId = null, lastPostAt = 0, pollTimer = null;
const FIX_INTERVAL_MS = 25000;
let capturedPhoto = null, capturedPhotoUrl = null;
let trackingActive = false; // explicit start/stop control — tracking no longer begins on its own

// Camera capture for the check-in proof photo (architecture doc §7 — "captured in-app only, the
// gallery picker is disabled"). `capture="environment"` on a file input opens the device camera
// directly on Android/iOS Chrome/Safari rather than a file browser, so there is no picker to swap
// in an old photo from — the same guarantee the doc asks for, without a custom camera UI.
function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.addEventListener('change', () => resolve(input.files[0] || null), { once: true });
    input.click();
  });
}

async function capturePhoto(onDone) {
  const file = await pickPhoto();
  if (!file) return;
  capturedPhoto = file;
  if (capturedPhotoUrl) URL.revokeObjectURL(capturedPhotoUrl);
  capturedPhotoUrl = URL.createObjectURL(file);
  onDone();
}

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

function photoCaptureHtml() {
  return `
    <div class="form-row">
      <label>Check-in photo — required</label>
      ${capturedPhotoUrl
        ? `<img src="${capturedPhotoUrl}" alt="Check-in proof" style="width:100%;max-width:220px;border:1px solid var(--color-neutral-300);">
           <button class="btn btn-ghost btn-sm" id="retake-btn" style="margin-top:6px;width:fit-content;">Retake photo</button>`
        : `<button class="btn btn-ghost" id="capture-btn">📷 Take photo</button>`}
      <p class="field-hint">Taken with your camera at check-in — proof you're on site (architecture doc §7).</p>
    </div>`;
}

function wirePhotoCapture(onChange) {
  const captureBtn = document.getElementById('capture-btn');
  const retakeBtn = document.getElementById('retake-btn');
  if (captureBtn) captureBtn.addEventListener('click', () => capturePhoto(onChange));
  if (retakeBtn) retakeBtn.addEventListener('click', () => capturePhoto(onChange));
}

function renderPanel(state) {
  const panel = document.getElementById('panel');
  const { open, zones, needsReconfirm } = state;

  if (open && open.status === 'open' && needsReconfirm) {
    panel.innerHTML = `
      <div class="gate-status gate-outside"><b>Reconfirm your location</b></div>
      <p>You're on shift in <b>${esc(open.zone_name || 'your zone')}</b>, but your position needs to be
      re-verified — either the recheck interval has passed, or you've signed in again since it was last
      confirmed. Collecting is paused until you confirm where you are.</p>
      <button class="btn btn-primary btn-lg" id="reconfirm-btn">Confirm my location</button>
      <div id="gate-result" style="margin-top:14px;"></div>
      <div class="divider"></div>
      <button class="btn btn-ghost btn-sm" id="clockout-btn">Clock out instead</button>`;
    document.getElementById('reconfirm-btn').addEventListener('click', () => attemptReconfirm(open.id));
    document.getElementById('clockout-btn').addEventListener('click', () => clockOut(open.id));
    return;
  }

  if (open && open.status === 'open') {
    const started = fmtTime(open.shift_started_at);
    panel.innerHTML = `
      <div class="gate-status gate-confirmed"><b>On shift</b> ${trackingActive ? '<span class="badge badge-success live" style="margin-left:8px;">● Live</span>' : ''}</div>
      <p><b>Zone:</b> ${esc(open.zone_name || '—')}<br><b>Started:</b> ${started}<br><b>Distance at check-in:</b> ${open.distance_m ?? '—'} m</p>
      ${open.photo_path ? `<img src="${esc(open.photo_path)}" alt="Check-in proof" style="width:100%;max-width:160px;border:1px solid var(--color-neutral-300);margin-bottom:10px;">` : ''}
      ${trackingActive
        ? `<button class="btn btn-ghost btn-lg" id="track-toggle-btn">■ Stop live tracking</button>
           <p class="note" style="margin-top:12px;">Your position is being recorded every ${FIX_INTERVAL_MS / 1000}s — see it appear on the map as a track.</p>`
        : `<button class="btn btn-primary btn-lg" id="track-toggle-btn">▶ Start live tracking</button>
           <p class="field-hint" style="margin-top:8px;">Nothing is recorded until you start it — this is separate from the check-in that opened your shift.</p>`}
      <div class="divider"></div>
      <button class="btn btn-danger btn-sm" id="clockout-btn">Clock out</button>`;
    document.getElementById('track-toggle-btn').addEventListener('click', () => {
      if (trackingActive) { stopTracking(); trackingActive = false; } else { startTracking(open.id); trackingActive = true; }
      renderPanel(state);
    });
    document.getElementById('clockout-btn').addEventListener('click', () => clockOut(open.id));
    return;
  }

  const zoneChips = zones.length
    ? zones.map((z) => `<span class="badge badge-info">${esc(z.name)}</span>`).join(' ')
    : '<span class="badge badge-neutral">No zone assigned yet</span>';
  panel.innerHTML = `
    <p>You are not on shift. Location confirmation is required before you can start collecting.</p>
    <p><b>Your assigned zone${zones.length === 1 ? '' : 's'}:</b><br>${zoneChips}</p>
    ${photoCaptureHtml()}
    <button class="btn btn-primary btn-lg" id="clockin-btn" ${capturedPhoto ? '' : 'disabled'}>Clock in</button>
    <div id="gate-result" style="margin-top:14px;"></div>`;
  wirePhotoCapture(() => renderPanel(state));
  document.getElementById('clockin-btn').addEventListener('click', attemptClockIn);
}

async function loadState() {
  const { data } = await Api.get('/checkin/me');
  drawZones(data.zones);
  renderPanel(data);
  renderRecent();
  if (data.open && data.open.status === 'open') {
    if (data.open.lat) placeMe(data.open.lat, data.open.lng);
    // Tracking is opt-in via the "Start live tracking" button (renderPanel) — not resumed
    // automatically on load/refresh, so it stays off after a page reload until clicked again.
  } else {
    stopTracking();
    trackingActive = false;
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
  if (!capturedPhoto) { resultBox.innerHTML = `<div class="gate-status gate-blocked"><b>Take a check-in photo first</b></div>`; return; }
  try {
    const fix = await Api.withLoading(btn, 'Getting GPS fix…', getFix);
    placeMe(fix.lat, fix.lng);
    const form = new FormData();
    form.append('lat', fix.lat);
    form.append('lng', fix.lng);
    if (fix.accuracy_m != null) form.append('accuracy_m', fix.accuracy_m);
    form.append('photo', capturedPhoto);
    const { data } = await Api.postForm('/checkin', form);
    const copy = decisionCopy(data.decision);
    resultBox.innerHTML = `<div class="gate-status ${copy.cls}"><div><b>${esc(copy.title)}</b><br>
      ${data.zone ? `${esc(data.zone)} — ${data.distance_m}m` : ''} ${esc(data.reason || copy.body)}</div></div>`;
    if (data.decision === 'confirmed') {
      capturedPhoto = null; capturedPhotoUrl = null;
      setTimeout(loadState, 600);
    } else if (data.decision === 'outside') {
      pollForOverride(data.check_in_id);
    }
  } catch (e) {
    resultBox.innerHTML = `<div class="gate-status gate-blocked"><b>${esc(e.message)}</b></div>`;
  }
}

async function attemptReconfirm(checkInId) {
  const btn = document.getElementById('reconfirm-btn');
  const resultBox = document.getElementById('gate-result');
  try {
    const fix = await Api.withLoading(btn, 'Getting GPS fix…', getFix);
    placeMe(fix.lat, fix.lng);
    const { data } = await Api.post(`/checkin/${checkInId}/reconfirm`, fix);
    const copy = decisionCopy(data.decision);
    resultBox.innerHTML = `<div class="gate-status ${copy.cls}"><div><b>${esc(copy.title)}</b><br>
      ${data.zone ? `${esc(data.zone)} — ${data.distance_m}m` : ''} ${esc(data.reason || copy.body)}</div></div>`;
    if (data.decision === 'confirmed') {
      Api.toast('Location reconfirmed — you can collect again');
      setTimeout(loadState, 600);
    } else if (data.decision === 'outside') {
      pollForOverride(checkInId);
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
  trackingActive = false;
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
