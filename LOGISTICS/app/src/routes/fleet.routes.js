// The fleet register — every organisation-owned vehicle. Read is available to anyone whose role
// carries the `fleet` screen (System administrator, System Analyst); write actions additionally
// require `fleet.manage`, which only System administrator holds by default (see platform/scope.js).
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireAuth, requireScreen, requirePermission } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { vehicleSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth, requireScreen('fleet'));

router.get('/', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT v.*, e.full_legal_name AS driver_name
     FROM vehicle v LEFT JOIN employee_cache e ON e.employee_no = v.assigned_driver_employee_no
     ORDER BY v.reg_no`
  );
  res.json({ data: rows });
}));

// Options for the register/edit drawer — active employees (as candidate drivers) and the synced
// org-unit list (as the cost-centre/department picklist), rather than a raw free-text department
// field on every create form.
router.get('/lookups', asyncHandler(async (req, res) => {
  const [employees, orgUnits] = await Promise.all([
    db.query(`SELECT employee_no, full_legal_name FROM employee_cache WHERE status = 'active' ORDER BY full_legal_name`),
    db.query(`SELECT DISTINCT name FROM org_unit_cache ORDER BY name`),
  ]);
  res.json({ data: { employees, departments: orgUnits.map((o) => o.name) } });
}));

router.post('/', requirePermission('fleet.manage'), asyncHandler(async (req, res) => {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid vehicle data', parsed.error.flatten());
  const d = parsed.data;

  const result = await db.query(
    `INSERT INTO vehicle (reg_no, model, vehicle_type, category, department, assigned_driver_employee_no, status,
       odometer_km, fuel_pct, efficiency_l100km, target_l100km, tank_capacity_l, next_service_note, next_service_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [d.reg_no, d.model, d.vehicle_type, d.category || 'work', d.department || null, d.assigned_driver_employee_no || null, d.status || 'Available',
      d.odometer_km || 0, d.fuel_pct != null ? d.fuel_pct : 100,
      d.efficiency_l100km == null ? null : d.efficiency_l100km, d.target_l100km == null ? null : d.target_l100km,
      d.tank_capacity_l || 80, d.next_service_note || null, d.next_service_date || null]
  );
  await writeAudit(req, 'create', 'vehicle', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

router.put('/:id', requirePermission('fleet.manage'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM vehicle WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Vehicle not found');
  const parsed = vehicleSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid vehicle data', parsed.error.flatten());
  const d = parsed.data;

  const fields = Object.keys(d);
  if (fields.length === 0) return res.json({ data: rows[0] });
  await db.query(
    `UPDATE vehicle SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...fields.map((f) => d[f]), req.params.id]
  );
  await writeAudit(req, 'update', 'vehicle', req.params.id, rows[0], d);
  res.json({ ok: true });
}));

router.delete('/:id', requirePermission('fleet.manage'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM vehicle WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Vehicle not found');
  await db.query('DELETE FROM vehicle WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'vehicle', req.params.id, rows[0], null);
  res.json({ ok: true });
}));

module.exports = router;
