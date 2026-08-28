// Seeds FLMS demo data. Reconciliation from the live HRIS is NOT idempotent-skipped (it's meant to
// be re-run), but fleet/trip/fuel/workshop data only seeds once (skipped if `vehicle` already has
// rows) so re-running this script doesn't duplicate demo data. No local credentials are seeded —
// FLMS holds no password of its own. Sign in with any of the HRIS's own seeded logins
// (sysadmin@nru.org, hr.admin@nru.org, finance.hod@nru.org, data.crm@nru.org, partner@nru.org,
// employee@nru.org — password Passw0rd!); an employee without an HRIS login cannot sign in to FLMS
// at all, by design. Note: the HRIS's own seed only issues a login to ONE Head of Department
// (finance.hod@nru.org) — Zanele Simelane (NRU-0008, Fleet Manager) exists in employee_cache as a
// real person and can be referenced as a trip/work-order authoriser below, but has no HRIS login of
// her own to sign in with; use sysadmin@nru.org or finance.hod@nru.org to exercise the app's
// authorisation screens end-to-end.
require('dotenv').config();
const db = require('../platform/db');
const { reconcile } = require('../platform/reconcile');
const { seedDefaultRolePermissions } = require('../platform/scope');
const logger = require('../platform/logger');

// Always safe to re-run (INSERT IGNORE per row) — an admin's later customisation of the matrix is
// never reverted, and re-running this after adding a new default screen/permission (like `voip`)
// backfills only the missing rows rather than requiring a full re-seed.
async function seedPermissions() {
  await seedDefaultRolePermissions();
  logger.info('Default permission matrix rows ensured (screens + capabilities)');
}

async function seedFuelPolicy() {
  await db.query(
    `INSERT INTO fuel_policy (id, block_offhours, require_odo_photo, geofence_stations, autoflag_overfill, push_to_accounting, variance_threshold_pct, idle_threshold_min, price_ceiling)
     VALUES (1, 1, 1, 0, 1, 1, 12, 15, 21.40)
     ON DUPLICATE KEY UPDATE id = id`
  );
}

// Known NRU-seeded employee_no's this demo data is written against (see HRIS's own seed.js) — every
// lookup below falls back gracefully to "any active employee" if a given id isn't present, so this
// script doesn't hard-fail against a differently-seeded HRIS instance.
async function resolveEmployee(preferredNo) {
  if (preferredNo) {
    const rows = await db.query('SELECT employee_no, full_legal_name, department FROM employee_cache WHERE employee_no = ?', [preferredNo]);
    if (rows[0]) return rows[0];
  }
  const fallback = await db.query(`SELECT employee_no, full_legal_name, department FROM employee_cache WHERE status = 'active' ORDER BY employee_no LIMIT 1`);
  return fallback[0] || null;
}

// Avoids optional-chaining (`x?.employee_no`) so this script parses on older Node runtimes too —
// several production hosts in this ecosystem run a Node version predating that syntax (V8/Node 14+).
function empNo(x) { return x ? x.employee_no : null; }

async function seedDriverProfiles() {
  const existing = await db.query('SELECT COUNT(*) AS n FROM driver_profile');
  if (existing[0].n > 0) {
    logger.info('Driver profiles already seeded — skipping');
    return;
  }
  const profiles = [
    { no: 'NRU-0007', licence: 'EC 4471', expiry: '2028-03-15', score: 92, note: 'No incidents in 18 months. Certified defensive driving.' },
    { no: 'NRU-0011', licence: 'EB 1180', expiry: '2027-11-20', score: 88, note: 'Two speeding notifications this quarter.' },
    { no: 'NRU-0009', licence: 'EC1 9021', expiry: '2029-07-08', score: 74, note: 'Harsh braking above fleet average — coaching scheduled.' },
    { no: 'NRU-0016', licence: 'EB 5540', expiry: '2027-02-12', score: 95, note: 'Top of the efficiency league three months running.' },
    { no: 'NRU-0015', licence: 'EC 7712', expiry: '2026-09-30', score: 81, note: 'Licence expires in 30 days — renewal reminder issued.' },
    { no: 'NRU-0010', licence: 'EB 2298', expiry: '2028-05-18', score: 86, note: 'Stores runs only. Idling time slightly elevated.' },
  ];
  let count = 0;
  for (const p of profiles) {
    const emp = await resolveEmployee(p.no);
    if (!emp) continue;
    await db.query(
      `INSERT IGNORE INTO driver_profile (employee_no, licence_no, licence_expiry, safety_score, note) VALUES (?,?,?,?,?)`,
      [emp.employee_no, p.licence, p.expiry, p.score, p.note]
    );
    count++;
  }
  logger.info(`Seeded ${count} driver profiles`);
}

const AREA_ESWATINI = { lat: -26.4, lng: 31.2 }; // roughly central Eswatini — Mbabane/Manzini corridor

async function seedFleet() {
  const existing = await db.query('SELECT COUNT(*) AS n FROM vehicle');
  if (existing[0].n > 0) {
    logger.info('Fleet already seeded — skipping vehicles/trips/fuel/work orders');
    return;
  }

  const driverA = await resolveEmployee('NRU-0007'); // Musa Fakudze — Driver
  const driverB = await resolveEmployee('NRU-0011'); // Sabelo Motsa — Driver
  const fieldA = await resolveEmployee('NRU-0009');  // Andile Ngwenya
  const fieldB = await resolveEmployee('NRU-0016');  // Fikile Dlamini
  const fieldC = await resolveEmployee('NRU-0015');  // Bhekani Maseko
  const fieldD = await resolveEmployee('NRU-0010');  // Nokuthula Mabuza
  const fleetHod = await resolveEmployee('NRU-0008'); // Zanele Simelane — Fleet HOD (authoriser)

  // `category` separates the operational pool (dispatched for field work, tracked live) from
  // executive vehicles (assigned to leadership) — see the `vehicle.category` column comment in
  // schema.sql. Only the Land Cruiser is executive here, matching its 'Executive' cost centre.
  const vehicles = [
    { reg: 'SD 412 AM', model: 'Toyota Hilux 2.4 D4D', type: 'pickup', category: 'work', dept: 'Field Operations', driver: driverA, status: 'On trip', odo: 148320, fuel: 62, eff: 9.8, target: 9.2, tank: 80, note: '12 Sep 2026', date: '2026-09-12' },
    { reg: 'SD 118 BS', model: 'Toyota Land Cruiser', type: '4x4', category: 'executive', dept: 'Executive', driver: fieldC, status: 'Available', odo: 92140, fuel: 88, eff: 12.4, target: 11.5, tank: 138, note: '03 Oct 2026', date: '2026-10-03' },
    { reg: 'SD 907 CM', model: 'Isuzu NQR Truck', type: 'truck', category: 'work', dept: 'Logistics', driver: driverB, status: 'On trip', odo: 214600, fuel: 34, eff: 24.1, target: 22.0, tank: 200, note: '21 Aug 2026', date: '2026-08-21' },
    { reg: 'SD 233 DM', model: 'Nissan NP200', type: 'pickup', category: 'work', dept: 'Procurement', driver: fieldD, status: 'Workshop', odo: 67890, fuel: 18, eff: 8.1, target: 8.5, tank: 50, note: 'In workshop', date: null },
    { reg: 'SD 550 EM', model: 'Toyota Quantum 14s', type: 'bus', category: 'work', dept: 'Staff Transport', driver: fieldC, status: 'Available', odo: 131450, fuel: 71, eff: 13.9, target: 13.0, tank: 70, note: '28 Aug 2026', date: '2026-08-28' },
    { reg: 'SD 044 FM', model: 'Ford Ranger XLT', type: 'pickup', category: 'work', dept: 'Field Operations', driver: fieldB, status: 'On trip', odo: 45210, fuel: 55, eff: 10.9, target: 9.8, tank: 80, note: '15 Nov 2026', date: '2026-11-15' },
    { reg: 'SD 781 GM', model: 'Hyundai H100', type: 'van', category: 'work', dept: 'Stores', driver: fieldD, status: 'Available', odo: 98330, fuel: 44, eff: 11.2, target: 11.0, tank: 65, note: '09 Sep 2026', date: '2026-09-09' },
    { reg: 'SD 620 HM', model: 'Isuzu D-Max', type: 'pickup', category: 'work', dept: 'IT Department', driver: null, status: 'Grounded', odo: 176900, fuel: 9, eff: 15.7, target: 10.4, tank: 76, note: 'Overdue 1 400 km', date: null },
  ];

  const vehicleIds = {};
  for (const v of vehicles) {
    const result = await db.query(
      `INSERT INTO vehicle (reg_no, model, vehicle_type, category, department, assigned_driver_employee_no, status,
         odometer_km, fuel_pct, efficiency_l100km, target_l100km, tank_capacity_l, next_service_note, next_service_date,
         current_lat, current_lng, heading_deg, speed_kmh, last_ping_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [v.reg, v.model, v.type, v.category, v.dept, empNo(v.driver), v.status, v.odo, v.fuel, v.eff, v.target, v.tank, v.note, v.date,
        AREA_ESWATINI.lat + (Math.random() - 0.5) * 0.3, AREA_ESWATINI.lng + (Math.random() - 0.5) * 0.3,
        Math.floor(Math.random() * 360), v.status === 'On trip' ? 40 + Math.floor(Math.random() * 40) : 0]
    );
    vehicleIds[v.reg] = result.insertId;
  }
  logger.info(`Seeded ${vehicles.length} vehicles`);

  const trips = [
    { code: 'TRP-2609', from: 'Mbabane HQ', to: 'Manzini Depot', reg: 'SD 412 AM', driver: driverA, req: fieldA, km: 42, purpose: 'Field data collection', status: 'In progress', cost: 118 },
    { code: 'TRP-2608', from: 'Mbabane HQ', to: 'Siteki Clinic', reg: 'SD 907 CM', driver: driverB, req: fieldB, km: 168, purpose: 'Supplies delivery', status: 'In progress', cost: 902 },
    { code: 'TRP-2607', from: 'Manzini Depot', to: 'Nhlangano', reg: 'SD 044 FM', driver: fieldB, req: fieldC, km: 121, purpose: 'Enumerator drop-off', status: 'Pending', cost: null },
    { code: 'TRP-2606', from: 'Mbabane HQ', to: 'Piggs Peak', reg: 'SD 550 EM', driver: fieldC, req: fieldD, km: 96, purpose: 'Staff transport', status: 'Completed', cost: 421 },
    { code: 'TRP-2605', from: 'Mbabane HQ', to: 'Big Bend', reg: 'SD 118 BS', driver: fieldC, req: fieldA, km: 184, purpose: 'Executive site visit', status: 'Completed', cost: 736 },
    { code: 'TRP-2604', from: 'Stores', to: 'Lobamba', reg: 'SD 781 GM', driver: fieldD, req: fieldD, km: 28, purpose: 'Equipment transfer', status: 'Completed', cost: 96 },
    { code: 'TRP-2603', from: 'Manzini Depot', to: 'Mbabane HQ', reg: 'SD 412 AM', driver: driverA, req: fieldA, km: 44, purpose: 'Return leg', status: 'Completed', cost: 124 },
  ];
  for (const t of trips) {
    const authorised = t.status !== 'Pending';
    await db.query(
      `INSERT INTO trip (trip_code, origin, destination, vehicle_id, driver_employee_no, requested_by_employee_no,
         distance_km, purpose, status, cost, authorised_by_employee_no, authorised_at, closed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [t.code, t.from, t.to, vehicleIds[t.reg], empNo(t.driver), empNo(t.req || fieldA),
        t.km, t.purpose, t.status, t.cost, authorised ? empNo(fleetHod) : null,
        authorised ? new Date() : null, t.status === 'Completed' ? new Date() : null]
    );
  }
  logger.info(`Seeded ${trips.length} trips`);

  const fuelRows = [
    { reg: 'SD 907 CM', driver: driverB, station: 'Galp Manzini', litres: 92.4, rate: 21.4, odo: 214600, flag: 'Verified' },
    { reg: 'SD 412 AM', driver: driverA, station: 'Total Mbabane', litres: 48.2, rate: 21.4, odo: 148320, flag: 'Verified' },
    { reg: 'SD 620 HM', driver: null, station: 'Puma Matsapha', litres: 71.0, rate: 21.4, odo: 176420, flag: 'Exception' },
    { reg: 'SD 044 FM', driver: fieldB, station: 'Engen Nhlangano', litres: 55.6, rate: 21.9, odo: 45120, flag: 'Verified' },
    { reg: 'SD 550 EM', driver: fieldC, station: 'Total Mbabane', litres: 44.1, rate: 21.4, odo: 131280, flag: 'Pending' },
    { reg: 'SD 118 BS', driver: fieldC, station: 'Galp Big Bend', litres: 96.8, rate: 21.9, odo: 92010, flag: 'Verified' },
    { reg: 'SD 781 GM', driver: fieldD, station: 'Puma Matsapha', litres: 38.5, rate: 21.4, odo: 98200, flag: 'Verified' },
    { reg: 'SD 907 CM', driver: driverB, station: 'Engen Siteki', litres: 118.9, rate: 21.9, odo: 214180, flag: 'Exception' },
  ];
  for (const f of fuelRows) {
    const verified = f.flag === 'Verified';
    await db.query(
      `INSERT INTO fuel_transaction (vehicle_id, driver_employee_no, station, litres, rate, odometer_km, flag, verified_by_employee_no, verified_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [vehicleIds[f.reg], empNo(f.driver), f.station, f.litres, f.rate, f.odo, f.flag,
        verified ? empNo(fleetHod) : null, verified ? new Date() : null]
    );
  }
  logger.info(`Seeded ${fuelRows.length} fuel transactions`);

  const workOrders = [
    { code: 'WO-1182', title: '45 000 km major service', reg: 'SD 044 FM', priority: 'Routine', stage: 0, cost: 4200, due: 'Due 15 Aug' },
    { code: 'WO-1183', title: 'Front brake pads + discs', reg: 'SD 233 DM', priority: 'High', stage: 1, cost: 2850, due: 'Due 12 Aug' },
    { code: 'WO-1184', title: 'Injector diagnostics — high burn', reg: 'SD 620 HM', priority: 'Critical', stage: 1, cost: 6100, due: 'Overdue' },
    { code: 'WO-1185', title: 'Tyre replacement ×4', reg: 'SD 907 CM', priority: 'High', stage: 0, cost: 9800, due: 'Due 21 Aug' },
    { code: 'WO-1180', title: 'Annual roadworthy inspection', reg: 'SD 550 EM', priority: 'Routine', stage: 2, cost: 1150, due: 'Closed 04 Aug' },
    { code: 'WO-1181', title: 'Aircon regas', reg: 'SD 118 BS', priority: 'Routine', stage: 2, cost: 980, due: 'Closed 05 Aug' },
  ];
  for (const w of workOrders) {
    await db.query(
      `INSERT INTO work_order (wo_code, vehicle_id, title, priority, stage, cost, workshop_name, due_note, authorised_by_employee_no, closed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [w.code, vehicleIds[w.reg], w.title, w.priority, w.stage, w.cost, 'Motor Centre Manzini', w.due,
        empNo(fleetHod), w.stage === 2 ? new Date() : null]
    );
  }
  logger.info(`Seeded ${workOrders.length} work orders`);
}

async function seed() {
  logger.info('Reconciling from HRIS...');
  const result = await reconcile();
  logger.info(`Reconciled ${result.employees} employees`);

  await seedFuelPolicy();
  await seedPermissions();
  await seedDriverProfiles();
  await seedFleet();

  logger.info('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  logger.error('Seed failed:', err.message);
  process.exit(1);
});
