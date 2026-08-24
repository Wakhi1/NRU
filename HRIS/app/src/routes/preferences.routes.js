const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest } = require('../platform/errors');

const router = express.Router();

// Per-user, server-side personalization (dashboard KPI/chart visibility, quick-action
// shortcuts) — replaces an earlier admin-only, browser-localStorage-only version so every
// role can personalize their own view and it follows them across devices/browsers.
router.get('/', asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT dashboard_json FROM user_preference WHERE employee_no = ?', [req.session.user.employeeNo]);
  const dashboard = rows[0] && rows[0].dashboard_json ? JSON.parse(rows[0].dashboard_json) : {};
  res.json({ data: { dashboard } });
}));

router.put('/', asyncHandler(async (req, res) => {
  const { dashboard } = req.body || {};
  if (dashboard === undefined || typeof dashboard !== 'object' || dashboard === null || Array.isArray(dashboard)) {
    throw badRequest('dashboard must be an object');
  }
  await db.query(
    `INSERT INTO user_preference (employee_no, dashboard_json) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE dashboard_json = VALUES(dashboard_json)`,
    [req.session.user.employeeNo, JSON.stringify(dashboard)]
  );
  res.json({ data: { dashboard } });
}));

module.exports = router;
