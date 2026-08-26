// Location history / playback — the polyline + points screen. Self-view always available;
// choosing another employee requires location.history.view (server enforces this too — the
// employee picker here is just hidden when /history/employees comes back empty).
let map, dashedLine, trackLine, pointMarkers = [], playTimer;
let currentFixes = [];

function ensureMap() {
  if (map) return;
  map = L.map('map').setView([-26.44, 31.28], 9);
  addBaseLayers(map);
}

function clearTrack() {
  clearInterval(playTimer);
  [dashedLine, trackLine].forEach((l) => l && l.remove());
  pointMarkers.forEach((m) => m.remove());
  pointMarkers = []; dashedLine = trackLine = null;
}

async function loadShiftList(employeeNo) {
  const qs = employeeNo ? `?employee_no=${encodeURIComponent(employeeNo)}` : '';
  const { data } = await Api.get(`/history/shifts${qs}`);
  const list = document.getElementById('shift-list');
  if (data.length === 0) { list.innerHTML = '<p class="note">No confirmed shifts recorded yet.</p>'; return; }
  list.innerHTML = data.map((s) => `<button class="listrow" data-id="${s.id}" style="display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-bottom:1px solid var(--color-neutral-200);background:transparent;cursor:pointer;">
    <b>${esc(fmtTime(s.shift_started_at))}</b><br><span class="note" style="border:0;padding:0;">${esc(s.zone_name || '—')} · ${s.fix_count} fixes${s.full_legal_name ? ' · ' + esc(s.full_legal_name) : ''}</span>
  </button>`).join('');
  [...list.querySelectorAll('.listrow')].forEach((btn) => btn.addEventListener('click', () => loadTrack(btn.dataset.id)));
  const preselect = new URLSearchParams(location.search).get('shift');
  if (preselect) loadTrack(preselect);
}

async function loadTrack(shiftId) {
  const { data } = await Api.get(`/history/shifts/${shiftId}/track`);
  clearTrack();
  currentFixes = data.fixes;
  const pts = currentFixes.map((f) => [f.lat, f.lng]);
  document.getElementById('meta').innerHTML = `<b>${esc(data.checkIn.employee_no)}</b> — ${fmtTime(data.checkIn.shift_started_at)} to ${data.checkIn.shift_ended_at ? fmtTime(data.checkIn.shift_ended_at) : 'now'} · ${pts.length} points`;
  if (pts.length === 0) { document.getElementById('scrub-wrap').style.display = 'none'; return; }

  dashedLine = L.polyline(pts, { color: '#7e8892', weight: 1.5, dashArray: '3 6' }).addTo(map);
  trackLine = L.polyline([], { color: '#1c8a63', weight: 3 }).addTo(map);
  pointMarkers = currentFixes.map((f, i) => L.circleMarker([f.lat, f.lng], { radius: 4, color: '#0d0f12', weight: 1, fillColor: '#12557f', fillOpacity: 1 })
    .addTo(map).bindTooltip(`${fmtTime(f.captured_at)} · ±${f.accuracy_m ?? '?'}m`));
  map.fitBounds(dashedLine.getBounds().pad(0.2));

  const scrub = document.getElementById('scrub');
  scrub.max = pts.length - 1; scrub.value = pts.length - 1;
  document.getElementById('scrub-wrap').style.display = 'flex';
  scrubTo(pts.length - 1);
  scrub.oninput = () => scrubTo(Number(scrub.value));
}

function scrubTo(idx) {
  trackLine.setLatLngs(currentFixes.slice(0, idx + 1).map((f) => [f.lat, f.lng]));
  pointMarkers.forEach((m, i) => m.setStyle({ radius: i === idx ? 7 : 4, fillColor: i === idx ? '#1c8a63' : '#12557f' }));
  document.getElementById('scrub-time').textContent = currentFixes[idx] ? fmtTime(currentFixes[idx].captured_at) : '';
}

function togglePlay() {
  const scrub = document.getElementById('scrub');
  const btn = document.getElementById('play-btn');
  if (playTimer) { clearInterval(playTimer); playTimer = null; btn.textContent = '▶ Play'; return; }
  btn.textContent = '⏸ Pause';
  playTimer = setInterval(() => {
    let v = Number(scrub.value) + 1;
    if (v >= currentFixes.length) { clearInterval(playTimer); playTimer = null; btn.textContent = '▶ Play'; return; }
    scrub.value = v; scrubTo(v);
  }, 500);
}

(async () => {
  const me = await Shell.init('history');
  const { data: employees } = await Api.get('/history/employees');
  const preselectEmp = new URLSearchParams(location.search).get('employee_no');

  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Location history</h1>
      <p class="page-sub">Polyline + point playback of a confirmed shift's recorded fixes.</p></div></div>
    <div class="grid" style="grid-template-columns: 300px 1fr;">
      <div class="card">
        ${employees.length ? `<div class="form-row"><label>Employee</label><select id="emp-pick"><option value="">Myself</option>${employees.map((e) => `<option value="${esc(e.employee_no)}" ${e.employee_no === preselectEmp ? 'selected' : ''}>${esc(e.full_legal_name)}</option>`).join('')}</select></div>` : ''}
        <div id="shift-list"></div>
      </div>
      <div class="card">
        <div id="meta" class="note" style="margin-bottom:10px;">Select a shift</div>
        <div class="mapbox tall" id="map"></div>
        <div id="scrub-wrap" style="display:none;align-items:center;gap:10px;margin-top:12px;">
          <button class="btn btn-ghost" id="play-btn">▶ Play</button>
          <input type="range" id="scrub" min="0" max="0" value="0" style="flex:1;">
          <span class="note" id="scrub-time" style="border:0;padding:0;"></span>
        </div>
      </div>
    </div>`;

  ensureMap();
  document.getElementById('play-btn').addEventListener('click', togglePlay);
  const picker = document.getElementById('emp-pick');
  if (picker) picker.addEventListener('change', () => loadShiftList(picker.value || null));
  await loadShiftList(preselectEmp || (picker ? picker.value : null));
})();
