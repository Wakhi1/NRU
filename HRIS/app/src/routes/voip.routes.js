// VoIP is a standalone feature in the real architecture — a separate SIP/WebRTC service
// (SBC or a hosted provider such as Twilio/Vonage, or self-hosted Asterisk/FreeSWITCH) would
// terminate media and report back call detail records. No such provider is wired up here:
// this module implements the HRIS-side directory, extension provisioning, SIP/call-routing
// *configuration* (never sent to a real registrar), and a simulated call log — everything a
// real PBX integration would need HRIS to hand it, modeled so the wiring is a drop-in later.
//
// Two permission tiers, deliberately not the same as the blanket 'voip' module scope:
//  - Directory read + your own call-handling preferences (status, forward-on-busy, out-of-office)
//    follow the normal per-user 'voip' scope (everyone gets CRUD/self by default).
//  - Provisioning (allocate/reassign/release an extension, SIP credentials, device assignment,
//    department routing, hunt groups) is an admin action gated on role, like access/settings —
//    an end user managing their own call-forwarding shouldn't also be able to re-provision
//    someone else's SIP line.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, forbidden, conflict } = require('../platform/errors');
const { requireScope, scopeMeta } = require('../platform/scope');
const { requireRole } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { callSchema, extensionProvisionSchema, extensionSelfSchema } = require('../validators/voip.validators');

const router = express.Router();
const ADMIN_ROLES = ['HR administrator', 'System administrator'];
const ER_DUP_ENTRY = 1062;

function isAdmin(req) {
  return ADMIN_ROLES.includes(req.session.user.role);
}

router.get('/extensions', requireScope('voip', 'read'), asyncHandler(async (req, res) => {
  const { q } = req.query;
  const admin = isAdmin(req);
  const self = req.session.user.employeeNo;

  let sql = `SELECT v.*, p.full_legal_name, e.position_title, ou.name AS department_name
             FROM voip_extension v
             JOIN person p ON p.employee_no = v.employee_no
             LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
             LEFT JOIN org_unit ou ON ou.id = v.department_org_unit_id
             WHERE 1=1`;
  const params = [];
  if (q) { sql += ' AND (p.full_legal_name LIKE ? OR v.extension LIKE ? OR ou.name LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY p.full_legal_name';

  const rows = await db.query(sql, params);
  const data = rows.map((r) => {
    if (admin || r.employee_no === self) return r;
    // Everyone can see the directory (name/extension/department/device), but SIP credentials
    // and voicemail PIN are provisioning secrets — only the owner and admins see them.
    const { sip_username, voicemail_pin, ...safe } = r;
    return safe;
  });
  res.json({ data, meta: { scope: scopeMeta(req.scope), isAdmin: admin } });
}));

router.get('/extensions/:id', requireScope('voip', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT v.*, p.full_legal_name, e.position_title, ou.name AS department_name
     FROM voip_extension v
     JOIN person p ON p.employee_no = v.employee_no
     LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
     LEFT JOIN org_unit ou ON ou.id = v.department_org_unit_id
     WHERE v.id = ?`,
    [req.params.id]
  );
  if (!rows[0]) throw notFound('Extension not found');
  const admin = isAdmin(req);
  if (!admin && rows[0].employee_no !== req.session.user.employeeNo) {
    const { sip_username, voicemail_pin, ...safe } = rows[0];
    return res.json({ data: safe, meta: { isAdmin: false, isOwner: false } });
  }
  res.json({ data: rows[0], meta: { isAdmin: admin, isOwner: rows[0].employee_no === req.session.user.employeeNo } });
}));

// ---- Provisioning: allocate / reassign / release (admin only) ----

router.post('/extensions', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const parsed = extensionProvisionSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid extension data', parsed.error.flatten());
  const d = parsed.data;

  const person = await db.query('SELECT employee_no FROM person WHERE employee_no = ?', [d.employee_no]);
  if (!person[0]) throw notFound('Person not found');

  let result;
  try {
    result = await db.query(
      `INSERT INTO voip_extension (employee_no, extension, status, sip_username, sip_domain, voicemail_pin,
        device_assigned, department_org_unit_id, emergency_number, forward_on_busy_to, out_of_office_enabled,
        out_of_office_target, hunt_group)
       VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.employee_no, d.extension, d.sip_username || null, d.sip_domain || 'sip.nru.local', d.voicemail_pin || null,
        d.device_assigned || null, d.department_org_unit_id || null, d.emergency_number || null,
        d.forward_on_busy_to || null, d.out_of_office_enabled ? 1 : 0, d.out_of_office_target || null, d.hunt_group || null]
    );
  } catch (err) {
    if (err.errno === ER_DUP_ENTRY) throw conflict('That extension number or this person already has an allocation');
    throw err;
  }
  await writeAudit(req, 'create', 'voip_extension', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/extensions/:id', requireScope('voip', 'update'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM voip_extension WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Extension not found');
  const before = rows[0];
  const admin = isAdmin(req);
  const isOwner = before.employee_no === req.session.user.employeeNo;
  if (!admin && !isOwner) throw forbidden('You may only manage your own extension');

  if (admin) {
    const parsed = extensionProvisionSchema.partial().safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid extension data', parsed.error.flatten());
    const d = parsed.data;
    const fields = Object.keys(d);
    if (fields.length) {
      try {
        await db.query(`UPDATE voip_extension SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => (typeof d[f] === 'boolean' ? (d[f] ? 1 : 0) : d[f])), req.params.id]);
      } catch (err) {
        if (err.errno === ER_DUP_ENTRY) throw conflict('That extension number is already in use');
        throw err;
      }
    }
  } else {
    // Self-service: only your own call-handling preferences, not provisioning fields.
    const parsed = extensionSelfSchema.partial().safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid data', parsed.error.flatten());
    const d = parsed.data;
    const fields = Object.keys(d);
    if (fields.length) {
      await db.query(`UPDATE voip_extension SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => (typeof d[f] === 'boolean' ? (d[f] ? 1 : 0) : d[f])), req.params.id]);
    }
  }

  await writeAudit(req, 'update', 'voip_extension', req.params.id, before, req.body);
  const after = await db.query('SELECT * FROM voip_extension WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/extensions/:id', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM voip_extension WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Extension not found');
  await db.query('DELETE FROM voip_extension WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'voip_extension', req.params.id, rows[0], null);
  res.json({ ok: true });
}));

// ---- Calls (simulated CDR) ----

router.get('/calls', requireScope('voip', 'read'), asyncHandler(async (req, res) => {
  const self = req.session.user.employeeNo;
  const organisationWide = req.scope.dataScope === 'organisation';
  const sql = organisationWide
    ? `SELECT c.*, caller.full_legal_name AS caller_name, callee.full_legal_name AS callee_name
       FROM call_record c
       JOIN person caller ON caller.employee_no = c.caller_employee_no
       LEFT JOIN person callee ON callee.employee_no = c.callee_employee_no
       ORDER BY c.started_at DESC LIMIT 30`
    : `SELECT c.*, caller.full_legal_name AS caller_name, callee.full_legal_name AS callee_name
       FROM call_record c
       JOIN person caller ON caller.employee_no = c.caller_employee_no
       LEFT JOIN person callee ON callee.employee_no = c.callee_employee_no
       WHERE c.caller_employee_no = ? OR c.callee_employee_no = ?
       ORDER BY c.started_at DESC LIMIT 30`;
  const rows = await db.query(sql, organisationWide ? [] : [self, self]);
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.post('/calls', requireScope('voip', 'create'), asyncHandler(async (req, res) => {
  const parsed = callSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid call data', parsed.error.flatten());
  const d = parsed.data;
  if (!d.callee_employee_no && !d.callee_number) throw badRequest('A callee is required');

  const durationSeconds = 30 + Math.floor(Math.random() * 240);
  const result = await db.query(
    `INSERT INTO call_record (caller_employee_no, callee_employee_no, callee_number, started_at, duration_seconds, direction, outcome)
     VALUES (?, ?, ?, NOW(), ?, 'outbound', 'completed')`,
    [req.session.user.employeeNo, d.callee_employee_no || null, d.callee_number || null, durationSeconds]
  );
  await writeAudit(req, 'create', 'call_record', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId, duration_seconds: durationSeconds } });
}));

module.exports = router;
