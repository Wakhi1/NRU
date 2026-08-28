// Directory + dialer + call history — ported from SPTS's own voip.js. The directory lists EVERY
// active employee, not just people who've already opened FLMS — someone with no extension yet shows
// up too (calling them provisions one on the spot, see voip.routes.js's POST /calls). Placing a call
// and the in-call banner itself are handled globally by voip-call.js so a call rings no matter which
// screen answers it — this page is just the "who do I call" list plus a record of what already
// happened.
const CALL_STATUS_BADGE = { answered: 'badge-neutral', ended: 'badge-success', missed: 'badge-warning', declined: 'badge-danger', ringing: 'badge-info' };
let directoryCache = [];

function fmtDuration(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

async function loadMyExtension() {
  const { data } = await Api.get('/voip/me');
  const box = document.getElementById('my-ext');
  if (box) box.textContent = `Your extension: ${data.extension}`;
}

function renderDirectoryRows(list) {
  const box = document.getElementById('directory');
  if (!box) return;
  if (list.length === 0) { box.innerHTML = '<p class="muted">No match.</p>'; return; }
  box.innerHTML = `<div class="stack">${list.map((p) => `
    <div class="row between" style="padding:9px 0;border-bottom:1px solid var(--color-neutral-200);">
      <div class="row" style="gap:10px;">
        ${avatarHtml(p.photo_path, p.full_legal_name, 32)}
        <div>
          <div style="font-weight:600;font-size:13px;">${esc(p.full_legal_name)}
            <span class="badge ${p.online ? 'badge-success' : 'badge-neutral'}" style="margin-left:6px;">${p.online ? 'Online' : 'Offline'}</span></div>
          <div class="faint">${esc(p.position_title || p.department || '—')} · ${p.extension ? `ext. ${esc(p.extension)}` : 'not yet set up'}</div>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" data-call="${esc(p.employee_no)}" data-name="${esc(p.full_legal_name)}">Call</button>
    </div>`).join('')}</div>`;
  [...box.querySelectorAll('[data-call]')].forEach((b) =>
    b.addEventListener('click', () => VoipCall.placeCall(b.dataset.call, b.dataset.name)));
}

function filterDirectory(term) {
  const q = term.trim().toLowerCase();
  const list = q
    ? directoryCache.filter((p) => [p.full_legal_name, p.position_title, p.department].some((v) => (v || '').toLowerCase().includes(q)))
    : directoryCache;
  renderDirectoryRows(list);
}

async function loadDirectory() {
  const { data } = await Api.get('/voip/directory');
  directoryCache = data;
  if (data.length === 0) {
    const box = document.getElementById('directory');
    if (box) box.innerHTML = '<p class="muted">No other active employees found.</p>';
    return;
  }
  const searchEl = document.getElementById('directory-search');
  filterDirectory(searchEl ? searchEl.value : '');
}

async function loadCallHistory() {
  const { data } = await Api.get('/voip/calls/history');
  const box = document.getElementById('history');
  if (!box) return;
  if (data.length === 0) { box.innerHTML = '<p class="muted">No calls yet.</p>'; return; }
  box.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th></th><th>With</th><th>Status</th><th>Duration</th><th>When</th></tr></thead>
    <tbody>${data.map((c) => `<tr>
      <td>${c.direction === 'outgoing' ? '↗' : '↙'}</td>
      <td>${esc(c.counterpart)}</td>
      <td><span class="badge ${CALL_STATUS_BADGE[c.status] || 'badge-neutral'}">${esc(c.status)}</span></td>
      <td>${c.duration_s != null ? fmtDuration(c.duration_s) : '—'}</td>
      <td>${fmtTime(c.started_at)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

(async () => {
  await Shell.init('voip');
  document.getElementById('main').innerHTML = `
    <div class="page-head">
      <div><h1>Calls</h1>
        <p class="page-sub">On-net voice over the same data connection as everything else in FLMS — no separate airtime bundle. Calling rings on whatever screen the other person has open.</p></div>
      <span class="badge badge-info" id="my-ext">Your extension: …</span>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h3 style="margin-top:0;">Directory</h3>
        <div class="toolbar"><input type="text" id="directory-search" placeholder="Search by name, title or department…"></div>
        <div id="directory"><p class="muted">Loading…</p></div>
      </div>
      <div class="card"><h3 style="margin-top:0;">Recent calls</h3><div id="history"><p class="muted">Loading…</p></div></div>
    </div>`;
  document.getElementById('directory-search').addEventListener('input', (e) => filterDirectory(e.target.value));
  loadMyExtension();
  loadDirectory();
  loadCallHistory();
  setInterval(loadDirectory, 15000);
  setInterval(loadCallHistory, 20000);
})();
