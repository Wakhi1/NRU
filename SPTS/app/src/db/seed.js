// Seeds SPTS demo data. Reconciliation from the live HRIS is NOT idempotent-skipped (it's meant to
// be re-run — that's the whole point of the nightly job), but zones/devices/assignments only seed
// once (skipped if `zone` already has rows) so re-running this script doesn't duplicate fleet data.
// No local credentials are seeded — SPTS holds no password of its own. Sign in with any of the
// HRIS's own seeded logins (sysadmin@nru.org, hr.admin@nru.org, finance.hod@nru.org,
// data.crm@nru.org, partner@nru.org, employee@nru.org — password Passw0rd!); an employee without
// an HRIS login cannot sign in to SPTS at all, by design.
require('dotenv').config();
const db = require('../platform/db');
const { reconcile } = require('../platform/reconcile');
const { DEFAULT_PERMISSIONS } = require('../platform/scope');
const logger = require('../platform/logger');

async function seedPermissions() {
  const existing = await db.query('SELECT COUNT(*) AS n FROM role_permission');
  if (existing[0].n > 0) {
    logger.info('Permission matrix already seeded — skipping');
    return;
  }
  for (const [roleKey, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
    for (const perm of perms) {
      await db.query('INSERT IGNORE INTO role_permission (role_key, permission_key) VALUES (?, ?)', [roleKey, perm]);
    }
  }
  logger.info('Seeded default permission matrix');
}

const AREA = {
  Manzini: [-26.4988, 31.3800],
  Matsapha: [-26.5167, 31.3060],
  Mbabane: [-26.3167, 31.1333],
};

async function seedPolicy() {
  await db.query(
    `INSERT INTO policy (id, default_radius_m, accuracy_ceiling_m, recheck_hours, offline_behavior)
     VALUES (1, 150, 50, 4, 'Allow — confirm at next sync')
     ON DUPLICATE KEY UPDATE id = id`
  );
}

async function seedZones() {
  const existing = await db.query('SELECT COUNT(*) AS n FROM zone');
  if (existing[0].n > 0) {
    logger.info('Zones already seeded — skipping');
    return await db.query('SELECT * FROM zone');
  }
  const zones = [
    { code: 'GF-01', name: 'Manzini CBD', kind: 'field', at: AREA.Manzini, radius_m: 2100, rule_type: 'exit_alert', team_label: 'Field Operations' },
    { code: 'GF-02', name: 'Matsapha Zone', kind: 'field', at: AREA.Matsapha, radius_m: 2600, rule_type: 'exit_alert', team_label: 'Field Operations' },
    { code: 'HQ-01', name: 'HQ Mbabane campus', kind: 'office', at: AREA.Mbabane, radius_m: 600, rule_type: 'checkin_required', team_label: 'Head office staff' },
    { code: 'DEP-01', name: 'Matsapha depot', kind: 'depot', at: [AREA.Matsapha[0] + 0.01, AREA.Matsapha[1] + 0.01], radius_m: 800, rule_type: 'dwell_alert', dwell_minutes: 60, team_label: 'Fleet & drivers' },
  ];
  for (const z of zones) {
    await db.query(
      `INSERT INTO zone (code, name, kind, center_lat, center_lng, radius_m, rule_type, dwell_minutes, team_label, active)
       VALUES (?,?,?,?,?,?,?,?,?,1)`,
      [z.code, z.name, z.kind, z.at[0], z.at[1], z.radius_m, z.rule_type, z.dwell_minutes || null, z.team_label]
    );
  }
  logger.info(`Seeded ${zones.length} zones`);
  return await db.query('SELECT * FROM zone');
}

function zoneForDept(department, zonesByCode) {
  if (department === 'Field Operations') return zonesByCode['GF-01'];
  if (department === 'Fleet & Logistics') return zonesByCode['DEP-01'];
  return zonesByCode['HQ-01'];
}

function deviceKindForDept(department) {
  if (department === 'Field Operations') return 'field';
  if (department === 'Fleet & Logistics') return 'vehicle';
  return 'office';
}

async function seedDevicesAndAssignments(zones) {
  const zonesByCode = Object.fromEntries(zones.map((z) => [z.code, z]));
  const existing = await db.query('SELECT COUNT(*) AS n FROM device');
  if (existing[0].n > 0) {
    logger.info('Devices already seeded — skipping');
    return;
  }
  const employees = await db.query(`SELECT employee_no, department FROM employee_cache WHERE status = 'active'`);
  for (const emp of employees) {
    const kind = deviceKindForDept(emp.department);
    const assetTag = `SPTS-${emp.employee_no.replace('NRU-', '')}`;
    const result = await db.query(
      `INSERT INTO device (asset_tag, kind, hw_model, os_version, status, battery_pct, signal_bars, assigned_employee_no)
       VALUES (?,?,?,?, 'idle', ?, ?, ?)`,
      [assetTag, kind, kind === 'field' ? 'Samsung A14' : kind === 'vehicle' ? 'Nokia G22' : 'Samsung A34',
        'Android 14', 60 + Math.floor(Math.random() * 40), 3 + Math.floor(Math.random() * 3), emp.employee_no]
    );
    const zone = zoneForDept(emp.department, zonesByCode);
    if (zone) {
      await db.query('INSERT INTO zone_assignment (zone_id, employee_no, device_id) VALUES (?,?,?)', [zone.id, emp.employee_no, result.insertId]);
    }
  }
  logger.info(`Seeded ${employees.length} devices + zone assignments`);
}

async function seed() {
  logger.info('Reconciling from HRIS...');
  const result = await reconcile();
  logger.info(`Reconciled ${result.employees} employees`);

  await seedPolicy();
  await seedPermissions();
  const zones = await seedZones();
  await seedDevicesAndAssignments(zones);

  logger.info('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  logger.error('Seed failed:', err.message);
  process.exit(1);
});
