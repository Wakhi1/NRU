// Asset & interest declarations — an integrity/compliance feature: staff declare personal
// assets, financial interests, gifts and outside employment. Declarants own their draft rows
// (they may edit/delete only while status='draft'); organisation-scoped reviewers (HR, System
// administrator) may only move status forward (submitted -> reviewed/flagged) with a note —
// they never rewrite what someone declared, since that would defeat the point of the feature.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, forbidden, conflict } = require('../platform/errors');
const { requireScope, scopeFilterSql, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { declarationSchema, reviewSchema } = require('../validators/assets.validators');

const router = express.Router();

router.get('/', requireScope('assets', 'read'), asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = await scopeFilterSql(req.scope, req.session.user, 'a.employee_no');
  let sql = `SELECT a.*, p.full_legal_name, r.full_legal_name AS reviewer_name
             FROM asset_declaration a
             JOIN person p ON p.employee_no = a.employee_no
             LEFT JOIN person r ON r.employee_no = a.reviewed_by_employee_no
             WHERE ${filter.clause}`;
  const params = [...filter.params];
  if (status) { sql += ' AND a.status = ?'; params.push(status); }
  sql += ' ORDER BY a.declared_at DESC, a.id DESC';

  const rows = await db.query(sql, params);
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/', requireScope('assets', 'create'), asyncHandler(async (req, res) => {
  const parsed = declarationSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid declaration data', parsed.error.flatten());
  const d = parsed.data;

  const employeeNo = req.scope.dataScope === 'self' ? req.session.user.employeeNo : (d.employee_no || req.session.user.employeeNo);
  const result = await db.query(
    `INSERT INTO asset_declaration (employee_no, category, description, estimated_value, currency, acquired_at, declared_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
    [employeeNo, d.category, d.description, d.estimated_value ?? null, d.currency || 'SZL', d.acquired_at || null, d.declared_at]
  );
  await writeAudit(req, 'create', 'asset_declaration', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/:id', requireScope('assets', 'update'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM asset_declaration WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Declaration not found');
  const before = rows[0];
  const isOwner = before.employee_no === req.session.user.employeeNo;

  if (isOwner) {
    if (before.status !== 'draft') throw conflict('Only a draft declaration can be edited — it has already been submitted.');
    const parsed = declarationSchema.partial().safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid declaration data', parsed.error.flatten());
    const d = parsed.data;
    const fields = Object.keys(d).filter((k) => k !== 'employee_no');
    if (fields.length) {
      await db.query(`UPDATE asset_declaration SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
    }
  } else {
    if (req.scope.dataScope === 'self') throw forbidden('You may only edit your own declarations');
    if (before.status !== 'submitted') throw conflict('Only a submitted declaration can be reviewed');
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid review data', parsed.error.flatten());
    const d = parsed.data;
    await db.query(
      'UPDATE asset_declaration SET status = ?, review_note = ?, reviewed_by_employee_no = ?, reviewed_at = NOW() WHERE id = ?',
      [d.status, d.review_note || null, req.session.user.employeeNo, req.params.id]
    );
  }

  await writeAudit(req, 'update', 'asset_declaration', req.params.id, before, req.body);
  const after = await db.query('SELECT * FROM asset_declaration WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.post('/:id/submit', requireScope('assets', 'update'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM asset_declaration WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Declaration not found');
  if (rows[0].employee_no !== req.session.user.employeeNo) throw forbidden('You may only submit your own declarations');
  if (rows[0].status !== 'draft') throw conflict('Already submitted');

  await db.query(`UPDATE asset_declaration SET status = 'submitted' WHERE id = ?`, [req.params.id]);
  await writeAudit(req, 'update', 'asset_declaration', req.params.id, rows[0], { status: 'submitted' });
  res.json({ data: { status: 'submitted' } });
}));

router.delete('/:id', requireScope('assets', 'delete'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM asset_declaration WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Declaration not found');
  const isOwner = rows[0].employee_no === req.session.user.employeeNo;
  if (isOwner && rows[0].status !== 'draft') throw conflict('Only a draft declaration can be deleted — it has already been submitted.');
  if (!isOwner && req.scope.dataScope === 'self') throw forbidden('You may only delete your own declarations');

  await db.query('DELETE FROM asset_declaration WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'asset_declaration', req.params.id, rows[0], null);
  res.json({ ok: true });
}));

module.exports = router;
