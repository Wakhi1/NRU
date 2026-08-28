// Users & permissions — role comes straight from the HRIS (employee_cache.role_name, synced by
// reconcile.js, never derived or stored separately here). This screen reviews that, lets a System
// administrator edit the permission matrix per HRIS role, edit the fuel/dispatch policy, and
// trigger an on-demand HRIS reconciliation — everything here requires `admin.roles`, which only
// System administrator holds.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireAuth, requirePermission } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { reconcile } = require('../platform/reconcile');
const { ROLES, PERM_ROWS, SCREEN_ROWS, setPermission } = require('../platform/scope');
const { permissionToggleSchema, fuelPolicySchema } = require('../validators/schemas');

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
  res.json({ data: { permRows: PERM_ROWS, screenRows: SCREEN_ROWS, roles: ROLES } });
}));

// Toggles ONE cell of either matrix — screen access (`permission_key` like "screen:fleet") or a
// capability (`permission_key` like "fleet.manage") — both are the same kind of row in
// role_permission, so one endpoint handles both. Persisted and applied immediately in-memory
// (scope.setPermission reloads ROLES[key].screens/.permissions), no restart needed. Guarded against
// locking every admin out of this very screen: neither `admin.roles` nor `screen:admin` can be
// removed from System administrator, since together they're the only way back into this page.
router.put('/matrix', asyncHandler(async (req, res) => {
  const parsed = permissionToggleSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid permission toggle', parsed.error.flatten());
  const { role_key, permission_key, granted } = parsed.data;
  if (!ROLES[role_key]) throw notFound('Unknown role');
  if (!granted && role_key === 'System administrator' && (permission_key === 'admin.roles' || permission_key === 'screen:admin')) {
    throw badRequest('Cannot remove this from System administrator — it would lock everyone out of Users & permissions with no way to undo it here');
  }

  const before = { screens: [...(ROLES[role_key].screens || [])], permissions: [...(ROLES[role_key].permissions || [])] };
  await setPermission(role_key, permission_key, granted);
  await writeAudit(req, 'permission.toggle', 'role_permission', `${role_key}:${permission_key}`, before, { granted });
  res.json({ data: { role_key, screens: ROLES[role_key].screens, permissions: ROLES[role_key].permissions } });
}));

// Read-only mirror of the HRIS's org hierarchy — HRIS owns this data, FLMS only displays what
// reconcile.js last synced.
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
  const rows = await db.query('SELECT * FROM fuel_policy WHERE id = 1');
  res.json({ data: rows[0] });
}));

router.put('/policy', asyncHandler(async (req, res) => {
  const parsed = fuelPolicySchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid policy', parsed.error.flatten());
  const d = parsed.data;
  const before = await db.query('SELECT * FROM fuel_policy WHERE id = 1');
  await db.query(
    `INSERT INTO fuel_policy (id, block_offhours, require_odo_photo, geofence_stations, autoflag_overfill, push_to_accounting, variance_threshold_pct, idle_threshold_min, price_ceiling)
     VALUES (1,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE block_offhours=VALUES(block_offhours), require_odo_photo=VALUES(require_odo_photo),
       geofence_stations=VALUES(geofence_stations), autoflag_overfill=VALUES(autoflag_overfill),
       push_to_accounting=VALUES(push_to_accounting), variance_threshold_pct=VALUES(variance_threshold_pct),
       idle_threshold_min=VALUES(idle_threshold_min), price_ceiling=VALUES(price_ceiling)`,
    [d.block_offhours ? 1 : 0, d.require_odo_photo ? 1 : 0, d.geofence_stations ? 1 : 0, d.autoflag_overfill ? 1 : 0,
      d.push_to_accounting ? 1 : 0, d.variance_threshold_pct, d.idle_threshold_min, d.price_ceiling]
  );
  await writeAudit(req, 'policy.update', 'fuel_policy', 1, before[0], d);
  res.json({ ok: true });
}));

module.exports = router;
