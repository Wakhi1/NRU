const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireRole } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { notificationToggleSchema, appSettingsSchema } = require('../validators/settings.validators');

const router = express.Router();
const ADMIN_ROLES = ['System administrator', 'HR administrator'];

router.get('/notifications', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM notification_setting ORDER BY id');
  res.json({ data: rows });
}));

router.put('/notifications/:id', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const parsed = notificationToggleSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid notification setting data', parsed.error.flatten());

  const before = await db.query('SELECT * FROM notification_setting WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Notification setting not found');

  await db.query('UPDATE notification_setting SET is_enabled = ? WHERE id = ?', [parsed.data.is_enabled, req.params.id]);
  await writeAudit(req, 'update', 'notification_setting', req.params.id, before[0], parsed.data);
  res.json({ ok: true });
}));

router.get('/app', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT setting_key, setting_value FROM app_setting');
  const data = {};
  for (const row of rows) data[row.setting_key] = row.setting_value;
  res.json({ data });
}));

router.put('/app', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const parsed = appSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid settings data', parsed.error.flatten());

  for (const [key, value] of Object.entries(parsed.data.settings)) {
    await db.query(
      `INSERT INTO app_setting (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, value]
    );
  }
  await writeAudit(req, 'update', 'app_setting', 'bulk', null, parsed.data.settings);
  res.json({ ok: true });
}));

module.exports = router;
