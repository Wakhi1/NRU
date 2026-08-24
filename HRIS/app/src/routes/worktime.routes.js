// Shift pattern administration. The daily clock-in/out grid lives in attendance.routes.js —
// separate module because the permission matrix scopes them independently (a Head of
// Department can see their team's attendance without being able to redefine shift rules).
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireScope, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { shiftPatternSchema } = require('../validators/worktime.validators');

const router = express.Router();

router.get('/', requireScope('worktime', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM shift_pattern ORDER BY name');
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/', requireScope('worktime', 'create'), asyncHandler(async (req, res) => {
  const parsed = shiftPatternSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid shift pattern data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    `INSERT INTO shift_pattern (name, pattern, contracted_hours, break_rule, grace_minutes, overtime_rule, rounding_rule, auto_clock_out, capture_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.name, d.pattern, d.contracted_hours, d.break_rule || null, d.grace_minutes, d.overtime_rule || null,
      d.rounding_rule || null, d.auto_clock_out ? 1 : 0, d.capture_source]
  );
  await writeAudit(req, 'create', 'shift_pattern', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/:id', requireScope('worktime', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM shift_pattern WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Shift pattern not found');
  const parsed = shiftPatternSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid shift pattern data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE shift_pattern SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'shift_pattern', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM shift_pattern WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/:id', requireScope('worktime', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM shift_pattern WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Shift pattern not found');
  await db.query('DELETE FROM shift_pattern WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'shift_pattern', req.params.id, before[0], null);
  res.json({ ok: true });
}));

module.exports = router;
