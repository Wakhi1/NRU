// Driver profiles — licence/safety data layered on top of employee_cache (see schema.sql's
// driver_profile comment). Visibility is permission-scoped, not just screen-gated: org-wide for
// `driver.view.org`/`driver.manage`, own-department-only for `driver.view.dept` (Head of
// Department), mirroring the exact pattern trips.routes.js uses for `trip.authorise.dept`.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, forbidden } = require('../platform/errors');
const { requireAuth, requireScreen, requirePermission } = require('../platform/auth');
const { hasPermission } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { driverProfileSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth, requireScreen('drivers'));

router.get('/', asyncHandler(async (req, res) => {
  const roles = req.session.user.roleKeys || [];
  const orgWide = hasPermission(roles, 'driver.view.org') || hasPermission(roles, 'driver.manage');
  const deptScoped = hasPermission(roles, 'driver.view.dept');
  if (!orgWide && !deptScoped) throw forbidden('Your role does not have driver visibility');

  const params = [];
  let where = '';
  if (!orgWide && deptScoped) {
    const me = await db.query('SELECT department FROM employee_cache WHERE employee_no = ?', [req.session.user.employeeNo]);
    where = 'WHERE e.department = ?';
    params.push((me[0] && me[0].department) || '__none__');
  }

  const rows = await db.query(
    `SELECT dp.*, e.full_legal_name, e.department, e.photo_path,
            COALESCE(t.trip_count, 0) AS trip_count, COALESCE(t.total_km, 0) AS total_km
     FROM driver_profile dp
     JOIN employee_cache e ON e.employee_no = dp.employee_no
     LEFT JOIN (
       SELECT driver_employee_no, COUNT(*) AS trip_count, SUM(distance_km) AS total_km
       FROM trip WHERE status IN ('In progress','Completed') GROUP BY driver_employee_no
     ) t ON t.driver_employee_no = dp.employee_no
     ${where}
     ORDER BY e.full_legal_name`,
    params
  );
  res.json({ data: rows });
}));

router.get('/candidates', requirePermission('driver.manage'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT e.employee_no, e.full_legal_name
     FROM employee_cache e LEFT JOIN driver_profile dp ON dp.employee_no = e.employee_no
     WHERE dp.employee_no IS NULL AND e.status = 'active'
     ORDER BY e.full_legal_name`
  );
  res.json({ data: rows });
}));

router.post('/', requirePermission('driver.manage'), asyncHandler(async (req, res) => {
  const employeeNo = req.body && req.body.employee_no;
  if (!employeeNo) throw badRequest('An employee must be selected');
  const parsed = driverProfileSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid driver profile data', parsed.error.flatten());
  const d = parsed.data;

  await db.query(
    `INSERT INTO driver_profile (employee_no, licence_no, licence_expiry, safety_score, note)
     VALUES (?,?,?,?,?)`,
    [employeeNo, d.licence_no || null, d.licence_expiry || null, d.safety_score != null ? d.safety_score : 100, d.note || null]
  );
  await writeAudit(req, 'create', 'driver_profile', employeeNo, null, d);
  res.status(201).json({ data: { employee_no: employeeNo } });
}));

router.put('/:employeeNo', requirePermission('driver.manage'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM driver_profile WHERE employee_no = ?', [req.params.employeeNo]);
  if (!rows[0]) throw notFound('Driver profile not found');
  const parsed = driverProfileSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid driver profile data', parsed.error.flatten());
  const d = parsed.data;

  const fields = Object.keys(d);
  if (fields.length === 0) return res.json({ data: rows[0] });
  await db.query(
    `UPDATE driver_profile SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE employee_no = ?`,
    [...fields.map((f) => d[f]), req.params.employeeNo]
  );
  await writeAudit(req, 'update', 'driver_profile', req.params.employeeNo, rows[0], d);
  res.json({ ok: true });
}));

router.delete('/:employeeNo', requirePermission('driver.manage'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM driver_profile WHERE employee_no = ?', [req.params.employeeNo]);
  if (!rows[0]) throw notFound('Driver profile not found');
  await db.query('DELETE FROM driver_profile WHERE employee_no = ?', [req.params.employeeNo]);
  await writeAudit(req, 'delete', 'driver_profile', req.params.employeeNo, rows[0], null);
  res.json({ ok: true });
}));

module.exports = router;
