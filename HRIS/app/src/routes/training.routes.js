const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireScope, scopeFilterSql, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { courseSchema, enrollmentSchema, enrollmentStatusSchema, certificationSchema } = require('../validators/training.validators');

const router = express.Router();

router.get('/courses', requireScope('training', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM training_course ORDER BY name');
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/courses', requireScope('training', 'create'), asyncHandler(async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid course data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    'INSERT INTO training_course (name, provider, category, is_certification, validity_months) VALUES (?, ?, ?, ?, ?)',
    [d.name, d.provider || null, d.category || null, d.is_certification ? 1 : 0, d.validity_months || null]
  );
  await writeAudit(req, 'create', 'training_course', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/courses/:id', requireScope('training', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM training_course WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Course not found');
  const parsed = courseSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid course data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  const values = fields.map((f) => (f === 'is_certification' ? (d[f] ? 1 : 0) : d[f]));
  await db.query(`UPDATE training_course SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...values, req.params.id]);
  await writeAudit(req, 'update', 'training_course', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM training_course WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/courses/:id', requireScope('training', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM training_course WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Course not found');
  await db.query('DELETE FROM training_course WHERE id = ?', [req.params.id]); // training_enrollment cascades
  await writeAudit(req, 'delete', 'training_course', req.params.id, before[0], null);
  res.json({ ok: true });
}));

// Roster for ONE course across everyone (not just the caller's own enrollments) — needed for
// the "assign mandatory learning / track completion" management view, which is inherently an
// org-wide view of a course rather than a person-scoped one. Gated on organisation/department
// scope so a self-scoped Employee can't enumerate everyone's enrollment status.
router.get('/courses/:id/enrollments', requireScope('training', 'read'), asyncHandler(async (req, res) => {
  if (req.scope.dataScope === 'self') throw badRequest('Course-wide enrollment rosters require department or organisation scope');
  const rows = await db.query(
    `SELECT te.*, p.full_legal_name FROM training_enrollment te JOIN person p ON p.employee_no = te.employee_no
     WHERE te.course_id = ? ORDER BY p.full_legal_name`,
    [req.params.id]
  );
  res.json({ data: rows });
}));

function resolveEmployeeNo(req, requested) {
  if (req.scope.dataScope === 'self') return req.session.user.employeeNo;
  return requested || req.session.user.employeeNo;
}

router.get('/enrollments', requireScope('training', 'read'), asyncHandler(async (req, res) => {
  const employeeNo = resolveEmployeeNo(req, req.query.employee_no);
  const filter = await scopeFilterSql(req.scope, req.session.user, 'te.employee_no');
  const rows = await db.query(
    `SELECT te.*, tc.name AS course_name, tc.category
     FROM training_enrollment te
     JOIN training_course tc ON tc.id = te.course_id
     WHERE te.employee_no = ? AND ${filter.clause}
     ORDER BY te.id DESC`,
    [employeeNo, ...filter.params]
  );
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/enrollments', requireScope('training', 'create'), asyncHandler(async (req, res) => {
  const parsed = enrollmentSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid enrollment data', parsed.error.flatten());
  const d = parsed.data;
  const employeeNo = resolveEmployeeNo(req, d.employee_no);
  const result = await db.query('INSERT INTO training_enrollment (employee_no, course_id, status) VALUES (?, ?, \'enrolled\')', [employeeNo, d.course_id]);
  await writeAudit(req, 'create', 'training_enrollment', result.insertId, null, { employee_no: employeeNo, course_id: d.course_id });
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/enrollments/:id', requireScope('training', 'update'), asyncHandler(async (req, res) => {
  const parsed = enrollmentStatusSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid enrollment status', parsed.error.flatten());
  const d = parsed.data;
  const before = await db.query('SELECT * FROM training_enrollment WHERE id = ?', [req.params.id]);
  await db.query('UPDATE training_enrollment SET status = ?, completed_at = ? WHERE id = ?', [d.status, d.completed_at || null, req.params.id]);
  await writeAudit(req, 'update', 'training_enrollment', req.params.id, before[0] || null, d);
  res.json({ ok: true });
}));

router.get('/certifications', requireScope('training', 'read'), asyncHandler(async (req, res) => {
  const employeeNo = resolveEmployeeNo(req, req.query.employee_no);
  const filter = await scopeFilterSql(req.scope, req.session.user, 'employee_no');
  const rows = await db.query(
    `SELECT * FROM certification WHERE employee_no = ? AND ${filter.clause} ORDER BY expires_at IS NULL, expires_at ASC`,
    [employeeNo, ...filter.params]
  );
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/certifications', requireScope('training', 'create'), asyncHandler(async (req, res) => {
  const parsed = certificationSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid certification data', parsed.error.flatten());
  const d = parsed.data;
  const employeeNo = resolveEmployeeNo(req, d.employee_no);
  const result = await db.query(
    'INSERT INTO certification (employee_no, name, issued_at, expires_at, issuing_body) VALUES (?, ?, ?, ?, ?)',
    [employeeNo, d.name, d.issued_at || null, d.expires_at || null, d.issuing_body || null]
  );
  await writeAudit(req, 'create', 'certification', result.insertId, null, { ...d, employee_no: employeeNo });
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/certifications/:id', requireScope('training', 'update'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'employee_no');
  const before = await db.query(`SELECT * FROM certification WHERE id = ? AND ${filter.clause}`, [req.params.id, ...filter.params]);
  if (!before[0]) throw notFound('Certification not found or out of scope');
  const parsed = certificationSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid certification data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d).filter((k) => k !== 'employee_no');
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE certification SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'certification', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM certification WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/certifications/:id', requireScope('training', 'delete'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'employee_no');
  const before = await db.query(`SELECT * FROM certification WHERE id = ? AND ${filter.clause}`, [req.params.id, ...filter.params]);
  if (!before[0]) throw notFound('Certification not found or out of scope');
  await db.query('DELETE FROM certification WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'certification', req.params.id, before[0], null);
  res.json({ ok: true });
}));

module.exports = router;
