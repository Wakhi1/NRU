// Users & permissions — role comes straight from the HRIS (employee_cache.role_name, synced by
// reconcile.js, never derived or stored separately here). This screen reviews that, lets a System
// administrator edit the permission matrix per HRIS role, and edits the check-in/geofence policy —
// everything here requires `admin.roles`, which only System administrator holds.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireAuth, requirePermission } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { reconcile } = require('../platform/reconcile');
const { ROLES, PERM_ROWS, setPermission } = require('../platform/scope');
const { policySchema, permissionToggleSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth, requirePermission('admin.roles'));

router.get('/users', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT employee_no, full_legal_name, email, department, position_title, status, photo_path, role_name
     FROM employee_cache ORDER BY full_legal_name`
  );
  res.json({ data: rows, roles: ROLES });
}));

router.get('/matrix', asyncHandler(async (req, res) => {
  res.json({ data: { rows: PERM_ROWS, roles: ROLES } });
}));

// Toggles ONE cell of the permission matrix — persisted (role_permission table) and applied
// immediately in-memory (scope.setPermission reloads ROLES[key].permissions), no restart needed.
// Guarded against the one genuinely destructive mistake this editor makes possible: removing
// `admin.roles` from System administrator would lock every admin — including whoever just clicked
// the checkbox — out of this very screen, with no UI path left to undo it.
router.put('/matrix', asyncHandler(async (req, res) => {
  const parsed = permissionToggleSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid permission toggle', parsed.error.flatten());
  const { role_key, permission_key, granted } = parsed.data;
  if (!ROLES[role_key]) throw notFound('Unknown role');
  if (!granted && permission_key === 'admin.roles' && role_key === 'System administrator') {
    throw badRequest('Cannot remove admin.roles from System administrator — this would lock everyone out of Users & permissions with no way to undo it here');
  }

  const before = [...(ROLES[role_key].permissions || [])];
  await setPermission(role_key, permission_key, granted);
  await writeAudit(req, 'permission.toggle', 'role_permission', `${role_key}:${permission_key}`, { permissions: before }, { granted });
  res.json({ data: { role_key, permissions: ROLES[role_key].permissions } });
}));

// Read-only mirror of the HRIS's org hierarchy — HRIS owns this data (architecture doc ownership
// table), SPTS only displays what reconcile.js last synced. No create/update/delete here.
router.get('/org-units', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT ou.*, e.full_legal_name AS lead_name FROM org_unit_cache ou
     LEFT JOIN employee_cache e ON e.employee_no = ou.lead_employee_no
     ORDER BY ou.parent_id IS NULL DESC, ou.name`
  );
  res.json({ data: rows });
}));

router.post('/reconcile', asyncHandler(async (req, res) => {
  const result = await reconcile();
  await writeAudit(req, 'reconcile', 'employee_cache', 'bulk', null, result);
  res.json({ data: result });
}));

router.get('/policy', asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM policy WHERE id = 1');
  res.json({ data: rows[0] });
}));

router.put('/policy', asyncHandler(async (req, res) => {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid policy', parsed.error.flatten());
  const d = parsed.data;
  const before = await db.query('SELECT * FROM policy WHERE id = 1');
  await db.query(
    `INSERT INTO policy (id, default_radius_m, accuracy_ceiling_m, recheck_hours, offline_behavior, shift_start_time, shift_end_time) VALUES (1,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE default_radius_m=VALUES(default_radius_m), accuracy_ceiling_m=VALUES(accuracy_ceiling_m),
       recheck_hours=VALUES(recheck_hours), offline_behavior=VALUES(offline_behavior),
       shift_start_time=VALUES(shift_start_time), shift_end_time=VALUES(shift_end_time)`,
    [d.default_radius_m, d.accuracy_ceiling_m, d.recheck_hours, d.offline_behavior, d.shift_start_time || null, d.shift_end_time || null]
  );
  await writeAudit(req, 'policy.update', 'policy', 1, before[0], d);
  res.json({ ok: true });
}));

module.exports = router;
