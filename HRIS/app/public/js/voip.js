// Floating call widget mounted by shell.js when the user has voip:read.
// Simulated CDR only — see src/routes/voip.routes.js for why.
window.VoipWidget = (() => {
  let mounted = false;
  let open = false;

  function fmtDuration(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  async function loadCalls(bodyEl) {
    bodyEl.innerHTML = '<div class="faint">Loading…</div>';
    try {
      const [calls, extensions] = await Promise.all([Api.get('/voip/calls'), Api.get('/voip/extensions')]);
      const rows = calls.data.map((c) => `
        <div class="row between" style="padding:6px 0;border-bottom:1px solid var(--color-border)">
          <div>
            <div style="font-size:12.5px;font-weight:600">${c.callee_name || c.callee_number || 'Unknown'}</div>
            <div class="faint">${new Date(c.started_at).toLocaleString()} · ${fmtDuration(c.duration_seconds)}</div>
          </div>
          <span class="badge ${c.outcome === 'completed' ? 'badge-success' : 'badge-neutral'}">${c.outcome}</span>
        </div>`).join('') || '<div class="faint">No calls yet.</div>';

      const options = extensions.data.map((e) => `<option value="${e.employee_no}">${e.full_legal_name} · ext ${e.extension}</option>`).join('');

      bodyEl.innerHTML = `
        <div class="form-row">
          <label>Call a colleague</label>
          <select id="voip-target"><option value="">Select…</option>${options}</select>
        </div>
        <button class="btn btn-primary btn-sm" id="voip-dial" style="width:100%;justify-content:center">Call</button>
        <div class="divider"></div>
        <div class="faint" style="margin-bottom:6px">Recent calls</div>
        ${rows}
      `;
      bodyEl.querySelector('#voip-dial').addEventListener('click', async () => {
        const target = bodyEl.querySelector('#voip-target').value;
        if (!target) return;
        await Api.post('/voip/calls', { callee_employee_no: target });
        Api.toast('Call logged', 'success');
        loadCalls(bodyEl);
      });
    } catch (err) {
      bodyEl.innerHTML = '<div class="faint">Unable to load calls.</div>';
    }
  }

  function mount() {
    if (mounted) return;
    mounted = true;

    const fab = document.createElement('button');
    fab.className = 'call-fab';
    fab.title = 'Call';
    fab.innerHTML = '&#9742;';
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.className = 'call-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="call-panel-head"><strong>Call</strong><button class="modal-close" style="color:#fff" id="voip-close">&times;</button></div>
      <div class="call-panel-body" id="voip-body"></div>
    `;
    document.body.appendChild(panel);

    fab.addEventListener('click', () => {
      open = !open;
      panel.style.display = open ? 'block' : 'none';
      if (open) loadCalls(panel.querySelector('#voip-body'));
    });
    panel.querySelector('#voip-close').addEventListener('click', () => { open = false; panel.style.display = 'none'; });
  }

  return { mount };
})();
