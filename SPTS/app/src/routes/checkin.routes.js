// The enforced check-in gate (architecture doc §5) — this is the heart of the "employees can
// clock in" ask. A decision is always computed server-side; the client never grants itself a shift.
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const db = require('../platform/db');
const hris = require('../platform/hris');
const { asyncHandler, badRequest, notFound, forbidden } = require('../platform/errors');
const { requireAuth, requirePermission } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { evaluateZone } = require('../platform/geofence');
const { getOpenCheckIn, getPolicy, gateFor } = require('../platform/locationGate');
const { checkinSchema, fixSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth);

// Photographic proof captured at the moment of check-in (architecture doc §7 — "the gallery picker
// is disabled, an old photograph cannot be passed off as today's"). The browser side only offers
// the device camera (myshift.js uses `capture="environment"`, no plain file picker), and the server
// independently refuses to open a shift without a file landing here regardless of what the client
// claims — same "never a client-side grant" principle as the geofence gate itself.
const PHOTO_DIR = path.join(__dirname, '..', '..', 'public', 'img', 'checkins');
fs.mkdirSync(PHOTO_DIR, { recursive: true });
const uploadCheckinPhoto = multer({
  storage: multer.diskStorage({
    destination: PHOTO_DIR,
    filename: (req, file, cb) => cb(null, `${req.session.user.employeeNo}-${Date.now()}${path.extname(file.originalname).toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return cb(badRequest('Unsupported image type — use JPEG, PNG or WebP'));
    cb(null, true);
  },
});

// "Rule setting to control flow and movement of enumerators" — architecture doc §10: tracking is
// bounded by shift hours, outside them no fixes are recorded. Unset (either field null) means no
// time-of-day restriction — only the geofence applies. Handles an overnight window (e.g. 22:00 to
// 06:00) by treating "start > end" as wrapping past midnight.
function withinShiftWindow(policy) {
  if (!policy.shift_start_time || !policy.shift_end_time) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = policy.shift_start_time.split(':').map(Number);
  const [eh, em] = policy.shift_end_time.split(':').map(Number);
  const start = sh * 60 + sm, end = eh * 60 + em;
  return start <= end ? (cur >= start && cur <= end) : (cur >= start || cur <= end);
}

router.get('/me', asyncHandler(async (req, res) => {
  const employeeNo = req.session.user.employeeNo;
  const [gate, zones] = await Promise.all([
    gateFor(employeeNo, req.session.loggedInAt),
    db.query(
      `SELECT z.id, z.name, z.kind, z.center_lat, z.center_lng, z.radius_m, z.rule_type
       FROM zone_assignment za JOIN zone z ON z.id = za.zone_id
       WHERE za.employee_no = ? AND z.active = 1`,
      [employeeNo]
    ),
  ]);
  const { open, policy, needsLocationConfirm } = gate;
  // Distinguish "no shift at all" (show the clock-in button) from "a shift exists but is stale
  // relative to this login or the recheck interval" (show reconfirm, not a brand-new clock-in —
  // the existing open shift blocks a second POST / until it's closed).
  const needsReconfirm = needsLocationConfirm && !!open && open.status === 'open';
  res.json({ data: { open, zones, policy, needsLocationConfirm, needsReconfirm } });
}));

router.post('/', uploadCheckinPhoto.single('photo'), asyncHandler(async (req, res) => {
  const parsed = checkinSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('A valid lat/lng fix is required', parsed.error.flatten());
  if (!req.file) throw badRequest('A check-in photo is required — take one with your camera to prove you are on site');
  const { lat, lng, accuracy_m, device_id } = parsed.data;
  const employeeNo = req.session.user.employeeNo;
  const photoPath = `/img/checkins/${req.file.filename}`;

  const existing = await getOpenCheckIn(employeeNo);
  if (existing) {
    fs.unlink(req.file.path, () => {});
    throw badRequest('Already checked in — clock out before starting a new shift');
  }

  if (device_id) {
    const dev = await db.query('SELECT * FROM device WHERE id = ?', [device_id]);
    if (!dev[0] || dev[0].assigned_employee_no !== employeeNo) {
      const [ins] = [await db.query(
        `INSERT INTO check_in (employee_no, device_id, zone_id, lat, lng, accuracy_m, distance_m, decision, status, photo_path, photo_taken_at, shift_started_at)
         VALUES (?,?,?,?,?,?,?,?, 'closed', ?, NOW(), NOW())`,
        [employeeNo, device_id, null, lat, lng, accuracy_m || null, null, 'blocked', photoPath]
      )];
      return res.json({ data: { decision: 'blocked', reason: 'This handset is not assigned to you', check_in_id: ins.insertId } });
    }
  }

  const policy = await getPolicy();

  if (!withinShiftWindow(policy)) {
    const ins = await db.query(
      `INSERT INTO check_in (employee_no, device_id, zone_id, lat, lng, accuracy_m, distance_m, decision, status, photo_path, photo_taken_at, shift_started_at)
       VALUES (?,?,?,?,?,?,?, 'blocked', 'closed', ?, NOW(), NOW())`,
      [employeeNo, device_id || null, null, lat, lng, accuracy_m || null, null, photoPath]
    );
    return res.json({ data: { decision: 'blocked', reason: `Outside permitted shift hours (${policy.shift_start_time.slice(0, 5)}–${policy.shift_end_time.slice(0, 5)})`, check_in_id: ins.insertId } });
  }

  const accuracyOk = accuracy_m == null || accuracy_m <= policy.accuracy_ceiling_m;

  const zones = await db.query(
    `SELECT z.* FROM zone_assignment za JOIN zone z ON z.id = za.zone_id WHERE za.employee_no = ? AND z.active = 1`,
    [employeeNo]
  );

  if (!accuracyOk) {
    await db.query(
      `INSERT INTO check_in (employee_no, device_id, zone_id, lat, lng, accuracy_m, distance_m, decision, status, photo_path, photo_taken_at, shift_started_at)
       VALUES (?,?,?,?,?,?,?, 'stale', 'closed', ?, NOW(), NOW())`,
      [employeeNo, device_id || null, zones[0]?.id || null, lat, lng, accuracy_m, null, photoPath]
    );
    return res.json({ data: { decision: 'stale', reason: `Fix accuracy ${accuracy_m}m exceeds the ${policy.accuracy_ceiling_m}m policy ceiling — get a better fix and try again` } });
  }

  if (zones.length === 0) {
    return res.json({ data: { decision: 'blocked', reason: 'No geofence zone is assigned to you yet — ask your control room to assign one' } });
  }

  let best = null;
  for (const z of zones) {
    const evalResult = evaluateZone(z, lat, lng, accuracy_m, policy);
    if (!best || evalResult.distance_m < best.eval.distance_m) best = { zone: z, eval: evalResult };
    if (evalResult.inside) { best = { zone: z, eval: evalResult }; break; }
  }

  if (best.eval.inside) {
    let hrisTimerId = null;
    try {
      const timer = await hris.clockIn(employeeNo, { source: 'mobile_gps', device: device_id ? `SPTS handset #${device_id}` : 'Web browser', geo: `${lat},${lng}` });
      hrisTimerId = timer.id;
    } catch (e) {
      if (e.status !== 409) throw e; // 409 = already clocked in on the HRIS side; proceed with SPTS's own record anyway
    }
    const result = await db.query(
      `INSERT INTO check_in (employee_no, device_id, zone_id, lat, lng, accuracy_m, distance_m, decision, status, hris_timer_id, photo_path, photo_taken_at, reconfirmed_at, shift_started_at)
       VALUES (?,?,?,?,?,?,?, 'confirmed', 'open', ?, ?, NOW(), NOW(), NOW())`,
      [employeeNo, device_id || null, best.zone.id, lat, lng, accuracy_m || null, best.eval.distance_m, hrisTimerId, photoPath]
    );
    await writeAudit(req, 'checkin.confirmed', 'check_in', result.insertId, null, { zone: best.zone.name, distance_m: best.eval.distance_m });
    return res.json({ data: { decision: 'confirmed', check_in_id: result.insertId, zone: best.zone.name, distance_m: best.eval.distance_m } });
  }

  const insRes = await db.query(
    `INSERT INTO check_in (employee_no, device_id, zone_id, lat, lng, accuracy_m, distance_m, decision, status, photo_path, photo_taken_at, shift_started_at)
     VALUES (?,?,?,?,?,?,?, 'outside', 'open', ?, NOW(), NOW())`,
    [employeeNo, device_id || null, best.zone.id, lat, lng, accuracy_m || null, best.eval.distance_m, photoPath]
  );
  await db.query(
    `INSERT INTO override_request (check_in_id, employee_no, reason) VALUES (?,?,?)`,
    [insRes.insertId, employeeNo, `${best.eval.distance_m}m outside ${best.zone.name}`]
  );
  await db.query(
    `INSERT INTO alert (severity, employee_no, zone_id, kind, note) VALUES ('med', ?, ?, 'Check-in outside assigned zone', ?)`,
    [employeeNo, best.zone.id, `${best.eval.distance_m}m from ${best.zone.name}`]
  );
  res.json({ data: { decision: 'outside', check_in_id: insRes.insertId, zone: best.zone.name, distance_m: best.eval.distance_m } });
}));

// Re-verifies location on an already-open shift without starting a new one — used both for the
// recheck-interval nudge (policy.recheck_hours) and for the "confirm again, you just logged in"
// gate (locationGate.needsConfirmation) when a shift was left open from a previous session. No new
// photo is required here: the photographic proof is tied to opening the shift, not to every
// re-verification, matching the doc's recheck description ("re-confirmation interval, default 4h")
// which only ever mentions position, never a repeat selfie.
router.post('/:id/reconfirm', asyncHandler(async (req, res) => {
  const parsed = fixSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('A valid lat/lng fix is required');
  const employeeNo = req.session.user.employeeNo;
  const { lat, lng, accuracy_m } = parsed.data;

  const rows = await db.query(
    `SELECT ci.*, z.name AS zone_name, z.radius_m AS zone_radius_m, z.center_lat, z.center_lng
     FROM check_in ci LEFT JOIN zone z ON z.id = ci.zone_id
     WHERE ci.id = ? AND ci.employee_no = ? AND ci.status = 'open'`,
    [req.params.id, employeeNo]
  );
  const open = rows[0];
  if (!open) throw notFound('No open shift with that id');

  await db.query(
    `INSERT INTO location_fix (check_in_id, employee_no, lat, lng, accuracy_m, captured_at) VALUES (?,?,?,?,?, NOW())`,
    [open.id, employeeNo, lat, lng, accuracy_m || null]
  );

  if (!open.zone_id) {
    await db.query(`UPDATE check_in SET reconfirmed_at = NOW() WHERE id = ?`, [open.id]);
    return res.json({ data: { decision: 'confirmed' } });
  }

  const policy = await getPolicy();
  const zone = { center_lat: open.center_lat, center_lng: open.center_lng, radius_m: open.zone_radius_m };
  const evalResult = evaluateZone(zone, lat, lng, accuracy_m, policy);

  if (evalResult.inside) {
    await db.query(`UPDATE check_in SET reconfirmed_at = NOW(), decision = 'confirmed' WHERE id = ?`, [open.id]);
    await writeAudit(req, 'checkin.reconfirmed', 'check_in', open.id, null, { distance_m: evalResult.distance_m });
    return res.json({ data: { decision: 'confirmed', zone: open.zone_name, distance_m: evalResult.distance_m } });
  }

  await db.query(`UPDATE check_in SET decision = 'outside' WHERE id = ?`, [open.id]);
  const pending = await db.query(`SELECT id FROM override_request WHERE check_in_id = ? AND status = 'pending'`, [open.id]);
  if (pending.length === 0) {
    await db.query(
      `INSERT INTO override_request (check_in_id, employee_no, reason) VALUES (?,?,?)`,
      [open.id, employeeNo, `${evalResult.distance_m}m outside ${open.zone_name} at reconfirmation`]
    );
    await db.query(
      `INSERT INTO alert (severity, employee_no, zone_id, kind, note) VALUES ('med', ?, ?, 'Reconfirmation outside assigned zone', ?)`,
      [employeeNo, open.zone_id, `${evalResult.distance_m}m from ${open.zone_name}`]
    );
  }
  res.json({ data: { decision: 'outside', zone: open.zone_name, distance_m: evalResult.distance_m } });
}));

router.post('/:id/close', asyncHandler(async (req, res) => {
  const employeeNo = req.session.user.employeeNo;
  const rows = await db.query('SELECT * FROM check_in WHERE id = ? AND employee_no = ?', [req.params.id, employeeNo]);
  if (!rows[0]) throw notFound('Check-in not found');
  if (rows[0].status !== 'open') throw badRequest('This shift is already closed');

  await db.query(`UPDATE check_in SET status='closed', shift_ended_at = NOW() WHERE id = ?`, [req.params.id]);
  try { await hris.clockOut(employeeNo); } catch (e) { if (e.status !== 404) throw e; }
  await writeAudit(req, 'checkin.closed', 'check_in', req.params.id, null, null);
  res.json({ ok: true });
}));

router.post('/:id/fix', asyncHandler(async (req, res) => {
  const parsed = fixSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('A valid lat/lng fix is required');
  const employeeNo = req.session.user.employeeNo;
  const rows = await db.query('SELECT * FROM check_in WHERE id = ? AND employee_no = ? AND status = "open"', [req.params.id, employeeNo]);
  if (!rows[0]) throw notFound('No open shift with that id');
  const { lat, lng, accuracy_m } = parsed.data;

  await db.query(
    `INSERT INTO location_fix (check_in_id, employee_no, lat, lng, accuracy_m, captured_at) VALUES (?,?,?,?,?, NOW())`,
    [req.params.id, employeeNo, lat, lng, accuracy_m || null]
  );

  if (rows[0].zone_id) {
    const zoneRows = await db.query('SELECT * FROM zone WHERE id = ?', [rows[0].zone_id]);
    const zone = zoneRows[0];
    if (zone && zone.rule_type === 'exit_alert') {
      const policy = await getPolicy();
      const evalResult = evaluateZone(zone, lat, lng, accuracy_m, policy);
      if (!evalResult.inside) {
        const recent = await db.query(
          `SELECT id FROM alert WHERE employee_no = ? AND zone_id = ? AND kind = 'Geofence exit' AND created_at > (NOW() - INTERVAL 30 MINUTE)`,
          [employeeNo, zone.id]
        );
        if (recent.length === 0) {
          await db.query(
            `INSERT INTO alert (severity, employee_no, zone_id, kind, note) VALUES ('high', ?, ?, 'Geofence exit', ?)`,
            [employeeNo, zone.id, `${evalResult.distance_m}m outside ${zone.name} while on shift`]
          );
          await db.query(`INSERT INTO geofence_event (zone_id, employee_no, event) VALUES (?,?, 'exited')`, [zone.id, employeeNo]);
        }
      }
    }
  }
  res.json({ ok: true });
}));

router.get('/overrides', requirePermission('checkin.override.grant'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT o.*, e.full_legal_name, ci.distance_m, ci.zone_id, ci.photo_path, z.name AS zone_name
     FROM override_request o
     JOIN employee_cache e ON e.employee_no = o.employee_no
     JOIN check_in ci ON ci.id = o.check_in_id
     LEFT JOIN zone z ON z.id = ci.zone_id
     WHERE o.status = 'pending' ORDER BY o.created_at DESC`
  );
  res.json({ data: rows });
}));

router.post('/overrides/:id/decide', requirePermission('checkin.override.grant'), asyncHandler(async (req, res) => {
  const decision = req.body.decision === 'granted' ? 'granted' : 'denied';
  const rows = await db.query('SELECT * FROM override_request WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Override request not found');
  if (rows[0].status !== 'pending') throw badRequest('This request was already decided');

  await db.query(
    `UPDATE override_request SET status = ?, decided_by_employee_no = ?, decided_at = NOW() WHERE id = ?`,
    [decision, req.session.user.employeeNo, req.params.id]
  );

  if (decision === 'granted') {
    const ci = await db.query('SELECT * FROM check_in WHERE id = ?', [rows[0].check_in_id]);
    let hrisTimerId = null;
    try {
      const timer = await hris.clockIn(ci[0].employee_no, { source: 'mobile_gps', device: 'Override — SPTS', geo: `${ci[0].lat},${ci[0].lng}` });
      hrisTimerId = timer.id;
    } catch (e) { if (e.status !== 409) throw e; }
    await db.query(
      `UPDATE check_in SET decision='confirmed', reconfirmed_at = NOW(), override_by_employee_no=?, override_reason=?, hris_timer_id = COALESCE(hris_timer_id, ?) WHERE id = ?`,
      [req.session.user.employeeNo, rows[0].reason, hrisTimerId, rows[0].check_in_id]
    );
  } else {
    await db.query(`UPDATE check_in SET status='closed' WHERE id = ?`, [rows[0].check_in_id]);
  }

  await writeAudit(req, `override.${decision}`, 'override_request', req.params.id, null, null);
  res.json({ ok: true });
}));

module.exports = router;
