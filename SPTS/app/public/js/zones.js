// Geofence & alert management — System administrator only. "New zone" stays an inline form (not a
// drawer) deliberately: it needs live "click the map to set center" interaction, which a modal
// drawer's scrim would block. "Assign" — a record-specific action with no map dependency — uses
// the shared FormDrawer side panel instead.
let map, circles = [], placing = false, placeMarker;

function ensureMap() {
  if (map) return;
  map = L.map('map').setView([-26.44, 31.28], 9);
  addBaseLayers(map);
  map.on('click', (e) => {
    if (!placing) return;
    document.getElementById('f-lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('f-lng').value = e.latlng.lng.toFixed(6);
    if (placeMarker) placeMarker.setLatLng(e.latlng); else placeMarker = L.marker(e.latlng).addTo(map);
  });
}

function drawZones(zones) {
  circles.forEach((c) => c.remove());
  circles = zones.map((z) => L.circle([z.center_lat, z.center_lng], {
    radius: z.radius_m, color: z.active ? '#12557f' : '#7e8892', weight: 2, fillOpacity: 0.08,
  }).addTo(map).bindTooltip(z.name));
  if (circles.length) map.fitBounds(L.featureGroup(circles).getBounds().pad(0.25));
}

function ruleLabel(r) {
  return { exit_alert: 'Exit alert', dwell_alert: 'Dwell alert', entry_log: 'Entry log only', checkin_required: 'Check-in required' }[r] || r;
}

async function loadZones() {
  const { data } = await Api.get('/zones');
  drawZones(data);
  const tbl = document.getElementById('zone-tbl');
  tbl.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Code</th><th>Name</th><th>Kind</th><th>Radius</th><th>Rule</th><th>Assigned</th><th>Open alerts</th><th>Active</th><th></th>
  </tr></thead><tbody>${data.map((z) => `<tr>
    <td>${esc(z.code)}</td><td>${esc(z.name)}</td><td>${esc(z.kind)}</td><td>${z.radius_m}m</td>
    <td>${esc(ruleLabel(z.rule_type))}</td><td>${z.assigned_count}</td>
    <td>${z.open_alerts > 0 ? `<span class="badge badge-danger">${z.open_alerts}</span>` : '0'}</td>
    <td>${z.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-neutral">Off</span>'}</td>
    <td><button class="btn btn-ghost btn-sm" data-assign="${z.id}" data-name="${esc(z.name)}">Assign</button>
        <button class="btn btn-ghost btn-sm" data-del="${z.id}">Delete</button></td>
  </tr>`).join('')}</tbody></table></div>`;

  [...tbl.querySelectorAll('[data-del]')].forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this zone?')) return;
    await Api.del(`/zones/${b.dataset.del}`);
    loadZones();
  }));
  [...tbl.querySelectorAll('[data-assign]')].forEach((b) => b.addEventListener('click', () => openAssign(b.dataset.assign, b.dataset.name)));
}

// The "who's assigned here" list is add/remove-many, not a single form save — so this drawer is
// opened readOnly (no generic Save button) with everything wired directly in extraHtml/afterRender.
async function openAssign(zoneId, zoneName) {
  const [{ data: current }, { data: staff }, { data: devices }] = await Promise.all([
    Api.get(`/zones/${zoneId}/assignments`), Api.get('/staff'), Api.get('/devices'),
  ]);

  const render = (currentRows) => `
    <div class="drawer-group-label">Currently assigned — job/location assignment, not a system role</div>
    <div class="tbl-wrap"><table><thead><tr><th>Employee</th><th>Device</th><th></th></tr></thead><tbody>
      ${currentRows.map((a) => `<tr><td>${esc(a.full_legal_name || '—')}</td><td>${esc(a.asset_tag || '—')}</td>
        <td><button class="btn btn-ghost btn-sm" data-unassign="${a.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="3">None yet</td></tr>'}
    </tbody></table></div>
    <div class="grid grid-2" style="margin-top:12px;">
      <div class="form-row"><label>Add employee</label><select id="add-emp"><option value="">— choose —</option>
        ${staff.map((s) => `<option value="${esc(s.employee_no)}">${esc(s.full_legal_name)}</option>`).join('')}</select></div>
      <div class="form-row"><label>Or add device</label><select id="add-dev"><option value="">— choose —</option>
        ${devices.map((d) => `<option value="${d.id}">${esc(d.asset_tag)} (${esc(d.assigned_name || 'unassigned')})</option>`).join('')}</select></div>
    </div>
    <button class="btn btn-primary btn-sm" id="add-assign-btn">Add assignment</button>`;

  FormDrawer.open({
    title: `Assign — ${zoneName}`,
    sub: 'Who is checked in against this zone',
    sections: [],
    primaryLabel: 'Done',
    onSave: async () => {}, // add/remove already happen immediately via the buttons below — Save just closes
    extraHtml: render(current),
    afterRender: (root) => {
      const wire = () => {
        root.querySelector('#add-assign-btn').addEventListener('click', async () => {
          const employee_no = root.querySelector('#add-emp').value || null;
          const device_id = root.querySelector('#add-dev').value || null;
          if (!employee_no && !device_id) return Api.toast('Choose an employee or a device', true);
          await Api.post(`/zones/${zoneId}/assignments`, { employee_no, device_id });
          openAssign(zoneId, zoneName);
          loadZones();
        });
        [...root.querySelectorAll('[data-unassign]')].forEach((b) => b.addEventListener('click', async () => {
          await Api.del(`/zones/assignments/${b.dataset.unassign}`);
          openAssign(zoneId, zoneName);
          loadZones();
        }));
      };
      wire();
    },
  });
}

// Pending check-in overrides (architecture doc §5.6) — a person refused entry outside their zone,
// waiting on a supervisor decision. Each row opens a drawer with the full detail and a Grant/Deny
// action.
async function loadOverrides() {
  const { data } = await Api.get('/checkin/overrides');
  const box = document.getElementById('override-tbl');
  box.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th>Zone</th><th>Distance</th><th>Requested</th><th></th></tr></thead><tbody>
    ${data.map((o) => `<tr>
      <td>${esc(o.full_legal_name)}</td><td>${esc(o.zone_name || '—')}</td><td>${o.distance_m}m</td><td>${fmtTime(o.created_at)}</td>
      <td><button class="btn btn-ghost btn-sm" data-review="${o.id}">Review</button></td>
    </tr>`).join('') || '<tr><td colspan="5">No pending overrides</td></tr>'}
  </tbody></table></div>`;
  [...box.querySelectorAll('[data-review]')].forEach((b) => b.addEventListener('click', () => reviewOverride(data.find((o) => String(o.id) === b.dataset.review))));
}

function reviewOverride(o) {
  FormDrawer.open({
    title: `Override request — ${o.full_legal_name}`,
    sub: `${o.distance_m}m outside ${o.zone_name || 'assigned zone'}`,
    readOnly: true,
    sections: [
      { label: 'Request', fields: [
        { key: 'reason', label: 'Reason', value: o.reason || '—' },
        { key: 'requested', label: 'Requested', value: fmtTime(o.created_at) },
      ] },
    ],
    extraHtml: `${o.photo_path ? `<img src="${esc(o.photo_path)}" alt="Check-in proof" style="width:100%;max-width:220px;border:1px solid var(--color-neutral-300);margin-bottom:10px;">` : ''}
    <div class="row" style="gap:8px;justify-content:flex-end;margin-top:12px;">
      <button class="btn btn-danger btn-sm" id="ov-deny">Deny</button>
      <button class="btn btn-primary btn-sm" id="ov-grant">Grant override</button>
    </div>`,
    afterRender: (root) => {
      root.querySelector('#ov-grant').addEventListener('click', async () => {
        await Api.post(`/checkin/overrides/${o.id}/decide`, { decision: 'granted' });
        Api.toast('Override granted');
        FormDrawer.close();
        loadOverrides();
      });
      root.querySelector('#ov-deny').addEventListener('click', async () => {
        await Api.post(`/checkin/overrides/${o.id}/decide`, { decision: 'denied' });
        Api.toast('Override denied');
        FormDrawer.close();
        loadOverrides();
      });
    },
  });
}

async function loadAlerts() {
  const { data } = await Api.get('/zones/alerts/list');
  const tbl = document.getElementById('alert-tbl');
  tbl.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Severity</th><th>Employee</th><th>Zone</th><th>Kind</th><th>Note</th><th>When</th><th></th></tr></thead><tbody>
    ${data.map((a) => `<tr>
      <td><span class="badge ${a.severity === 'high' ? 'badge-danger' : a.severity === 'med' ? 'badge-warning' : 'badge-neutral'}">${esc(a.severity)}</span></td>
      <td>${esc(a.full_legal_name || '—')}</td><td>${esc(a.zone_name || '—')}</td><td>${esc(a.kind)}</td><td>${esc(a.note || '')}</td>
      <td>${fmtTime(a.created_at)}</td>
      <td>${a.resolved ? '<span class="badge badge-neutral">Resolved</span>' : `<button class="btn btn-ghost btn-sm" data-resolve="${a.id}">Resolve</button>`}</td>
    </tr>`).join('') || '<tr><td colspan="7">No alerts</td></tr>'}
  </tbody></table></div>`;
  [...tbl.querySelectorAll('[data-resolve]')].forEach((b) => b.addEventListener('click', async () => {
    await Api.post(`/zones/alerts/${b.dataset.resolve}/resolve`);
    loadAlerts();
  }));
}

(async () => {
  await Shell.init('zones');
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Geofences &amp; alerts</h1>
      <p class="page-sub">Circle-geometry zones — center + radius, evaluated with a haversine distance check on every fix.</p></div></div>
    <div class="grid" style="grid-template-columns: 1fr 340px;">
      <div class="card"><div class="mapbox tall" id="map"></div></div>
      <div class="card">
        <h3 style="margin-top:0;">New zone</h3>
        <div class="form-row"><label>Code</label><input id="f-code" placeholder="GF-05"></div>
        <div class="form-row"><label>Name</label><input id="f-name" placeholder="Manzini office"></div>
        <div class="form-row"><label>Kind</label><select id="f-kind"><option value="field">Field</option><option value="office">Office</option><option value="depot">Depot</option></select></div>
        <div class="grid grid-2">
          <div class="form-row"><label>Center lat</label><input id="f-lat" placeholder="-26.4988"></div>
          <div class="form-row"><label>Center lng</label><input id="f-lng" placeholder="31.3800"></div>
        </div>
        <button class="btn btn-ghost btn-sm" id="pick-btn" style="margin-bottom:12px;">📍 Click map to set center</button>
        <div class="form-row"><label>Radius (m)</label><input id="f-radius" value="500"></div>
        <div class="form-row"><label>Rule</label><select id="f-rule">
          <option value="checkin_required">Check-in required</option><option value="exit_alert">Exit alert</option>
          <option value="dwell_alert">Dwell alert</option><option value="entry_log">Entry log only</option></select></div>
        <div class="form-row"><label>Team label</label><input id="f-team" placeholder="Manzini office staff"></div>
        <button class="btn btn-primary btn-lg" id="create-btn">Create zone</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px;" id="zone-tbl"></div>
    <div class="page-head" style="margin-top:24px;"><div><h1>Pending overrides</h1>
      <p class="page-sub">A check-in refused outside its zone, waiting on a decision (architecture doc §5.6).</p></div></div>
    <div class="card" id="override-tbl"></div>
    <div class="page-head" style="margin-top:24px;"><div><h1>Alerts</h1></div></div>
    <div class="card" id="alert-tbl"></div>`;

  ensureMap();
  document.getElementById('pick-btn').addEventListener('click', () => {
    placing = !placing;
    document.getElementById('pick-btn').textContent = placing ? '📍 Click the map now…' : '📍 Click map to set center';
  });
  document.getElementById('create-btn').addEventListener('click', async (e) => {
    const body = {
      code: document.getElementById('f-code').value.trim(),
      name: document.getElementById('f-name').value.trim(),
      kind: document.getElementById('f-kind').value,
      center_lat: document.getElementById('f-lat').value,
      center_lng: document.getElementById('f-lng').value,
      radius_m: document.getElementById('f-radius').value,
      rule_type: document.getElementById('f-rule').value,
      team_label: document.getElementById('f-team').value.trim() || null,
    };
    try {
      await Api.withLoading(e.target, 'Creating…', () => Api.post('/zones', body));
      Api.toast('Zone created');
      loadZones();
    } catch (err) { Api.toast(err.message, true); }
  });

  await loadZones();
  await loadOverrides();
  await loadAlerts();
})();
