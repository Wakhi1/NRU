// Location history / playback — the Leaflet polyline+points screen. Live location and location
// history are the most restricted permissions in the system (architecture doc §3.3); a person may
// always see their OWN track (self-service), and org-wide history additionally requires
// `location.history.view` (System administrator, and System Analyst for audit purposes).
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, forbidden, notFound } = require('../platform/errors');
const { requireAuth } = require('../platform/auth');
const { hasPermission } = require('../platform/scope');

const router = express.Router();
router.use(requireAuth);

function canView(req, employeeNo) {
  if (req.session.user.employeeNo === employeeNo) return true;
  return hasPermission(req.session.user.roleKeys, 'location.history.view');
}

router.get('/shifts', asyncHandler(async (req, res) => {
  const target = req.query.employee_no || req.session.user.employeeNo;
  if (!canView(req, target)) throw forbidden('You may only view your own location history');

  const rows = await db.query(
    `SELECT ci.id, ci.decision, ci.status, ci.shift_started_at, ci.shift_ended_at, ci.distance_m,
            z.name AS zone_name, e.full_legal_name,
            (SELECT COUNT(*) FROM location_fix f WHERE f.check_in_id = ci.id) AS fix_count
     FROM check_in ci
     LEFT JOIN zone z ON z.id = ci.zone_id
     JOIN employee_cache e ON e.employee_no = ci.employee_no
     WHERE ci.employee_no = ? AND ci.decision = 'confirmed'
     ORDER BY ci.shift_started_at DESC LIMIT 60`,
    [target]
  );
  res.json({ data: rows });
}));

router.get('/shifts/:id/track', asyncHandler(async (req, res) => {
  const ciRows = await db.query('SELECT * FROM check_in WHERE id = ?', [req.params.id]);
  const ci = ciRows[0];
  if (!ci) throw notFound('Shift not found');
  if (!canView(req, ci.employee_no)) throw forbidden('You may only view your own location history');

  const fixes = await db.query(
    `SELECT lat, lng, accuracy_m, captured_at FROM location_fix WHERE check_in_id = ? ORDER BY captured_at ASC`,
    [req.params.id]
  );
  res.json({ data: { checkIn: ci, fixes } });
}));

router.get('/employees', asyncHandler(async (req, res) => {
  if (!hasPermission(req.session.user.roleKeys, 'location.history.view')) return res.json({ data: [] });
  const rows = await db.query(
    `SELECT DISTINCT e.employee_no, e.full_legal_name FROM check_in ci JOIN employee_cache e ON e.employee_no = ci.employee_no ORDER BY e.full_legal_name`
  );
  res.json({ data: rows });
}));

module.exports = router;
