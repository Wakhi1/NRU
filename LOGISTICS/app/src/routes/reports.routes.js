// Reports & export — a handful of real aggregate queries against the fleet/trip/fuel/workshop
// schema, filterable by period. Reading any report just needs the `reports` screen; exporting a
// CSV additionally requires `report.export`.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest } = require('../platform/errors');
const { requireAuth, requireScreen, requirePermission } = require('../platform/auth');

const router = express.Router();
router.use(requireAuth, requireScreen('reports'));

// Builds a WHERE fragment (with its own bound params) restricting `column` to the requested
// period. `all_time` returns a harmless `1=1` rather than omitting the clause entirely, so every
// report's WHERE/ON can splice this in unconditionally.
function periodClause(column, period) {
  if (period === 'last_month') {
    return { sql: `${column} >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m-01') AND ${column} < DATE_FORMAT(NOW(), '%Y-%m-01')`, params: [] };
  }
  if (period === 'all_time') return { sql: '1=1', params: [] };
  return { sql: `${column} >= DATE_FORMAT(NOW(), '%Y-%m-01')`, params: [] }; // this_month (default)
}

const PRIORITY_RANK_TO_LABEL = { 3: 'Critical', 2: 'High', 1: 'Routine' };

const REPORTS = {
  fuel_by_vehicle: {
    label: 'Fuel consumption by vehicle',
    columns: [
      { key: 'reg_no', label: 'Vehicle' }, { key: 'model', label: 'Model' },
      { key: 'litres', label: 'Litres' }, { key: 'cost', label: 'Cost' },
    ],
    async query(period) {
      const pc = periodClause('f.transacted_at', period);
      const rows = await db.query(
        `SELECT v.reg_no, v.model, COALESCE(SUM(f.litres),0) AS litres, COALESCE(SUM(f.litres*f.rate),0) AS cost
         FROM vehicle v LEFT JOIN fuel_transaction f ON f.vehicle_id = v.id AND ${pc.sql}
         GROUP BY v.id ORDER BY litres DESC`,
        pc.params
      );
      return rows.map((r) => ({ ...r, litres: Number(r.litres), cost: Number(r.cost) }));
    },
  },
  trip_cost_by_department: {
    label: 'Trip cost by department',
    columns: [
      { key: 'department', label: 'Department' }, { key: 'trip_count', label: 'Trips' },
      { key: 'total_km', label: 'Total km' }, { key: 'total_cost', label: 'Total cost' },
    ],
    async query(period) {
      const pc = periodClause('t.closed_at', period);
      const rows = await db.query(
        `SELECT COALESCE(v.department, 'Unassigned') AS department, COUNT(*) AS trip_count,
                COALESCE(SUM(t.distance_km),0) AS total_km, COALESCE(SUM(t.cost),0) AS total_cost
         FROM trip t LEFT JOIN vehicle v ON v.id = t.vehicle_id
         WHERE t.status = 'Completed' AND ${pc.sql}
         GROUP BY department ORDER BY total_cost DESC`,
        pc.params
      );
      return rows.map((r) => ({ ...r, total_km: Number(r.total_km), total_cost: Number(r.total_cost) }));
    },
  },
  workshop_spend: {
    label: 'Workshop spend',
    columns: [
      { key: 'reg_no', label: 'Vehicle' }, { key: 'model', label: 'Model' },
      { key: 'open_work_orders', label: 'Open work orders' }, { key: 'total_cost', label: 'Total cost' },
      { key: 'worst_open_priority', label: 'Worst open priority' },
    ],
    async query(period) {
      const pc = periodClause('w.opened_at', period);
      const rows = await db.query(
        `SELECT v.reg_no, v.model,
                SUM(CASE WHEN w.stage < 2 THEN 1 ELSE 0 END) AS open_work_orders,
                COALESCE(SUM(w.cost), 0) AS total_cost,
                MAX(CASE WHEN w.stage < 2 THEN CASE w.priority WHEN 'Critical' THEN 3 WHEN 'High' THEN 2 ELSE 1 END END) AS worst_open_rank
         FROM vehicle v LEFT JOIN work_order w ON w.vehicle_id = v.id AND ${pc.sql}
         GROUP BY v.id
         HAVING open_work_orders > 0 OR total_cost > 0
         ORDER BY total_cost DESC`,
        pc.params
      );
      return rows.map((r) => ({
        reg_no: r.reg_no, model: r.model, open_work_orders: Number(r.open_work_orders), total_cost: Number(r.total_cost),
        worst_open_priority: PRIORITY_RANK_TO_LABEL[r.worst_open_rank] || '—',
      }));
    },
  },
  fleet_utilisation: {
    label: 'Fleet utilisation',
    columns: [
      { key: 'reg_no', label: 'Vehicle' }, { key: 'model', label: 'Model' }, { key: 'department', label: 'Department' },
      { key: 'status', label: 'Status' }, { key: 'odometer_km', label: 'Odometer (km)' }, { key: 'trips_this_period', label: 'Trips this period' },
    ],
    async query(period) {
      const pc = periodClause('t.closed_at', period);
      const rows = await db.query(
        `SELECT v.reg_no, v.model, v.department, v.status, v.odometer_km,
                (SELECT COUNT(*) FROM trip t WHERE t.vehicle_id = v.id AND t.status = 'Completed' AND ${pc.sql}) AS trips_this_period
         FROM vehicle v ORDER BY v.reg_no`,
        pc.params
      );
      return rows.map((r) => ({ ...r, department: r.department || '—', trips_this_period: Number(r.trips_this_period) }));
    },
  },
};

const PERIODS = ['this_month', 'last_month', 'all_time'];

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/:type', asyncHandler(async (req, res) => {
  const report = REPORTS[req.params.type];
  if (!report) throw badRequest(`Unknown report type "${req.params.type}"`);
  const period = PERIODS.includes(req.query.period) ? req.query.period : 'this_month';
  const rows = await report.query(period);
  res.json({ data: { columns: report.columns, rows, period, label: report.label } });
}));

router.get('/:type/export', requirePermission('report.export'), asyncHandler(async (req, res) => {
  const report = REPORTS[req.params.type];
  if (!report) throw badRequest(`Unknown report type "${req.params.type}"`);
  const period = PERIODS.includes(req.query.period) ? req.query.period : 'this_month';
  const rows = await report.query(period);

  const header = report.columns.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((r) => report.columns.map((c) => csvEscape(r[c.key])).join(','));
  const csv = [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-${period}.csv"`);
  res.send(csv);
}));

module.exports = router;
