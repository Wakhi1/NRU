const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, forbidden, notFound } = require('../platform/errors');
const { requireScope, scopeFilterSql, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { cycleSchema, reviewCreateSchema, selfRatingSchema, managerRatingSchema } = require('../validators/performance.validators');

const router = express.Router();

router.get('/cycles', requireScope('performance', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM review_cycle ORDER BY start_date DESC');
  res.json({ data: rows });
}));

router.post('/cycles', requireScope('performance', 'create'), asyncHandler(async (req, res) => {
  const parsed = cycleSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid review cycle data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    `INSERT INTO review_cycle (name, period, status, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
    [d.name, d.period, d.status || 'open', d.start_date || null, d.end_date || null]
  );
  await writeAudit(req, 'create', 'review_cycle', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/cycles/:id', requireScope('performance', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM review_cycle WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Review cycle not found');
  const parsed = cycleSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid review cycle data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE review_cycle SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'review_cycle', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM review_cycle WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/cycles/:id', requireScope('performance', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM review_cycle WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Review cycle not found');
  await db.query('DELETE FROM review_cycle WHERE id = ?', [req.params.id]); // performance_review cascades
  await writeAudit(req, 'delete', 'review_cycle', req.params.id, before[0], null);
  res.json({ ok: true });
}));

router.post('/reviews', requireScope('performance', 'create'), asyncHandler(async (req, res) => {
  const parsed = reviewCreateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid review data', parsed.error.flatten());
  const d = parsed.data;
  const cycle = await db.query('SELECT id FROM review_cycle WHERE id = ?', [d.cycle_id]);
  if (!cycle[0]) throw notFound('Review cycle not found');
  const person = await db.query('SELECT employee_no FROM person WHERE employee_no = ?', [d.employee_no]);
  if (!person[0]) throw notFound('Person not found');

  const result = await db.query(
    `INSERT INTO performance_review (cycle_id, employee_no, reviewer_employee_no, status) VALUES (?, ?, ?, 'not_started')`,
    [d.cycle_id, d.employee_no, d.reviewer_employee_no || null]
  );
  await writeAudit(req, 'create', 'performance_review', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.get('/reviews', requireScope('performance', 'read'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'pr.employee_no');
  let sql = `SELECT pr.*, p.full_legal_name, r.full_legal_name AS reviewer_name
             FROM performance_review pr
             JOIN person p ON p.employee_no = pr.employee_no
             LEFT JOIN person r ON r.employee_no = pr.reviewer_employee_no
             WHERE ${filter.clause}`;
  const params = [...filter.params];
  if (req.query.cycle_id) { sql += ' AND pr.cycle_id = ?'; params.push(req.query.cycle_id); }
  if (req.query.employee_no) { sql += ' AND pr.employee_no = ?'; params.push(req.query.employee_no); }
  sql += ' ORDER BY pr.id DESC';

  const rows = await db.query(sql, params);
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.put('/reviews/:id/self', requireScope('performance', 'update'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM performance_review WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Review not found');
  const review = rows[0];
  if (review.employee_no !== req.session.user.employeeNo) throw forbidden('Only the reviewee can submit their own self-rating');

  const parsed = selfRatingSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid self-rating', parsed.error.flatten());
  const d = parsed.data;

  const nextStatus = review.status === 'not_started' ? 'self_submitted' : review.status;
  await db.query('UPDATE performance_review SET self_rating = ?, status = ? WHERE id = ?', [d.self_rating, nextStatus, req.params.id]);
  await writeAudit(req, 'update', 'performance_review', req.params.id, review, d);

  const after = await db.query('SELECT * FROM performance_review WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.put('/reviews/:id/manager', requireScope('performance', 'update'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM performance_review WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Review not found');
  const review = rows[0];
  if (review.reviewer_employee_no !== req.session.user.employeeNo) throw forbidden('Only the assigned reviewer can submit the manager rating');

  const parsed = managerRatingSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid manager rating', parsed.error.flatten());
  const d = parsed.data;

  await db.query('UPDATE performance_review SET manager_rating = ?, comments = ?, status = ? WHERE id = ?', [d.manager_rating, d.comments || null, d.status, req.params.id]);
  await writeAudit(req, 'update', 'performance_review', req.params.id, review, d);

  const after = await db.query('SELECT * FROM performance_review WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

module.exports = router;
