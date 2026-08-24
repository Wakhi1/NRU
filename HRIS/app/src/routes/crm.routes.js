const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireScope, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { partnerSchema, programmeSchema, indicatorSchema } = require('../validators/crm.validators');

const router = express.Router();

router.get('/partners', requireScope('crm', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM partner_org ORDER BY name');
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/partners', requireScope('crm', 'create'), asyncHandler(async (req, res) => {
  const parsed = partnerSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid partner data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    'INSERT INTO partner_org (name, type, contact_name, contact_phone, agreement, status, since_year) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [d.name, d.type || null, d.contact_name || null, d.contact_phone || null, d.agreement || null, d.status || 'active', d.since_year || null]
  );
  await writeAudit(req, 'create', 'partner_org', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/partners/:id', requireScope('crm', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM partner_org WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Partner not found');
  const parsed = partnerSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid partner data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE partner_org SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'partner_org', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM partner_org WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/partners/:id', requireScope('crm', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM partner_org WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Partner not found');
  await db.query('DELETE FROM partner_org WHERE id = ?', [req.params.id]); // programme_partner cascades, indicator_record.partner_org_id -> NULL
  await writeAudit(req, 'delete', 'partner_org', req.params.id, before[0], null);
  res.json({ ok: true });
}));

router.get('/programmes', requireScope('crm', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT pr.*, person.full_legal_name AS lead_name,
       GROUP_CONCAT(DISTINCT po.name ORDER BY po.name SEPARATOR ', ') AS partner_names,
       (SELECT COUNT(*) FROM indicator_record ir WHERE ir.programme_id = pr.id) AS indicator_count
     FROM programme pr
     LEFT JOIN person ON person.employee_no = pr.lead_employee_no
     LEFT JOIN programme_partner pp ON pp.programme_id = pr.id
     LEFT JOIN partner_org po ON po.id = pp.partner_org_id
     GROUP BY pr.id
     ORDER BY pr.name`
  );
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/programmes/:id', requireScope('crm', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT pr.*, person.full_legal_name AS lead_name FROM programme pr LEFT JOIN person ON person.employee_no = pr.lead_employee_no WHERE pr.id = ?`,
    [req.params.id]
  );
  if (!rows[0]) throw notFound('Programme not found');

  const partners = await db.query(
    `SELECT po.* FROM programme_partner pp JOIN partner_org po ON po.id = pp.partner_org_id WHERE pp.programme_id = ? ORDER BY po.name`,
    [req.params.id]
  );
  const indicators = await db.query(
    `SELECT ir.*, po.name AS partner_name, p.full_legal_name AS collected_by_name
     FROM indicator_record ir
     LEFT JOIN partner_org po ON po.id = ir.partner_org_id
     LEFT JOIN person p ON p.employee_no = ir.collected_by_employee_no
     WHERE ir.programme_id = ? ORDER BY ir.created_at DESC`,
    [req.params.id]
  );

  res.json({ data: { ...rows[0], partners, indicators }, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/programmes', requireScope('crm', 'create'), asyncHandler(async (req, res) => {
  const parsed = programmeSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid programme data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    'INSERT INTO programme (name, lead_employee_no, status, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
    [d.name, d.lead_employee_no || null, d.status || 'Active', d.start_date || null, d.end_date || null]
  );
  await writeAudit(req, 'create', 'programme', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/programmes/:id', requireScope('crm', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM programme WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Programme not found');
  const parsed = programmeSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid programme data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE programme SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'programme', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM programme WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/programmes/:id', requireScope('crm', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM programme WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Programme not found');
  await db.query('DELETE FROM programme WHERE id = ?', [req.params.id]); // programme_partner + indicator_record cascade
  await writeAudit(req, 'delete', 'programme', req.params.id, before[0], null);
  res.json({ ok: true });
}));

router.put('/indicators/:id', requireScope('crm', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM indicator_record WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Indicator not found');
  const parsed = indicatorSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid indicator data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE indicator_record SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'indicator_record', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM indicator_record WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/indicators/:id', requireScope('crm', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM indicator_record WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Indicator not found');
  await db.query('DELETE FROM indicator_record WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'indicator_record', req.params.id, before[0], null);
  res.json({ ok: true });
}));

router.post('/programmes/:id/partners', requireScope('crm', 'update'), asyncHandler(async (req, res) => {
  const partnerOrgId = Number(req.body.partner_org_id);
  if (!partnerOrgId) throw badRequest('partner_org_id is required');
  const programme = await db.query('SELECT id FROM programme WHERE id = ?', [req.params.id]);
  if (!programme[0]) throw notFound('Programme not found');
  await db.query('INSERT IGNORE INTO programme_partner (programme_id, partner_org_id) VALUES (?, ?)', [req.params.id, partnerOrgId]);
  await writeAudit(req, 'create', 'programme_partner', `${req.params.id}:${partnerOrgId}`, null, { partnerOrgId });
  res.status(201).json({ ok: true });
}));

router.post('/programmes/:id/indicators', requireScope('crm', 'create'), asyncHandler(async (req, res) => {
  const programme = await db.query('SELECT id FROM programme WHERE id = ?', [req.params.id]);
  if (!programme[0]) throw notFound('Programme not found');
  const parsed = indicatorSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid indicator data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    `INSERT INTO indicator_record (programme_id, partner_org_id, indicator_name, period, value, source_feed, collected_by_employee_no)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.params.id, d.partner_org_id || null, d.indicator_name, d.period, d.value, d.source_feed || null, req.session.user.employeeNo]
  );
  await writeAudit(req, 'create', 'indicator_record', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

module.exports = router;
