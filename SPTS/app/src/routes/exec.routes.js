// Executive overview — organisation totals only, architecture doc §3.3 ("aggregate.view ... every
// individual-level read" explicitly denied). No employee_no, no coordinates, ever, on this router.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler } = require('../platform/errors');
const { requireAuth, requirePermission } = require('../platform/auth');

const router = express.Router();
router.use(requireAuth, requirePermission('aggregate.view'));

router.get('/summary', asyncHandler(async (req, res) => {
  const [[headcount], [onShift], [zones], [openAlerts], byDept, todayCheckins, deviceStatus] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM employee_cache WHERE status = 'active'`),
    db.query(`SELECT COUNT(*) AS n FROM check_in WHERE status = 'open'`),
    db.query(`SELECT COUNT(*) AS n FROM zone WHERE active = 1`),
    db.query(`SELECT COUNT(*) AS n FROM alert WHERE resolved = 0`),
    db.query(`SELECT department, COUNT(*) AS n FROM employee_cache WHERE status='active' AND department IS NOT NULL GROUP BY department ORDER BY n DESC`),
    db.query(
      `SELECT decision, COUNT(*) AS n FROM check_in WHERE DATE(shift_started_at) = CURDATE() GROUP BY decision`
    ),
    db.query(`SELECT status, COUNT(*) AS n FROM device GROUP BY status`),
  ]);
  res.json({
    data: {
      headcount: headcount.n, onShift: onShift.n, zones: zones.n, openAlerts: openAlerts.n,
      byDepartment: byDept, todayCheckins, deviceStatus,
    },
  });
}));

module.exports = router;
