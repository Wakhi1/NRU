// Live tracking — simulated vehicle telemetry (see platform/telemetry.js) rendered on a Leaflet
// map. Restricted to `tracking.live.view`, which only System administrator holds by default —
// matches SPTS's own "IT/control room hold live location, nobody else by default" pattern.
//
// Deliberately restricted to `category = 'work'` vehicles ONLY — executive vehicles never appear
// on this screen at all, at any permission level. Day-to-day live-position monitoring is an
// operational-dispatch concern for the work fleet; it isn't the purpose of this screen for a
// vehicle assigned to leadership, so executive vehicles are excluded outright rather than merely
// gated behind a stricter permission.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler } = require('../platform/errors');
const { requireAuth, requireScreen, requirePermission } = require('../platform/auth');

const router = express.Router();
router.use(requireAuth, requireScreen('tracking'), requirePermission('tracking.live.view'));

router.get('/live', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT v.id, v.reg_no, v.model, v.department, v.current_lat, v.current_lng, v.heading_deg, v.speed_kmh, v.last_ping_at,
            e.full_legal_name AS driver_name
     FROM vehicle v LEFT JOIN employee_cache e ON e.employee_no = v.assigned_driver_employee_no
     WHERE v.status = 'On trip' AND v.category = 'work'
     ORDER BY v.reg_no`
  );
  res.json({ data: rows });
}));

module.exports = router;
