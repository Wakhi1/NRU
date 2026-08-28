// Trip authorisation workflow. Two screens share this one table: `mytrips` (self-service — anyone
// can request a trip, `trip.own.submit`, granted to every role) and `trips` (the Transport
// Officer's authorisation queue — organisation-wide for `trip.authorise`, own-department-only for
// `trip.authorise.dept`, matched against the assigned vehicle's `department` column against the
// authoriser's own employee_cache.department).
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, forbidden } = require('../platform/errors');
const { requireAuth, requireScreen, requirePermission } = require('../platform/auth');
const { hasPermission } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { isOnLeaveToday, expiringCertifications } = require('../platform/reconcile');
const { tripRequestSchema, tripDecisionSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth);

function nextTripCode() {
  return `TRP-${Math.floor(1000 + Math.random() * 9000)}`;
}

router.get('/lookups', asyncHandler(async (req, res) => {
  const [vehicles, employees] = await Promise.all([
    db.query(`SELECT id, reg_no, model, department FROM vehicle WHERE status != 'Grounded' ORDER BY reg_no`),
    db.query(`SELECT employee_no, full_legal_name FROM employee_cache WHERE status = 'active' ORDER BY full_legal_name`),
  ]);
  res.json({ data: { vehicles, employees } });
}));

// Self-service — my own submitted/assigned trips.
router.get('/mine', requireScreen('mytrips'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT t.*, v.reg_no, v.model, d.full_legal_name AS driver_name
     FROM trip t LEFT JOIN vehicle v ON v.id = t.vehicle_id LEFT JOIN employee_cache d ON d.employee_no = t.driver_employee_no
     WHERE t.requested_by_employee_no = ? ORDER BY t.requested_at DESC`,
    [req.session.user.employeeNo]
  );
  res.json({ data: rows });
}));

router.post('/', requireScreen('mytrips'), requirePermission('trip.own.submit'), asyncHandler(async (req, res) => {
  const parsed = tripRequestSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid trip request', parsed.error.flatten());
  const d = parsed.data;

  const code = nextTripCode();
  const result = await db.query(
    `INSERT INTO trip (trip_code, origin, destination, vehicle_id, driver_employee_no, requested_by_employee_no, distance_km, purpose, status)
     VALUES (?,?,?,?,?,?,?,?, 'Pending')`,
    [code, d.origin, d.destination, d.vehicle_id || null, d.driver_employee_no || null, req.session.user.employeeNo, d.distance_km, d.purpose || null]
  );
  await writeAudit(req, 'create', 'trip', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId, trip_code: code } });
}));

// Authorisation queue — org-wide or department-scoped depending on the caller's permission.
router.get('/', requireScreen('trips'), asyncHandler(async (req, res) => {
  const roles = req.session.user.roleKeys || [];
  const orgWide = hasPermission(roles, 'trip.authorise');
  const deptScoped = hasPermission(roles, 'trip.authorise.dept');
  if (!orgWide && !deptScoped) throw forbidden('Your role does not authorise trips');

  const params = [];
  let where = '';
  if (!orgWide && deptScoped) {
    const me = await db.query('SELECT department FROM employee_cache WHERE employee_no = ?', [req.session.user.employeeNo]);
    where = 'WHERE v.department = ?';
    params.push((me[0] && me[0].department) || '__none__');
  }

  const rows = await db.query(
    `SELECT t.*, v.reg_no, v.model, v.department AS vehicle_department, d.full_legal_name AS driver_name,
            r.full_legal_name AS requester_name
     FROM trip t
     LEFT JOIN vehicle v ON v.id = t.vehicle_id
     LEFT JOIN employee_cache d ON d.employee_no = t.driver_employee_no
     LEFT JOIN employee_cache r ON r.employee_no = t.requested_by_employee_no
     ${where}
     ORDER BY t.requested_at DESC`,
    params
  );
  res.json({ data: rows });
}));

router.put('/:id/decision', requireScreen('trips'), asyncHandler(async (req, res) => {
  const roles = req.session.user.roleKeys || [];
  const orgWide = hasPermission(roles, 'trip.authorise');
  const deptScoped = hasPermission(roles, 'trip.authorise.dept');
  if (!orgWide && !deptScoped) throw forbidden('Your role does not authorise trips');

  const rows = await db.query(
    `SELECT t.*, v.department AS vehicle_department FROM trip t LEFT JOIN vehicle v ON v.id = t.vehicle_id WHERE t.id = ?`,
    [req.params.id]
  );
  if (!rows[0]) throw notFound('Trip not found');
  const trip = rows[0];

  if (!orgWide && deptScoped) {
    const me = await db.query('SELECT department FROM employee_cache WHERE employee_no = ?', [req.session.user.employeeNo]);
    if (!me[0] || trip.vehicle_department !== me[0].department) throw forbidden('This trip is outside your department');
  }

  const parsed = tripDecisionSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid decision', parsed.error.flatten());
  const { action, cost } = parsed.data;

  let warnings = [];
  if (action === 'authorise') {
    if (trip.status !== 'Pending') throw badRequest(`Cannot authorise — trip is "${trip.status}"`);
    if (trip.driver_employee_no) {
      const [onLeave, expiring] = await Promise.all([
        isOnLeaveToday(trip.driver_employee_no),
        expiringCertifications(trip.driver_employee_no, 30),
      ]);
      if (onLeave) warnings.push('This driver is recorded as on approved leave today, per the HRIS.');
      if (expiring.length) warnings.push(`${expiring.length} certification(s) for this driver expire within 30 days, per the HRIS.`);
    }
    await db.query(
      `UPDATE trip SET status = 'In progress', authorised_by_employee_no = ?, authorised_at = NOW() WHERE id = ?`,
      [req.session.user.employeeNo, req.params.id]
    );
    if (trip.vehicle_id) await db.query(`UPDATE vehicle SET status = 'On trip' WHERE id = ?`, [trip.vehicle_id]);
  } else if (action === 'reject') {
    if (trip.status !== 'Pending') throw badRequest(`Cannot reject — trip is "${trip.status}"`);
    await db.query(`UPDATE trip SET status = 'Rejected' WHERE id = ?`, [req.params.id]);
  } else if (action === 'close') {
    if (trip.status !== 'In progress') throw badRequest(`Cannot close — trip is "${trip.status}"`);
    const finalCost = cost != null ? cost : Math.round(Number(trip.distance_km) * 4.6);
    await db.query(`UPDATE trip SET status = 'Completed', cost = ?, closed_at = NOW() WHERE id = ?`, [finalCost, req.params.id]);
    if (trip.vehicle_id) await db.query(`UPDATE vehicle SET status = 'Available' WHERE id = ?`, [trip.vehicle_id]);
  }

  await writeAudit(req, `trip.${action}`, 'trip', req.params.id, { status: trip.status }, { action, cost, warnings });
  res.json({ data: { id: Number(req.params.id), action, warnings } });
}));

module.exports = router;
