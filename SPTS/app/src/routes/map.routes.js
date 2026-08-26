// Live map — the most restricted screen (architecture doc §3.3: live location is System
// administrator only, denied to everyone else including Heads of Department).
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, forbidden } = require('../platform/errors');
const { requireAuth, requirePermission } = require('../platform/auth');

const router = express.Router();
router.use(requireAuth, requirePermission('location.live.view'));

router.get('/live', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT ci.id AS check_in_id, ci.employee_no, ci.lat, ci.lng, ci.accuracy_m, ci.shift_started_at, ci.decision,
            e.full_legal_name, e.department, e.position_title, e.photo_path,
            d.asset_tag, d.hw_model, d.battery_pct, d.status AS device_status,
            z.name AS zone_name, z.center_lat, z.center_lng, z.radius_m,
            (SELECT lf.lat FROM location_fix lf WHERE lf.check_in_id = ci.id ORDER BY lf.captured_at DESC LIMIT 1) AS last_lat,
            (SELECT lf.lng FROM location_fix lf WHERE lf.check_in_id = ci.id ORDER BY lf.captured_at DESC LIMIT 1) AS last_lng,
            (SELECT lf.captured_at FROM location_fix lf WHERE lf.check_in_id = ci.id ORDER BY lf.captured_at DESC LIMIT 1) AS last_seen
     FROM check_in ci
     JOIN employee_cache e ON e.employee_no = ci.employee_no
     LEFT JOIN device d ON d.id = ci.device_id
     LEFT JOIN zone z ON z.id = ci.zone_id
     WHERE ci.status = 'open'
     ORDER BY e.full_legal_name`
  );
  const devices = rows.map((r) => ({
    ...r,
    lat: r.last_lat != null ? r.last_lat : r.lat,
    lng: r.last_lng != null ? r.last_lng : r.lng,
  }));
  res.json({ data: devices });
}));

router.get('/geofences', asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT id, name, kind, center_lat, center_lng, radius_m, rule_type, active FROM zone WHERE active = 1');
  res.json({ data: rows });
}));

module.exports = router;
