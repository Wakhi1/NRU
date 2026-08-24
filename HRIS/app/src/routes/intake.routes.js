const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireScope, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { feedSchema, resolveSchema } = require('../validators/intake.validators');

const router = express.Router();

router.get('/feeds', requireScope('intake', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT f.*, p.full_legal_name AS owner_name,
       (SELECT COUNT(*) FROM feed_record fr WHERE fr.feed_id = f.id AND fr.status != 'published') AS pending_count
     FROM feed f
     LEFT JOIN person p ON p.employee_no = f.owner_employee_no
     ORDER BY f.source_name`
  );
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/feeds', requireScope('intake', 'create'), asyncHandler(async (req, res) => {
  const parsed = feedSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid feed data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    'INSERT INTO feed (source_name, transport, cadence, owner_employee_no) VALUES (?, ?, ?, ?)',
    [d.source_name, d.transport, d.cadence || null, d.owner_employee_no || null]
  );
  await writeAudit(req, 'create', 'feed', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/feeds/:id', requireScope('intake', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM feed WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Feed not found');
  const parsed = feedSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid feed data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  // field_map is a JSON column — mysql2 doesn't auto-serialize plain objects for JSON columns,
  // so stringify it explicitly (every other field here is a scalar and passes through as-is).
  const values = fields.map((f) => (f === 'field_map' ? JSON.stringify(d[f]) : d[f]));
  await db.query(`UPDATE feed SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...values, req.params.id]);
  await writeAudit(req, 'update', 'feed', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM feed WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

// No real external system to pull from (this module is a documented simulation, see the
// Implementation documentation) — this only advances the timestamp so the UI can demonstrate
// a manual "run now" action without pretending to process data it doesn't have.
router.post('/feeds/:id/sync', requireScope('intake', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM feed WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Feed not found');
  await db.query('UPDATE feed SET last_run_at = NOW() WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'update', 'feed.sync', req.params.id, { last_run_at: before[0].last_run_at }, { last_run_at: 'now' });
  const after = await db.query('SELECT last_run_at FROM feed WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/feeds/:id', requireScope('intake', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM feed WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Feed not found');
  await db.query('DELETE FROM feed WHERE id = ?', [req.params.id]); // feed_record cascades
  await writeAudit(req, 'delete', 'feed', req.params.id, before[0], null);
  res.json({ ok: true });
}));

router.get('/feeds/:id/records', requireScope('intake', 'read'), asyncHandler(async (req, res) => {
  const feed = await db.query('SELECT id FROM feed WHERE id = ?', [req.params.id]);
  if (!feed[0]) throw notFound('Feed not found');

  let sql = 'SELECT fr.*, p.full_legal_name AS resolved_by_name FROM feed_record fr LEFT JOIN person p ON p.employee_no = fr.resolved_by_employee_no WHERE fr.feed_id = ?';
  const params = [req.params.id];
  if (req.query.status) { sql += ' AND fr.status = ?'; params.push(req.query.status); }
  sql += ' ORDER BY fr.created_at DESC';

  const rows = await db.query(sql, params);
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.put('/records/:id/resolve', requireScope('intake', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM feed_record WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Record not found');

  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid resolution data', parsed.error.flatten());
  const d = parsed.data;

  await db.query(
    'UPDATE feed_record SET status = ?, reason = ?, resolved_by_employee_no = ? WHERE id = ?',
    [d.status, d.reason || null, req.session.user.employeeNo, req.params.id]
  );
  const after = await db.query('SELECT * FROM feed_record WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'update', 'feed_record', req.params.id, before[0], after[0]);
  res.json({ data: after[0] });
}));

module.exports = router;
