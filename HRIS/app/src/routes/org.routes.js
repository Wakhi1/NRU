const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireScope, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { orgUnitSchema, membershipSchema } = require('../validators/org.validators');

const router = express.Router();

router.get('/', requireScope('org', 'read'), asyncHandler(async (req, res) => {
  const units = await db.query(
    `SELECT ou.*, p.full_legal_name AS lead_name, parent.name AS parent_name,
       (SELECT COUNT(*) FROM membership m WHERE m.org_unit_id = ou.id AND (m.to_date IS NULL OR m.to_date >= CURDATE())) AS member_count
     FROM org_unit ou
     LEFT JOIN person p ON p.employee_no = ou.lead_employee_no
     LEFT JOIN org_unit parent ON parent.id = ou.parent_id
     ORDER BY ou.kind, ou.name`
  );
  res.json({ data: units, meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/:id', requireScope('org', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT ou.*, p.full_legal_name AS lead_name FROM org_unit ou LEFT JOIN person p ON p.employee_no = ou.lead_employee_no WHERE ou.id = ?`,
    [req.params.id]
  );
  if (!rows[0]) throw notFound('Org unit not found');

  const members = await db.query(
    `SELECT m.id, m.employee_no, m.role_in_unit, m.from_date, m.to_date, p.full_legal_name, p.status
     FROM membership m JOIN person p ON p.employee_no = m.employee_no
     WHERE m.org_unit_id = ? ORDER BY m.from_date DESC`,
    [req.params.id]
  );
  const children = await db.query('SELECT id, name, kind FROM org_unit WHERE parent_id = ?', [req.params.id]);

  res.json({ data: { ...rows[0], members, children }, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/', requireScope('org', 'create'), asyncHandler(async (req, res) => {
  const parsed = orgUnitSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid org unit data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    'INSERT INTO org_unit (kind, name, lead_employee_no, parent_id, cost_centre, duty_station, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [d.kind, d.name, d.lead_employee_no || null, d.parent_id || null, d.cost_centre || null, d.duty_station || null, d.note || null]
  );
  await writeAudit(req, 'create', 'org_unit', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/:id', requireScope('org', 'update'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM org_unit WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Org unit not found');
  const parsed = orgUnitSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid org unit data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  await db.query(`UPDATE org_unit SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  await writeAudit(req, 'update', 'org_unit', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM org_unit WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/:id', requireScope('org', 'delete'), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM org_unit WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Org unit not found');
  // Every FK referencing org_unit.id uses ON DELETE SET NULL (employment, job_requisition,
  // succession_plan) or CASCADE (membership, child org_unit via parent_id) — safe to hard delete.
  await db.query('DELETE FROM org_unit WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'org_unit', req.params.id, before[0], null);
  res.json({ ok: true });
}));

router.post('/:id/members', requireScope('org', 'update'), asyncHandler(async (req, res) => {
  const parsed = membershipSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid membership data', parsed.error.flatten());
  const d = parsed.data;
  const unit = await db.query('SELECT id FROM org_unit WHERE id = ?', [req.params.id]);
  if (!unit[0]) throw notFound('Org unit not found');
  const result = await db.query(
    'INSERT INTO membership (employee_no, org_unit_id, role_in_unit, from_date) VALUES (?, ?, ?, ?)',
    [d.employee_no, req.params.id, d.role_in_unit || null, d.from_date]
  );
  await writeAudit(req, 'create', 'membership', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/:id/members/:membershipId', requireScope('org', 'update'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM membership WHERE id = ? AND org_unit_id = ?', [req.params.membershipId, req.params.id]);
  if (!rows[0]) throw notFound('Membership not found');
  const roleInUnit = req.body && req.body.role_in_unit ? String(req.body.role_in_unit).slice(0, 100) : null;
  await db.query('UPDATE membership SET role_in_unit = ? WHERE id = ?', [roleInUnit, req.params.membershipId]);
  await writeAudit(req, 'update', 'membership', req.params.membershipId, rows[0], { role_in_unit: roleInUnit });
  res.json({ ok: true });
}));

router.delete('/:id/members/:membershipId', requireScope('org', 'update'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM membership WHERE id = ? AND org_unit_id = ?', [req.params.membershipId, req.params.id]);
  if (!rows[0]) throw notFound('Membership not found');
  await db.query('UPDATE membership SET to_date = CURDATE() WHERE id = ?', [req.params.membershipId]);
  await writeAudit(req, 'update', 'membership', req.params.membershipId, rows[0], { to_date: 'today' });
  res.json({ ok: true });
}));

module.exports = router;
