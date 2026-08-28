// Fuel transaction ledger. Capture and verification both require `fuel.verify`, which only System
// administrator holds by default (see platform/scope.js) — read is available to anyone whose role
// carries the `fuel` screen.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireAuth, requireScreen, requirePermission } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { fuelTransactionSchema, fuelDecisionSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth, requireScreen('fuel'));

router.get('/', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT f.*, v.reg_no, v.model, v.tank_capacity_l, v.department, v.target_l100km,
            d.full_legal_name AS driver_name
     FROM fuel_transaction f
     LEFT JOIN vehicle v ON v.id = f.vehicle_id
     LEFT JOIN employee_cache d ON d.employee_no = f.driver_employee_no
     ORDER BY f.transacted_at DESC`
  );
  res.json({ data: rows });
}));

// Options for the capture-transaction drawer.
router.get('/lookups', asyncHandler(async (req, res) => {
  const [vehicles, employees] = await Promise.all([
    db.query(`SELECT id, reg_no, model, tank_capacity_l FROM vehicle ORDER BY reg_no`),
    db.query(`SELECT employee_no, full_legal_name FROM employee_cache WHERE status = 'active' ORDER BY full_legal_name`),
  ]);
  res.json({ data: { vehicles, employees } });
}));

router.post('/', requirePermission('fuel.verify'), asyncHandler(async (req, res) => {
  const parsed = fuelTransactionSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid fuel transaction', parsed.error.flatten());
  const d = parsed.data;

  const vehicles = await db.query('SELECT tank_capacity_l FROM vehicle WHERE id = ?', [d.vehicle_id]);
  if (!vehicles[0]) throw notFound('Vehicle not found');
  // Auto-flag an implausible fill (litres exceeding the vehicle's own tank capacity) as an
  // Exception rather than silently accepting it — mirrors the prototype's fuelDetail() note that
  // an Exception transaction is held out of the accounting interface until a fleet officer
  // verifies or rejects it.
  const flag = d.litres > vehicles[0].tank_capacity_l ? 'Exception' : 'Pending';

  const result = await db.query(
    `INSERT INTO fuel_transaction (vehicle_id, driver_employee_no, station, litres, rate, odometer_km, flag, transacted_at)
     VALUES (?,?,?,?,?,?,?, NOW())`,
    [d.vehicle_id, d.driver_employee_no || null, d.station, d.litres, d.rate, d.odometer_km, flag]
  );
  await writeAudit(req, 'create', 'fuel_transaction', result.insertId, null, { ...d, flag });
  res.status(201).json({ data: { id: result.insertId, flag } });
}));

router.put('/:id/decision', requirePermission('fuel.verify'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM fuel_transaction WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Fuel transaction not found');
  const txn = rows[0];

  const parsed = fuelDecisionSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid decision', parsed.error.flatten());
  const { action } = parsed.data;

  if (action === 'verify') {
    if (txn.flag === 'Verified') throw badRequest('Cannot verify — already Verified');
    await db.query(
      `UPDATE fuel_transaction SET flag = 'Verified', verified_by_employee_no = ?, verified_at = NOW() WHERE id = ?`,
      [req.session.user.employeeNo, req.params.id]
    );
    await writeAudit(req, 'fuel.verify', 'fuel_transaction', req.params.id, { flag: txn.flag }, { flag: 'Verified' });
    return res.json({ data: { id: Number(req.params.id), action, flag: 'Verified' } });
  }

  // reject — removed from the ledger entirely (mirrors the prototype: rejected transactions are
  // referred back to the supplier for credit, not just relabelled).
  if (txn.flag === 'Verified') throw badRequest('Cannot reject — already Verified and posted');
  await writeAudit(req, 'fuel.reject', 'fuel_transaction', req.params.id, txn, null);
  await db.query('DELETE FROM fuel_transaction WHERE id = ?', [req.params.id]);
  res.json({ data: { id: Number(req.params.id), action } });
}));

module.exports = router;
