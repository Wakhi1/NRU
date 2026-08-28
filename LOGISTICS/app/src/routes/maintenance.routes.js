// The workshop board — every work order raised against a vehicle. Read is available to anyone
// whose role carries the `maintenance` screen; advancing/creating work orders additionally
// requires `maintenance.manage` (see platform/scope.js).
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireAuth, requireScreen, requirePermission } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { workOrderSchema } = require('../validators/schemas');

const router = express.Router();
router.use(requireAuth, requireScreen('maintenance'));

function nextWoCode() {
  return `WO-${Math.floor(1000 + Math.random() * 9000)}`;
}

router.get('/', asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT w.*, v.reg_no, v.model
     FROM work_order w JOIN vehicle v ON v.id = w.vehicle_id
     ORDER BY w.stage ASC, w.opened_at DESC`
  );
  res.json({ data: rows });
}));

router.get('/lookups', asyncHandler(async (req, res) => {
  const vehicles = await db.query(`SELECT id, reg_no, model FROM vehicle ORDER BY reg_no`);
  res.json({ data: { vehicles } });
}));

router.post('/', requirePermission('maintenance.manage'), asyncHandler(async (req, res) => {
  const parsed = workOrderSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid work order data', parsed.error.flatten());
  const d = parsed.data;

  const code = nextWoCode();
  const result = await db.query(
    `INSERT INTO work_order (wo_code, vehicle_id, title, priority, stage, cost, workshop_name, due_note, due_date, authorised_by_employee_no)
     VALUES (?,?,?,?,0,?,?,?,?,?)`,
    [code, d.vehicle_id, d.title, d.priority, d.cost, d.workshop_name || null, d.due_note || null, d.due_date || null, req.session.user.employeeNo]
  );
  await writeAudit(req, 'create', 'work_order', result.insertId, null, d);
  res.status(201).json({ data: { id: result.insertId, wo_code: code } });
}));

router.put('/:id/advance', requirePermission('maintenance.manage'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM work_order WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw notFound('Work order not found');
  const wo = rows[0];
  if (wo.stage >= 2) throw badRequest('Already completed');

  const nextStage = wo.stage + 1;
  if (nextStage === 1) {
    // Start work — the vehicle moves into the workshop and becomes unavailable for dispatch.
    await db.query('UPDATE work_order SET stage = 1 WHERE id = ?', [req.params.id]);
    await db.query(`UPDATE vehicle SET status = 'Workshop' WHERE id = ?`, [wo.vehicle_id]);
  } else {
    // Complete & post cost — only restore the vehicle to Available if this work order was the
    // reason it was sitting in Workshop; don't clobber a status it moved to for some other reason.
    const closedNote = `Closed ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
    await db.query('UPDATE work_order SET stage = 2, closed_at = NOW(), due_note = ? WHERE id = ?', [closedNote, req.params.id]);
    await db.query(`UPDATE vehicle SET status = 'Available' WHERE id = ? AND status = 'Workshop'`, [wo.vehicle_id]);
  }

  await writeAudit(req, 'maintenance.advance', 'work_order', req.params.id, { stage: wo.stage }, { stage: nextStage });
  res.json({ data: { id: Number(req.params.id), stage: nextStage } });
}));

module.exports = router;
