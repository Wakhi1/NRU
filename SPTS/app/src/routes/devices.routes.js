const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, conflict } = require('../platform/errors');
const { requireAuth, requirePermission } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { deviceSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth, requirePermission('device.manage'));

router.get('/', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT d.*, e.full_legal_name AS assigned_name
     FROM device d LEFT JOIN employee_cache e ON e.employee_no = d.assigned_employee_no
     ORDER BY d.asset_tag`
  );
  res.json({ data: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = deviceSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid device data', parsed.error.flatten());
  const d = parsed.data;
  try {
    const result = await db.query(
      `INSERT INTO device (asset_tag, imei, serial, hw_model, os_version, kind, assigned_employee_no, status)
       VALUES (?,?,?,?,?,?,?, 'offline')`,
      [d.asset_tag, d.imei || null, d.serial || null, d.hw_model || null, d.os_version || null, d.kind, d.assigned_employee_no || null]
    );
    await writeAudit(req, 'create', 'device', result.insertId, null, d);
    res.status(201).json({ data: { id: result.insertId } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw conflict('That asset tag or IMEI is already registered');
    throw e;
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM device WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Device not found');
  const parsed = deviceSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid device data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (fields.length === 0) return res.json({ data: before[0] });
  await db.query(`UPDATE device SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'device', req.params.id, before[0], d);
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM device WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Device not found');
  await db.query('DELETE FROM device WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'device', req.params.id, before[0], null);
  res.json({ ok: true });
}));

module.exports = router;
