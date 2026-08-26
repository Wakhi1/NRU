// Geofence & alert management (architecture doc §6) — `geofence.manage` gated to System
// administrator, same as live location.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, conflict } = require('../platform/errors');
const { requireAuth, requirePermission } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { zoneSchema, zoneAssignSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth, requirePermission('geofence.manage'));

router.get('/', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT z.*,
       (SELECT COUNT(*) FROM zone_assignment za WHERE za.zone_id = z.id) AS assigned_count,
       (SELECT COUNT(*) FROM alert a WHERE a.zone_id = z.id AND a.resolved = 0) AS open_alerts
     FROM zone z ORDER BY z.name`
  );
  res.json({ data: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = zoneSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid zone data', parsed.error.flatten());
  const d = parsed.data;
  try {
    const result = await db.query(
      `INSERT INTO zone (code, name, kind, center_lat, center_lng, radius_m, rule_type, dwell_minutes, team_label, active)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [d.code, d.name, d.kind, d.center_lat, d.center_lng, d.radius_m, d.rule_type, d.dwell_minutes || null, d.team_label || null, d.active === false ? 0 : 1]
    );
    await writeAudit(req, 'create', 'zone', result.insertId, null, d);
    res.status(201).json({ data: { id: result.insertId } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw conflict(`Zone code "${d.code}" is already in use`);
    throw e;
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM zone WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Zone not found');
  const parsed = zoneSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid zone data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (fields.length === 0) return res.json({ data: before[0] });
  await db.query(`UPDATE zone SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'zone', req.params.id, before[0], d);
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM zone WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Zone not found');
  await db.query('DELETE FROM zone WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'zone', req.params.id, before[0], null);
  res.json({ ok: true });
}));

router.get('/:id/assignments', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT za.id, za.employee_no, e.full_legal_name, za.device_id, d.asset_tag
     FROM zone_assignment za
     LEFT JOIN employee_cache e ON e.employee_no = za.employee_no
     LEFT JOIN device d ON d.id = za.device_id
     WHERE za.zone_id = ?`,
    [req.params.id]
  );
  res.json({ data: rows });
}));

router.post('/:id/assignments', asyncHandler(async (req, res) => {
  const zone = await db.query('SELECT id FROM zone WHERE id = ?', [req.params.id]);
  if (!zone[0]) throw notFound('Zone not found');
  const parsed = zoneAssignSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid assignment', parsed.error.flatten());
  const { employee_no, device_id } = parsed.data;
  if (!employee_no && !device_id) throw badRequest('Provide an employee or a device to assign');
  const result = await db.query(
    `INSERT INTO zone_assignment (zone_id, employee_no, device_id) VALUES (?,?,?)`,
    [req.params.id, employee_no || null, device_id || null]
  );
  await writeAudit(req, 'assign', 'zone_assignment', result.insertId, null, { zone_id: req.params.id, employee_no, device_id });
  res.status(201).json({ data: { id: result.insertId } });
}));

router.delete('/assignments/:assignmentId', asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM zone_assignment WHERE id = ?', [req.params.assignmentId]);
  if (!before[0]) throw notFound('Assignment not found');
  await db.query('DELETE FROM zone_assignment WHERE id = ?', [req.params.assignmentId]);
  await writeAudit(req, 'unassign', 'zone_assignment', req.params.assignmentId, before[0], null);
  res.json({ ok: true });
}));

router.get('/alerts/list', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT a.*, e.full_legal_name, z.name AS zone_name, d.asset_tag
     FROM alert a
     LEFT JOIN employee_cache e ON e.employee_no = a.employee_no
     LEFT JOIN zone z ON z.id = a.zone_id
     LEFT JOIN device d ON d.id = a.device_id
     ORDER BY a.resolved ASC, a.created_at DESC LIMIT 200`
  );
  res.json({ data: rows });
}));

router.post('/alerts/:id/resolve', asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM alert WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Alert not found');
  await db.query('UPDATE alert SET resolved = 1 WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'resolve', 'alert', req.params.id, before[0], { resolved: 1 });
  res.json({ ok: true });
}));

module.exports = router;
