// The enforced check-in gate (architecture doc §5) — this is the heart of the "employees can
// clock in" ask. A decision is always computed server-side; the client never grants itself a shift.
const express = require('express');
const db = require('../platform/db');
const hris = require('../platform/hris');
const { asyncHandler, badRequest, notFound, forbidden } = require('../platform/errors');
const { requireAuth, requirePermission } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { evaluateZone } = require('../platform/geofence');
const { checkinSchema, fixSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth);

async function getPolicy() {
  const rows = await db.query('SELECT * FROM policy WHERE id = 1');
  return rows[0] || { default_radius_m: 150, accuracy_ceiling_m: 50, recheck_hours: 4, offline_behavior: 'Allow — confirm at next sync', shift_start_time: null, shift_end_time: null };
}

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

async function myOpenCheckIn(employeeNo) {
  const rows = await db.query(
    `SELECT ci.*, z.name AS zone_name, z.radius_m AS zone_radius_m, z.center_lat, z.center_lng
     FROM check_in ci LEFT JOIN zone z ON z.id = ci.zone_id
     WHERE ci.employee_no = ? AND ci.status = 'open' ORDER BY ci.id DESC LIMIT 1`,
    [employeeNo]
  );
  return rows[0] || null;
}

router.get('/me', asyncHandler(async (req, res) => {
  const employeeNo = req.session.user.employeeNo;
  const [open, zones, policy] = await Promise.all([
    myOpenCheckIn(employeeNo),
    db.query(
      `SELECT z.id, z.name, z.kind, z.center_lat, z.center_lng, z.radius_m, z.rule_type
       FROM zone_assignment za JOIN zone z ON z.id = za.zone_id
       WHERE za.employee_no = ? AND z.active = 1`,
      [employeeNo]
    ),
    getPolicy(),
  ]);
  res.json({ data: { open, zones, policy } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = checkinSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('A valid lat/lng fix is required', parsed.error.flatten());
  const { lat, lng, accuracy_m, device_id } = parsed.data;
  const employeeNo = req.session.user.employeeNo;

  const existing = await myOpenCheckIn(employeeNo);
  if (existing) throw badRequest('Already checked in — clock out before starting a new shift');

  if (device_id) {
    const dev = await db.query('SELECT * FROM device WHERE id = ?', [device_id]);
    if (!dev[0] || dev[0].assigned_employee_no !== employeeNo) {
      const [ins] = [await db.query(
        `INSERT INTO check_in (employee_no, device_id, zone_id, lat, lng, accuracy_m, distance_m, decision, status, shift_started_at)
         VALUES (?,?,?,?,?,?,?,?, 'closed', NOW())`,
        [employeeNo, device_id, null, lat, lng, accuracy_m || null, null, 'blocked']
      )];
      return res.json({ data: { decision: 'blocked', reason: 'This handset is not assigned to you', check_in_id: ins.insertId } });
    }
  }

  const policy = await getPolicy();

  if (!withinShiftWindow(policy)) {
    const ins = await db.query(
      `INSERT INTO check_in (employee_no, device_id, zone_id, lat, lng, accuracy_m, distance_m, decision, status, shift_started_at)
       VALUES (?,?,?,?,?,?,?, 'blocked', 'closed', NOW())`,
      [employeeNo, device_id || null, null, lat, lng, accuracy_m || null, null]
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
      `INSERT INTO check_in (employee_no, device_id, zone_id, lat, lng, accuracy_m, distance_m, decision, status, shift_started_at)
       VALUES (?,?,?,?,?,?,?, 'stale', 'closed', NOW())`,
      [employeeNo, device_id || null, zones[0]?.id || null, lat, lng, accuracy_m, null]
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
      `INSERT INTO check_in (employee_no, device_id, zone_id, lat, lng, accuracy_m, distance_m, decision, status, hris_timer_id, shift_started_at)
       VALUES (?,?,?,?,?,?,?, 'confirmed', 'open', ?, NOW())`,
      [employeeNo, device_id || null, best.zone.id, lat, lng, accuracy_m || null, best.eval.distance_m, hrisTimerId]
    );
    await writeAudit(req, 'checkin.confirmed', 'check_in', result.insertId, null, { zone: best.zone.name, distance_m: best.eval.distance_m });
    return res.json({ data: { decision: 'confirmed', check_in_id: result.insertId, zone: best.zone.name, distance_m: best.eval.distance_m } });
  }

  const insRes = await db.query(
    `INSERT INTO check_in (employee_no, device_id, zone_id, lat, lng, accuracy_m, distance_m, decision, status, shift_started_at)
     VALUES (?,?,?,?,?,?,?, 'outside', 'open', NOW())`,
    [employeeNo, device_id || null, best.zone.id, lat, lng, accuracy_m || null, best.eval.distance_m]
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
    `SELECT o.*, e.full_legal_name, ci.distance_m, ci.zone_id, z.name AS zone_name
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
      `UPDATE check_in SET decision='confirmed', override_by_employee_no=?, override_reason=?, hris_timer_id = COALESCE(hris_timer_id, ?) WHERE id = ?`,
      [req.session.user.employeeNo, rows[0].reason, hrisTimerId, rows[0].check_in_id]
    );
  } else {
    await db.query(`UPDATE check_in SET status='closed' WHERE id = ?`, [rows[0].check_in_id]);
  }

  await writeAudit(req, `override.${decision}`, 'override_request', req.params.id, null, null);
  res.json({ ok: true });
}));

module.exports = router;
