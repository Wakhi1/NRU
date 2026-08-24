const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireScope, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { planSchema, successorSchema } = require('../validators/succession.validators');

const router = express.Router();

router.get('/', requireScope('succession', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT sp.*, p.full_legal_name AS incumbent_name, ou.name AS org_unit_name,
       (SELECT COUNT(*) FROM successor_candidate sc WHERE sc.succession_plan_id = sp.id) AS successor_count
     FROM succession_plan sp
     LEFT JOIN person p ON p.employee_no = sp.incumbent_employee_no
     LEFT JOIN org_unit ou ON ou.id = sp.org_unit_id
     ORDER BY FIELD(sp.risk, 'high', 'medium', 'low'), sp.position_title`
  );
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/:id', requireScope('succession', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT sp.*, p.full_legal_name AS incumbent_name, ou.name AS org_unit_name
     FROM succession_plan sp
     LEFT JOIN person p ON p.employee_no = sp.incumbent_employee_no
     LEFT JOIN org_unit ou ON ou.id = sp.org_unit_id
     WHERE sp.id = ?`,
    [req.params.id]
  );
  if (!rows[0]) throw notFound('Succession plan not found');

  const successors = await db.query(
    `SELECT sc.*, p.full_legal_name FROM successor_candidate sc JOIN person p ON p.employee_no = sc.employee_no WHERE sc.succession_plan_id = ?`,
    [req.params.id]
  );
  res.json({ data: { ...rows[0], successors }, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/', requireScope('succession', 'create'), asyncHandler(async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid succession plan data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    'INSERT INTO succession_plan (position_title, org_unit_id, incumbent_employee_no, risk, note) VALUES (?, ?, ?, ?, ?)',
    [d.position_title, d.org_unit_id || null, d.incumbent_employee_no || null, d.risk, d.note || null]
  );
  await writeAudit(req, 'create', 'succession_plan', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/:id', requireScope('succession', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM succession_plan WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Succession plan not found');
  const parsed = planSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid succession plan data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE succession_plan SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'succession_plan', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM succession_plan WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/:id', requireScope('succession', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM succession_plan WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Succession plan not found');
  await db.query('DELETE FROM succession_plan WHERE id = ?', [req.params.id]); // successor_candidate cascades
  await writeAudit(req, 'delete', 'succession_plan', req.params.id, before[0], null);
  res.json({ ok: true });
}));

router.post('/:id/successors', requireScope('succession', 'update'), asyncHandler(async (req, res) => {
  const plan = await db.query('SELECT id FROM succession_plan WHERE id = ?', [req.params.id]);
  if (!plan[0]) throw notFound('Succession plan not found');
  const parsed = successorSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid successor data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query('INSERT INTO successor_candidate (succession_plan_id, employee_no, readiness) VALUES (?, ?, ?)', [req.params.id, d.employee_no, d.readiness]);
  await writeAudit(req, 'create', 'successor_candidate', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/:id/successors/:successorId', requireScope('succession', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM successor_candidate WHERE id = ? AND succession_plan_id = ?', [req.params.successorId, req.params.id]);
  if (!before[0]) throw notFound('Successor not found on this plan');
  const parsed = successorSchema.pick({ readiness: true }).safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid readiness', parsed.error.flatten());
  await db.query('UPDATE successor_candidate SET readiness = ? WHERE id = ?', [parsed.data.readiness, req.params.successorId]);
  await writeAudit(req, 'update', 'successor_candidate', req.params.successorId, before[0], parsed.data);
  res.json({ ok: true });
}));

router.delete('/:id/successors/:successorId', requireScope('succession', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM successor_candidate WHERE id = ? AND succession_plan_id = ?', [req.params.successorId, req.params.id]);
  if (!before[0]) throw notFound('Successor not found on this plan');
  await db.query('DELETE FROM successor_candidate WHERE id = ?', [req.params.successorId]);
  await writeAudit(req, 'delete', 'successor_candidate', req.params.successorId, before[0], null);
  res.json({ ok: true });
}));

module.exports = router;
