// Command overview — organisation-wide KPIs. No department scoping here (unlike trips.routes.js's
// authorisation queue) since this is a summary dashboard, not an action surface — a Head of
// Department sees the same shape a System administrator does, just without the screens/actions
// their role doesn't grant elsewhere in the app.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler } = require('../platform/errors');
const { requireAuth, requireScreen } = require('../platform/auth');

const router = express.Router();
router.use(requireAuth, requireScreen('dashboard'));

router.get('/', asyncHandler(async (req, res) => {
  const [[fleetTotal], [fleetAvailable], [pendingTrips], [activeTrips], [openWork], [fuelMonth], [exceptions], topConsumers] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM vehicle`),
    db.query(`SELECT COUNT(*) AS n FROM vehicle WHERE status NOT IN ('Workshop','Grounded')`),
    db.query(`SELECT COUNT(*) AS n FROM trip WHERE status = 'Pending'`),
    db.query(`SELECT COUNT(*) AS n FROM trip WHERE status = 'In progress'`),
    db.query(`SELECT COUNT(*) AS n FROM work_order WHERE stage < 2`),
    db.query(`SELECT COALESCE(SUM(litres),0) AS litres, COALESCE(SUM(litres*rate),0) AS cost FROM fuel_transaction WHERE transacted_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`),
    db.query(`SELECT COUNT(*) AS n FROM fuel_transaction WHERE flag = 'Exception'`),
    db.query(
      `SELECT v.reg_no, v.model, COALESCE(SUM(f.litres),0) AS litres, COALESCE(SUM(f.litres*f.rate),0) AS cost
       FROM vehicle v LEFT JOIN fuel_transaction f ON f.vehicle_id = v.id AND f.transacted_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
       GROUP BY v.id ORDER BY litres DESC LIMIT 5`
    ),
  ]);

  const statusCounts = await db.query(`SELECT status, COUNT(*) AS n FROM vehicle GROUP BY status`);

  res.json({
    data: {
      fleetTotal: fleetTotal.n, fleetAvailable: fleetAvailable.n,
      pendingTrips: pendingTrips.n, activeTrips: activeTrips.n, openWorkOrders: openWork.n,
      fuelLitresThisMonth: Number(fuelMonth.litres), fuelCostThisMonth: Number(fuelMonth.cost),
      fuelExceptions: exceptions.n,
      statusCounts,
      topConsumers,
    },
  });
}));

module.exports = router;
