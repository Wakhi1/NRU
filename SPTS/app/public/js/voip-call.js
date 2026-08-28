// Global VoIP calling engine (architecture doc §8 — "voice is carried on the same data bundle as
// the forms, no separate airtime line"). Loaded on every authenticated page (see the <script> tag
// next to shell.js in each .html file) so a call can ring no matter which screen someone is on —
// the same way a phone rings regardless of what app is open. shell.js calls VoipCall.start(me)
// once, right after it knows who's signed in.
//
// Signaling is short-polling against /api/v1/voip (see voip.routes.js), the same pattern myshift.js
// already uses for override requests — no websocket server. Once the SDP offer/answer and ICE
// candidates have crossed, audio flows peer-to-peer over WebRTC directly; the server never touches
// the call itself, only the handshake.
const VoipCall = (() => {
  const HEARTBEAT_MS = 20000;
  const RING_POLL_MS = 2500;
  const SIGNAL_POLL_MS = 1500;
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  const FAB_POLL_MS = 15000;

  let started = false;
  let pc = null, localStream = null, remoteAudio = null;
  let activeCall = null; // { id, role: 'caller'|'callee', otherName }
  let signalTimer = null, statusTimer = null, durationTimer = null;
  let sinceSignalId = 0, pendingIce = [], callStartedAt = null;
  let panelOpen = false;

  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function ensureOverlay() {
    let overlay = document.getElementById('voip-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'voip-overlay';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function renderIncoming(call) {
    ensureOverlay().innerHTML = `
      <div class="voip-banner voip-incoming">
        <div class="voip-banner-info">☎ <b>${esc(call.caller_name)}</b> is calling…</div>
        <div class="voip-banner-actions">
          <button class="btn btn-danger btn-sm" id="voip-decline">Decline</button>
          <button class="btn btn-primary btn-sm" id="voip-answer">Answer</button>
        </div>
      </div>`;
    document.getElementById('voip-answer').addEventListener('click', () => answerCall(call));
    document.getElementById('voip-decline').addEventListener('click', () => declineCall(call));
  }

  function renderInCall(label) {
    ensureOverlay().innerHTML = `
      <div class="voip-banner voip-active">
        <div class="voip-banner-info">📞 <b>${esc(label)}</b> <span id="voip-timer">00:00</span></div>
        <div class="voip-banner-actions">
          <button class="btn btn-ghost btn-sm" id="voip-mute">Mute</button>
          <button class="btn btn-danger btn-sm" id="voip-hangup">Hang up</button>
        </div>
      </div>`;
    document.getElementById('voip-hangup').addEventListener('click', () => endCall());
    document.getElementById('voip-mute').addEventListener('click', toggleMute);
  }

  function clearOverlay() {
    const overlay = document.getElementById('voip-overlay');
    if (overlay) overlay.innerHTML = '';
  }

  // Floating quick-dial button (the explicit "floating button to VoIP" ask) — present on every
  // authenticated page (gated by shell.js the same way the rest of VoipCall is), so a call can be
  // placed without navigating to /voip.html first. Fully wired to the same placeCall() the
  // dedicated Calls page uses, not a shortcut to a stub.
  function ensureFab() {
    let root = document.getElementById('voip-fab-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'voip-fab-root';
    document.body.appendChild(root);
    root.innerHTML = `<button class="voip-fab" id="voip-fab-btn" title="Calls"><span>📞</span><span class="voip-fab-dot"></span></button>`;
    document.getElementById('voip-fab-btn').addEventListener('click', toggleFabPanel);
    document.addEventListener('click', (e) => {
      if (!panelOpen) return;
      const panel = document.getElementById('voip-fab-panel');
      const btn = document.getElementById('voip-fab-btn');
      if (panel && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeFabPanel();
    });
    return root;
  }

  function setFabVisible(visible) {
    const btn = document.getElementById('voip-fab-btn');
    if (btn) btn.style.display = visible ? 'flex' : 'none';
    if (!visible) closeFabPanel();
  }

  function toggleFabPanel() {
    if (panelOpen) closeFabPanel();
    else openFabPanel();
  }

  function closeFabPanel() {
    panelOpen = false;
    const panel = document.getElementById('voip-fab-panel');
    if (panel) panel.remove();
  }

  async function openFabPanel() {
    panelOpen = true;
    const root = ensureFab();
    let panel = document.getElementById('voip-fab-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'voip-panel';
      panel.id = 'voip-fab-panel';
      root.appendChild(panel);
    }
    panel.innerHTML = `<div class="voip-panel-head"><b>Calls</b><span class="faint" id="voip-fab-ext">…</span></div>
      <div style="padding:8px 10px 0;"><input type="text" id="voip-fab-search" placeholder="Search everyone…" style="font-size:12px;padding:6px 9px;"></div>
      <div class="voip-panel-list" id="voip-fab-list"><p class="muted" style="padding:10px;">Loading…</p></div>
      <div class="voip-panel-foot"><a href="/voip.html">Open full call history →</a></div>`;
    document.getElementById('voip-fab-search').addEventListener('input', (e) => renderFabDirectory(e.target.value));
    try {
      const { data } = await Api.get('/voip/me');
      const extEl = document.getElementById('voip-fab-ext');
      if (extEl) extEl.textContent = `ext. ${data.extension}`;
    } catch {}
    loadFabDirectory();
  }

  // Every active employee is listed here, not just people who've already opened SPTS — someone
  // with no extension yet still shows up (calling them provisions one on the spot, see
  // voip.routes.js's POST /calls), so the full staff list is reachable from day one.
  let fabDirectoryCache = [];

  function renderFabDirectory(term) {
    const list = document.getElementById('voip-fab-list');
    if (!list) return;
    const q = term.trim().toLowerCase();
    const rows = q
      ? fabDirectoryCache.filter((p) => [p.full_legal_name, p.position_title, p.department].some((v) => (v || '').toLowerCase().includes(q)))
      : fabDirectoryCache;
    if (rows.length === 0) { list.innerHTML = '<p class="muted" style="padding:10px;">No match.</p>'; return; }
    list.innerHTML = rows.map((p) => `
      <div class="voip-panel-row">
        <span class="voip-dot ${p.online ? 'online' : ''}"></span>
        <div style="flex:1;min-width:0;">
          <div class="name">${esc(p.full_legal_name)}</div>
          <div class="sub">${p.extension ? `ext. ${esc(p.extension)}` : 'not yet set up'} · ${p.online ? 'Online' : 'Offline'}</div>
        </div>
        <button class="btn btn-primary btn-sm" data-fab-call="${esc(p.employee_no)}" data-fab-name="${esc(p.full_legal_name)}">Call</button>
      </div>`).join('');
    list.querySelectorAll('[data-fab-call]').forEach((b) =>
      b.addEventListener('click', () => { closeFabPanel(); placeCall(b.dataset.fabCall, b.dataset.fabName); }));
  }

  async function loadFabDirectory() {
    const list = document.getElementById('voip-fab-list');
    if (!list) return;
    try {
      const { data } = await Api.get('/voip/directory');
      updateFabDot(data);
      fabDirectoryCache = data;
      if (data.length === 0) { list.innerHTML = '<p class="muted" style="padding:10px;">No other active employees found.</p>'; return; }
      const searchEl = document.getElementById('voip-fab-search');
      renderFabDirectory(searchEl ? searchEl.value : '');
    } catch {
      list.innerHTML = '<p class="muted" style="padding:10px;">Could not load the directory.</p>';
    }
  }

  async function refreshFabDot() {
    try {
      const { data } = await Api.get('/voip/directory');
      updateFabDot(data);
    } catch {}
  }

  function updateFabDot(directory) {
    const btn = document.getElementById('voip-fab-btn');
    if (btn) btn.classList.toggle('has-online', directory.some((p) => p.online));
  }

  async function heartbeat() {
    try { await Api.post('/voip/heartbeat'); } catch { /* offline this tick — next heartbeat retries */ }
  }

  async function pollIncoming() {
    if (activeCall) return; // no call-waiting in this build — one call at a time
    try {
      const { data } = await Api.get('/voip/calls/incoming');
      if (data) { activeCall = { id: data.id, role: 'callee', otherName: data.caller_name }; setFabVisible(false); renderIncoming(data); }
    } catch { /* transient — the next poll tries again */ }
  }

  async function createPeerConnection() {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    remoteAudio = new Audio();
    remoteAudio.autoplay = true;
    pc.ontrack = (e) => { remoteAudio.srcObject = e.streams[0]; };
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal('ice', e.candidate); };
  }

  async function sendSignal(kind, payload) {
    if (!activeCall) return;
    try { await Api.post(`/voip/calls/${activeCall.id}/signal`, { kind, payload }); } catch { /* best-effort */ }
  }

  async function applyRemoteDescription(desc) {
    await pc.setRemoteDescription(new RTCSessionDescription(desc));
    for (const cand of pendingIce.splice(0)) {
      try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch { /* stale candidate — ignore */ }
    }
  }

  function startSignalPolling() {
    sinceSignalId = 0; pendingIce = [];
    clearInterval(signalTimer);
    signalTimer = setInterval(pollSignals, SIGNAL_POLL_MS);
  }

  async function pollSignals() {
    if (!activeCall || !pc) return;
    try {
      const { data } = await Api.get(`/voip/calls/${activeCall.id}/signal?after=${sinceSignalId}`);
      for (const sig of data) {
        sinceSignalId = Math.max(sinceSignalId, sig.id);
        if (sig.kind === 'offer') {
          await applyRemoteDescription(sig.payload);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal('answer', answer);
        } else if (sig.kind === 'answer') {
          await applyRemoteDescription(sig.payload);
        } else if (sig.kind === 'ice') {
          if (pc.remoteDescription) { try { await pc.addIceCandidate(new RTCIceCandidate(sig.payload)); } catch {} }
          else pendingIce.push(sig.payload);
        } else if (sig.kind === 'hangup') {
          Api.toast('Call ended');
          teardown();
        }
      }
    } catch { /* transient — the next poll tries again */ }
  }

  async function answerCall(call) {
    clearOverlay();
    try {
      await Api.post(`/voip/calls/${call.id}/answer`);
      await createPeerConnection();
      startSignalPolling();
      startCallTimer(call.caller_name);
      pollCallStatus();
    } catch (e) {
      Api.toast(e.message, true);
      teardown();
    }
  }

  async function declineCall(call) {
    clearOverlay();
    try { await Api.post(`/voip/calls/${call.id}/decline`); } catch {}
    activeCall = null;
    setFabVisible(true);
  }

  async function placeCall(toEmployeeNo, label) {
    if (activeCall) { Api.toast('You are already on a call', true); return; }
    try {
      const { data } = await Api.post('/voip/calls', { to_employee_no: toEmployeeNo });
      activeCall = { id: data.id, role: 'caller', otherName: label };
      setFabVisible(false);
      renderInCall(`Calling ${label}…`);
      await createPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal('offer', offer);
      startSignalPolling();
      pollCallStatus();
    } catch (e) {
      Api.toast('Could not start the call: ' + e.message, true);
      teardown();
    }
  }

  function pollCallStatus() {
    clearInterval(statusTimer);
    statusTimer = setInterval(async () => {
      if (!activeCall) return clearInterval(statusTimer);
      try {
        const { data } = await Api.get(`/voip/calls/${activeCall.id}`);
        if (data.status === 'answered' && !callStartedAt) {
          startCallTimer(activeCall.otherName);
        } else if (['declined', 'missed', 'ended'].includes(data.status)) {
          Api.toast(data.status === 'declined' ? `${activeCall.otherName} declined the call` : 'Call ended');
          teardown();
        }
      } catch {}
    }, RING_POLL_MS);
  }

  function startCallTimer(label) {
    callStartedAt = Date.now();
    renderInCall(label);
    clearInterval(durationTimer);
    durationTimer = setInterval(() => {
      const t = document.getElementById('voip-timer');
      if (!t) return;
      const s = Math.floor((Date.now() - callStartedAt) / 1000);
      t.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
  }

  function toggleMute() {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const btn = document.getElementById('voip-mute');
    if (btn) btn.textContent = track.enabled ? 'Mute' : 'Unmute';
  }

  async function endCall() {
    if (activeCall) {
      sendSignal('hangup', {});
      try { await Api.post(`/voip/calls/${activeCall.id}/end`); } catch {}
    }
    teardown();
  }

  function teardown() {
    clearInterval(signalTimer); clearInterval(statusTimer); clearInterval(durationTimer);
    if (pc) { pc.close(); pc = null; }
    if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
    if (remoteAudio) { remoteAudio.srcObject = null; remoteAudio = null; }
    activeCall = null; callStartedAt = null;
    clearOverlay();
    setFabVisible(true);
  }

  function start() {
    if (started) return;
    started = true;
    ensureOverlay();
    ensureFab();
    refreshFabDot();
    heartbeat();
    setInterval(heartbeat, HEARTBEAT_MS);
    setInterval(pollIncoming, RING_POLL_MS);
    setInterval(refreshFabDot, FAB_POLL_MS);
  }

  return { start, placeCall, get inCall() { return !!activeCall; } };
})();
