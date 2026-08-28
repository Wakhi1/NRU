// Voice over IP — the floating quick-dial button's backend, ported verbatim from SPTS's own
// implementation (architecture: "voice is carried on the same data bundle as everything else, no
// separate airtime line"). Handset/browser-to-browser calling over WebRTC, signaled by short
// polling — the same pattern trips.routes.js's dept-scope lookups don't need, but matches how any
// near-real-time exchange in this codebase family is done without a websocket server. Off-net
// breakout to public numbers needs a real SIP trunk provider, a procurement decision outside what
// this codebase can wire up on its own; `call_detail_record.direction` is reserved for that day.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, forbidden } = require('../platform/errors');
const { requireAuth, requirePermission } = require('../platform/auth');
const { voipCallSchema, voipSignalSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth, requirePermission('voice.call'));

const PRESENCE_WINDOW_S = 45; // no heartbeat inside this window — the client pings every 20s — reads as offline
const RING_TIMEOUT_S = 30;

async function ensureExtension(employeeNo) {
  let rows = await db.query('SELECT * FROM voip_extension WHERE employee_no = ?', [employeeNo]);
  if (rows[0]) return rows[0];
  const maxRows = await db.query('SELECT MAX(CAST(extension AS UNSIGNED)) AS mx FROM voip_extension');
  const extension = String((maxRows[0].mx || 999) + 1).padStart(4, '0');
  try {
    await db.query('INSERT INTO voip_extension (employee_no, extension, last_seen_at) VALUES (?, ?, NOW())', [employeeNo, extension]);
  } catch (e) {
    if (e.code !== 'ER_DUP_ENTRY') throw e; // provisioned by a concurrent request — fall through and re-read
  }
  rows = await db.query('SELECT * FROM voip_extension WHERE employee_no = ?', [employeeNo]);
  return rows[0];
}

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  return (Date.now() - new Date(lastSeenAt).getTime()) / 1000 <= PRESENCE_WINDOW_S;
}

// Loads a call the caller or callee is a party to, 404s otherwise — don't leak that the id even
// exists to someone who isn't a party to it.
async function loadMyCall(callId, employeeNo) {
  const rows = await db.query('SELECT * FROM call_detail_record WHERE id = ?', [callId]);
  const call = rows[0];
  if (!call || (call.caller_employee_no !== employeeNo && call.callee_employee_no !== employeeNo)) return null;
  // A ring nobody answered in time reads as missed the next time either party checks on it, rather
  // than needing a background sweep for a call record that's otherwise idle.
  if (call.status === 'ringing' && (Date.now() - new Date(call.started_at).getTime()) / 1000 > RING_TIMEOUT_S) {
    await db.query(`UPDATE call_detail_record SET status = 'missed', ended_at = NOW() WHERE id = ?`, [callId]);
    call.status = 'missed';
  }
  return call;
}

router.get('/me', asyncHandler(async (req, res) => {
  const ext = await ensureExtension(req.session.user.employeeNo);
  res.json({ data: { extension: ext.extension } });
}));

router.post('/heartbeat', asyncHandler(async (req, res) => {
  await ensureExtension(req.session.user.employeeNo);
  await db.query('UPDATE voip_extension SET last_seen_at = NOW() WHERE employee_no = ?', [req.session.user.employeeNo]);
  res.json({ ok: true });
}));

// Every active employee is callable, not just whoever has already opened FLMS at least once — LEFT
// JOIN so someone with no voip_extension row yet still shows up (with no extension assigned and
// reading as offline); POST /calls already auto-provisions the callee's extension on demand, so
// calling one of them from cold works exactly like calling anyone already online.
router.get('/directory', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT e.employee_no, e.full_legal_name, e.position_title, e.department, e.photo_path,
            v.extension, v.last_seen_at
     FROM employee_cache e LEFT JOIN voip_extension v ON v.employee_no = e.employee_no
     WHERE e.status = 'active' ORDER BY e.full_legal_name`
  );
  res.json({
    data: rows.filter((r) => r.employee_no !== req.session.user.employeeNo)
      .map((r) => ({ ...r, online: isOnline(r.last_seen_at), last_seen_at: undefined })),
  });
}));

router.get('/calls/incoming', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT c.*, e.full_legal_name AS caller_name, e.photo_path AS caller_photo
     FROM call_detail_record c JOIN employee_cache e ON e.employee_no = c.caller_employee_no
     WHERE c.callee_employee_no = ? AND c.status = 'ringing'
       AND c.started_at > (NOW() - INTERVAL ${RING_TIMEOUT_S} SECOND)
     ORDER BY c.id DESC LIMIT 1`,
    [req.session.user.employeeNo]
  );
  res.json({ data: rows[0] || null });
}));

router.get('/calls/history', asyncHandler(async (req, res) => {
  const employeeNo = req.session.user.employeeNo;
  const rows = await db.query(
    `SELECT c.*, ec.full_legal_name AS caller_name, ee.full_legal_name AS callee_name
     FROM call_detail_record c
     JOIN employee_cache ec ON ec.employee_no = c.caller_employee_no
     JOIN employee_cache ee ON ee.employee_no = c.callee_employee_no
     WHERE c.caller_employee_no = ? OR c.callee_employee_no = ?
     ORDER BY c.id DESC LIMIT 50`,
    [employeeNo, employeeNo]
  );
  res.json({
    data: rows.map((r) => ({
      ...r,
      direction: r.caller_employee_no === employeeNo ? 'outgoing' : 'incoming',
      counterpart: r.caller_employee_no === employeeNo ? r.callee_name : r.caller_name,
    })),
  });
}));

router.get('/calls/:id', asyncHandler(async (req, res) => {
  const call = await loadMyCall(req.params.id, req.session.user.employeeNo);
  if (!call) throw notFound('Call not found');
  res.json({ data: call });
}));

router.post('/calls', asyncHandler(async (req, res) => {
  const parsed = voipCallSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('A callee is required', parsed.error.flatten());
  const employeeNo = req.session.user.employeeNo;
  if (parsed.data.to_employee_no === employeeNo) throw badRequest('You cannot call yourself');

  const callee = await db.query(`SELECT employee_no FROM employee_cache WHERE employee_no = ? AND status = 'active'`, [parsed.data.to_employee_no]);
  if (!callee[0]) throw notFound('That person is not reachable');
  await ensureExtension(parsed.data.to_employee_no);
  await ensureExtension(employeeNo);

  const result = await db.query(
    `INSERT INTO call_detail_record (caller_employee_no, callee_employee_no, status, started_at) VALUES (?,?, 'ringing', NOW())`,
    [employeeNo, parsed.data.to_employee_no]
  );
  res.status(201).json({ data: { id: result.insertId } });
}));

router.post('/calls/:id/answer', asyncHandler(async (req, res) => {
  const call = await loadMyCall(req.params.id, req.session.user.employeeNo);
  if (!call) throw notFound('Call not found');
  if (call.callee_employee_no !== req.session.user.employeeNo) throw forbidden('Only the callee can answer');
  if (call.status !== 'ringing') throw badRequest('This call is no longer ringing');
  await db.query(`UPDATE call_detail_record SET status = 'answered', answered_at = NOW() WHERE id = ?`, [call.id]);
  res.json({ ok: true });
}));

router.post('/calls/:id/decline', asyncHandler(async (req, res) => {
  const call = await loadMyCall(req.params.id, req.session.user.employeeNo);
  if (!call) throw notFound('Call not found');
  if (call.callee_employee_no !== req.session.user.employeeNo) throw forbidden('Only the callee can decline');
  if (call.status !== 'ringing') throw badRequest('This call is no longer ringing');
  await db.query(`UPDATE call_detail_record SET status = 'declined', ended_at = NOW() WHERE id = ?`, [call.id]);
  res.json({ ok: true });
}));

router.post('/calls/:id/end', asyncHandler(async (req, res) => {
  const call = await loadMyCall(req.params.id, req.session.user.employeeNo);
  if (!call) throw notFound('Call not found');
  if (['ended', 'declined', 'missed'].includes(call.status)) return res.json({ ok: true });
  const status = call.status === 'ringing' ? 'missed' : 'ended';
  const durationS = call.answered_at ? Math.round((Date.now() - new Date(call.answered_at).getTime()) / 1000) : null;
  await db.query(`UPDATE call_detail_record SET status = ?, ended_at = NOW(), duration_s = ? WHERE id = ?`, [status, durationS, call.id]);
  res.json({ ok: true });
}));

// WebRTC handshake mailbox — see the file banner. `payload` carries an SDP blob (offer/answer) or a
// single ICE candidate; stored as opaque JSON, never inspected server-side.
router.post('/calls/:id/signal', asyncHandler(async (req, res) => {
  const call = await loadMyCall(req.params.id, req.session.user.employeeNo);
  if (!call) throw notFound('Call not found');
  const parsed = voipSignalSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid signal', parsed.error.flatten());
  const employeeNo = req.session.user.employeeNo;
  const toEmployeeNo = call.caller_employee_no === employeeNo ? call.callee_employee_no : call.caller_employee_no;
  await db.query(
    `INSERT INTO voip_signal (call_id, from_employee_no, to_employee_no, kind, payload) VALUES (?,?,?,?,?)`,
    [call.id, employeeNo, toEmployeeNo, parsed.data.kind, JSON.stringify(parsed.data.payload)]
  );
  res.json({ ok: true });
}));

router.get('/calls/:id/signal', asyncHandler(async (req, res) => {
  const call = await loadMyCall(req.params.id, req.session.user.employeeNo);
  if (!call) throw notFound('Call not found');
  const after = Number(req.query.after) || 0;
  const rows = await db.query(
    `SELECT * FROM voip_signal WHERE call_id = ? AND to_employee_no = ? AND id > ? ORDER BY id ASC`,
    [call.id, req.session.user.employeeNo, after]
  );
  res.json({ data: rows.map((r) => ({ id: r.id, kind: r.kind, payload: JSON.parse(r.payload) })) });
}));

module.exports = router;
