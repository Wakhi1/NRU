const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, conflict } = require('../platform/errors');
const { requireRole, hashPassword } = require('../platform/auth');
const { MODULES } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { permissionUpdateSchema, overrideSchema, roleSchema, userCreateSchema, userUpdateSchema, passwordResetSchema } = require('../validators/access.validators');

const router = express.Router();
const ADMIN_ROLES = ['System administrator', 'HR administrator'];
const ER_DUP_ENTRY = 1062;
const ER_ROW_IS_REFERENCED = 1451;

router.get('/roles', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const roles = await db.query(
    `SELECT r.id, r.name, r.description, r.is_super_admin, COUNT(u.id) AS user_count
     FROM role r LEFT JOIN app_user u ON u.role_id = r.id
     GROUP BY r.id ORDER BY r.id`
  );
  res.json({ data: roles });
}));

// New roles start with no access to anything (data_scope 'self', all CRUD flags off) on every
// module, so they immediately show up correctly in the permission matrix for an admin to grant
// access into rather than defaulting to silently-broad or silently-missing rows.
router.post('/roles', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid role data', parsed.error.flatten());
  const d = parsed.data;

  let result;
  try {
    result = await db.query('INSERT INTO role (name, description) VALUES (?, ?)', [d.name, d.description || null]);
  } catch (err) {
    if (err.errno === ER_DUP_ENTRY) throw conflict(`A role named "${d.name}" already exists`);
    throw err;
  }
  for (const mod of MODULES) {
    await db.query(
      `INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes)
       VALUES (?, ?, 0, 0, 0, 0, 'self', 'public')`,
      [result.insertId, mod]
    );
  }
  await writeAudit(req, 'create', 'role', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/roles/:id', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM role WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Role not found');
  const parsed = roleSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid role data', parsed.error.flatten());
  const d = parsed.data;
  const fields = Object.keys(d);
  if (!fields.length) return res.json({ data: before[0] });
  try {
    await db.query(`UPDATE role SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => d[f]), req.params.id]);
  } catch (err) {
    if (err.errno === ER_DUP_ENTRY) throw conflict(`A role named "${d.name}" already exists`);
    throw err;
  }
  await writeAudit(req, 'update', 'role', req.params.id, before[0], d);
  const after = await db.query('SELECT * FROM role WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

router.delete('/roles/:id', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM role WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('Role not found');
  try {
    await db.query('DELETE FROM role WHERE id = ?', [req.params.id]);
  } catch (err) {
    if (err.errno === ER_ROW_IS_REFERENCED) throw conflict('This role still has user logins assigned — reassign or remove them first.');
    throw err;
  }
  await writeAudit(req, 'delete', 'role', req.params.id, before[0], null);
  res.json({ ok: true });
}));

// ---------- User accounts (logins) ----------

router.get('/users', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT u.id, u.employee_no, u.email, u.is_active, u.last_login_at, u.created_at, u.locked_until, u.failed_attempts,
            r.id AS role_id, r.name AS role_name, p.full_legal_name
     FROM app_user u JOIN role r ON r.id = u.role_id JOIN person p ON p.employee_no = u.employee_no
     ORDER BY p.full_legal_name`
  );
  res.json({ data: rows });
}));

router.post('/users', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid user data', parsed.error.flatten());
  const d = parsed.data;

  const person = await db.query('SELECT employee_no FROM person WHERE employee_no = ?', [d.employee_no]);
  if (!person[0]) throw notFound('Person not found');
  const role = await db.query('SELECT id FROM role WHERE id = ?', [d.role_id]);
  if (!role[0]) throw badRequest('Unknown role');

  const passwordHash = await hashPassword(d.password);
  let result;
  try {
    result = await db.query(
      'INSERT INTO app_user (employee_no, email, password_hash, role_id, is_active) VALUES (?, ?, ?, ?, 1)',
      [d.employee_no, d.email, passwordHash, d.role_id]
    );
  } catch (err) {
    if (err.errno === ER_DUP_ENTRY) throw conflict('This person or email already has a login');
    throw err;
  }
  await writeAudit(req, 'create', 'app_user', result.insertId, null, { employee_no: d.employee_no, email: d.email, role_id: d.role_id });
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/users/:id', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM app_user WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('User not found');
  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid user data', parsed.error.flatten());
  const d = parsed.data;

  const setClauses = [];
  const params = [];
  if (d.email !== undefined) { setClauses.push('email = ?'); params.push(d.email); }
  if (d.role_id !== undefined) { setClauses.push('role_id = ?'); params.push(d.role_id); }
  if (d.is_active !== undefined) { setClauses.push('is_active = ?'); params.push(d.is_active ? 1 : 0); }
  if (d.password) { setClauses.push('password_hash = ?'); params.push(await hashPassword(d.password)); }
  if (!setClauses.length) return res.json({ data: before[0] });

  params.push(req.params.id);
  try {
    await db.query(`UPDATE app_user SET ${setClauses.join(', ')} WHERE id = ?`, params);
  } catch (err) {
    if (err.errno === ER_DUP_ENTRY) throw conflict('That email is already in use');
    throw err;
  }
  await writeAudit(req, 'update', 'app_user', req.params.id, { ...before[0], password_hash: undefined }, { ...d, password: d.password ? '(changed)' : undefined });
  const after = await db.query('SELECT id, employee_no, email, role_id, is_active FROM app_user WHERE id = ?', [req.params.id]);
  res.json({ data: after[0] });
}));

// Manual, indefinite lock — distinct from the short auto-lockout window that login.routes.js
// sets after repeated bad passwords. Same locked_until column, just a much longer duration, so
// a single /unlock endpoint below can release either kind.
router.post('/users/:id/lock', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM app_user WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('User not found');
  await db.query('UPDATE app_user SET locked_until = DATE_ADD(NOW(), INTERVAL 100 YEAR) WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'lock', 'app_user', req.params.id, { locked_until: before[0].locked_until }, { locked: true });
  res.json({ ok: true });
}));

router.post('/users/:id/unlock', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM app_user WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('User not found');
  await db.query('UPDATE app_user SET locked_until = NULL, failed_attempts = 0 WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'unlock', 'app_user', req.params.id, { locked_until: before[0].locked_until }, { locked: false });
  res.json({ ok: true });
}));

router.post('/users/:id/reset-password', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM app_user WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('User not found');
  const parsed = passwordResetSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid password', parsed.error.flatten());

  const passwordHash = await hashPassword(parsed.data.password);
  // A freshly reset password shouldn't stay locked out — clear both alongside the hash.
  await db.query('UPDATE app_user SET password_hash = ?, locked_until = NULL, failed_attempts = 0 WHERE id = ?', [passwordHash, req.params.id]);
  await writeAudit(req, 'reset_password', 'app_user', req.params.id, { employee_no: before[0].employee_no }, { reset: true });
  res.json({ ok: true });
}));

router.delete('/users/:id', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const before = await db.query('SELECT * FROM app_user WHERE id = ?', [req.params.id]);
  if (!before[0]) throw notFound('User not found');
  await db.query('DELETE FROM app_user WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'app_user', req.params.id, { ...before[0], password_hash: undefined }, null);
  res.json({ ok: true });
}));

router.get('/matrix', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const roles = await db.query('SELECT id, name, is_super_admin FROM role ORDER BY id');
  const perms = await db.query('SELECT * FROM permission');
  const matrix = roles.map((r) => ({
    role: r,
    modules: MODULES.map((m) => {
      const p = perms.find((x) => x.role_id === r.id && x.module === m) || {};
      return {
        module: m,
        can_create: !!p.can_create,
        can_read: !!p.can_read,
        can_update: !!p.can_update,
        can_delete: !!p.can_delete,
        data_scope: p.data_scope || 'self',
      };
    }),
  }));
  res.json({ data: { modules: MODULES, matrix } });
}));

router.put('/matrix/:roleId/:module', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  if (!MODULES.includes(req.params.module)) throw badRequest('Unknown module');
  const parsed = permissionUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid permission data', parsed.error.flatten());
  const d = parsed.data;

  const before = await db.query('SELECT * FROM permission WHERE role_id = ? AND module = ?', [req.params.roleId, req.params.module]);
  await db.query(
    `INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'public,internal,restricted,sensitive')
     ON DUPLICATE KEY UPDATE can_create = VALUES(can_create), can_read = VALUES(can_read),
       can_update = VALUES(can_update), can_delete = VALUES(can_delete), data_scope = VALUES(data_scope)`,
    [req.params.roleId, req.params.module, d.can_create, d.can_read, d.can_update, d.can_delete, d.data_scope]
  );
  await writeAudit(req, 'update', 'permission', `${req.params.roleId}:${req.params.module}`, before[0] || null, d);
  res.json({ ok: true });
}));

router.get('/overrides', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT o.*, p.full_legal_name, g.full_legal_name AS granted_by_name
     FROM permission_override o
     JOIN person p ON p.employee_no = o.employee_no
     LEFT JOIN person g ON g.employee_no = o.granted_by_employee_no
     ORDER BY o.created_at DESC`
  );
  res.json({ data: rows });
}));

router.post('/overrides', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const parsed = overrideSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid override data', parsed.error.flatten());
  const d = parsed.data;
  const result = await db.query(
    'INSERT INTO permission_override (employee_no, module, crud, reason, expires_at, granted_by_employee_no) VALUES (?, ?, ?, ?, ?, ?)',
    [d.employee_no, d.module, d.crud, d.reason, d.expires_at || null, req.session.user.employeeNo]
  );
  await writeAudit(req, 'create', 'permission_override', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.delete('/overrides/:id', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM permission_override WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Override not found');
  await db.query('DELETE FROM permission_override WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'permission_override', req.params.id, rows[0], null);
  res.json({ ok: true });
}));

router.get('/effective/:employeeNo', requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const { resolveAllScopes } = require('../platform/scope');
  const rows = await db.query(
    `SELECT u.employee_no, u.role_id, r.name AS role_name FROM app_user u JOIN role r ON r.id = u.role_id WHERE u.employee_no = ?`,
    [req.params.employeeNo]
  );
  if (!rows[0]) throw notFound('No login for this person');
  const scope = await resolveAllScopes({ employeeNo: rows[0].employee_no, roleId: rows[0].role_id });
  res.json({ data: { employee_no: rows[0].employee_no, role: rows[0].role_name, scope } });
}));

module.exports = router;
