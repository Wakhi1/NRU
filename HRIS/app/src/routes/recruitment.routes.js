const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireScope, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { requisitionSchema, candidateSchema, stageSchema, interviewSchema } = require('../validators/recruitment.validators');

const router = express.Router();

router.get('/requisitions', requireScope('recruitment', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT jr.*, ou.name AS department_name,
       (SELECT COUNT(*) FROM application a WHERE a.requisition_id = jr.id) AS applicant_count
     FROM job_requisition jr
     LEFT JOIN org_unit ou ON ou.id = jr.department_org_unit_id
     ORDER BY jr.opened_at DESC`
  );
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/requisitions', requireScope('recruitment', 'create'), asyncHandler(async (req, res) => {
  const parsed = requisitionSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid requisition data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    `INSERT INTO job_requisition (title, department_org_unit_id, grade, status, opened_by_employee_no, opened_at, headcount)
     VALUES (?, ?, ?, 'open', ?, CURDATE(), ?)`,
    [d.title, d.department_org_unit_id || null, d.grade || null, req.session.user.employeeNo, d.headcount]
  );
  await writeAudit(req, 'create', 'job_requisition', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/requisitions/:id', requireScope('recruitment', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM job_requisition WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Requisition not found');
  const parsed = requisitionSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid requisition data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE job_requisition SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'job_requisition', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM job_requisition WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/requisitions/:id', requireScope('recruitment', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM job_requisition WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Requisition not found');
  await db.query('DELETE FROM job_requisition WHERE id = ?', [req.params.id]); // application/interview cascade
  await writeAudit(req, 'delete', 'job_requisition', req.params.id, before[0], null);
  res.json({ ok: true });
}));

router.get('/requisitions/:id', requireScope('recruitment', 'read'), asyncHandler(async (req, res) => {
  const reqs = await db.query(
    `SELECT jr.*, ou.name AS department_name FROM job_requisition jr LEFT JOIN org_unit ou ON ou.id = jr.department_org_unit_id WHERE jr.id = ?`,
    [req.params.id]
  );
  if (!reqs[0]) throw notFound('Requisition not found');

  const applications = await db.query(
    `SELECT a.*, c.full_name, c.email, c.phone, c.source
     FROM application a JOIN candidate c ON c.id = a.candidate_id
     WHERE a.requisition_id = ? ORDER BY a.applied_at DESC`,
    [req.params.id]
  );
  const applicationIds = applications.map((a) => a.id);
  let interviews = [];
  if (applicationIds.length) {
    interviews = await db.query(
      `SELECT i.*, p.full_legal_name AS interviewer_name
       FROM interview i LEFT JOIN person p ON p.employee_no = i.interviewer_employee_no
       WHERE i.application_id IN (${applicationIds.map(() => '?').join(',')})`,
      applicationIds
    );
  }
  const applicationsWithInterviews = applications.map((a) => ({
    ...a,
    interviews: interviews.filter((i) => i.application_id === a.id),
  }));

  res.json({ data: { ...reqs[0], applications: applicationsWithInterviews }, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/requisitions/:id/applications', requireScope('recruitment', 'create'), asyncHandler(async (req, res) => {
  const requisition = await db.query('SELECT id FROM job_requisition WHERE id = ?', [req.params.id]);
  if (!requisition[0]) throw notFound('Requisition not found');

  let candidateId = req.body.candidate_id;
  if (!candidateId) {
    const parsed = candidateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid candidate data', parsed.error.flatten());
    const c = parsed.data;
    const result = await db.query(
      'INSERT INTO candidate (full_name, email, phone, source) VALUES (?, ?, ?, ?)',
      [c.full_name, c.email || null, c.phone || null, c.source || null]
    );
    candidateId = result.insertId;
    await writeAudit(req, 'create', 'candidate', candidateId, null, c);
  }

  const result = await db.query(
    `INSERT INTO application (requisition_id, candidate_id, stage, applied_at) VALUES (?, ?, 'applied', CURDATE())`,
    [req.params.id, candidateId]
  );
  await writeAudit(req, 'create', 'application', result.insertId, null, { requisition_id: req.params.id, candidate_id: candidateId });
  res.status(201).json({ data: { id: result.insertId, candidate_id: candidateId } });
}));

router.put('/applications/:id/stage', requireScope('recruitment', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM application WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Application not found');
  const parsed = stageSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid stage', parsed.error.flatten());
  await db.query('UPDATE application SET stage = ? WHERE id = ?', [parsed.data.stage, req.params.id]);
  await writeAudit(req, 'update', 'application', req.params.id, before[0], parsed.data);
  res.json({ data: { id: Number(req.params.id), stage: parsed.data.stage } });
}));

router.post('/applications/:id/interviews', requireScope('recruitment', 'update'), asyncHandler(async (req, res) => {
  const application = await db.query('SELECT id FROM application WHERE id = ?', [req.params.id]);
  if (!application[0]) throw notFound('Application not found');
  const parsed = interviewSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid interview data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    `INSERT INTO interview (application_id, interviewer_employee_no, scheduled_at, outcome, notes)
     VALUES (?, ?, ?, 'pending', ?)`,
    [req.params.id, d.interviewer_employee_no || null, d.scheduled_at, d.notes || null]
  );
  await writeAudit(req, 'create', 'interview', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/interviews/:id', requireScope('recruitment', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM interview WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Interview not found');
  const outcome = req.body.outcome;
  if (!['pending', 'pass', 'fail'].includes(outcome)) throw badRequest('Invalid outcome');
  await db.query('UPDATE interview SET outcome = ?, notes = ? WHERE id = ?', [outcome, req.body.notes || before[0].notes, req.params.id]);
  await writeAudit(req, 'update', 'interview', req.params.id, before[0], req.body);
  res.json({ data: { id: Number(req.params.id), outcome } });
}));

router.put('/candidates/:id', requireScope('recruitment', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM candidate WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Candidate not found');
  const parsed = candidateSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid candidate data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE candidate SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'candidate', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM candidate WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/candidates/:id', requireScope('recruitment', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM candidate WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Candidate not found');
  await db.query('DELETE FROM candidate WHERE id = ?', [req.params.id]); // application/interview cascade
  await writeAudit(req, 'delete', 'candidate', req.params.id, before[0], null);
  res.json({ ok: true });
}));

module.exports = router;
