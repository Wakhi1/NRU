// Roles are the HRIS's OWN roles — "HR administrator", "Head of Department", "Employee", "System
// administrator", "Data & CRM officer", "Partner (external)", "System Analyst", OR any custom role
// an HR/System administrator has since created in the HRIS's own admin-manageable roles feature —
// never an FLMS-invented vocabulary, exactly the same decision SPTS made for the same reason: role
// assignment data already lives in the HRIS, so every consuming system maps its own permissions off
// that one shared role rather than keeping a parallel role of its own for the same person.
//
// BOTH screens and permissions are DB-backed and admin-editable (`role_permission` table — a screen
// grant is stored as the same kind of row as a capability grant, just under a `screen:<key>` string
// key instead of a bare capability key — see admin.routes.js's PUT /matrix). DEFAULT_SCREENS /
// DEFAULT_PERMISSIONS below are only the seed defaults for the 7 named HRIS roles this app ships
// knowing about; `discoverRoles()` auto-registers any OTHER role_name reconcile.js finds on a synced
// employee (a role added or renamed in the HRIS after this app was built) with an empty
// screens/permissions stub, so it shows up in the Users & permissions matrix ready to configure —
// never silently invisible just because it didn't exist when this file was written.
// `loadPermissionsFromDb()` overwrites each ROLES[key].screens/.permissions array IN PLACE at boot,
// after every admin edit, and after every HRIS reconcile, so every hasScreen()/hasPermission() call
// site stays synchronous with no per-request DB round-trip.
//
// What FLMS does NOT have: a separate FLMS role per employee, temporary elevation, or a
// title-matching "derive a role from a job title" heuristic. `trip.own.submit` (self-service trip
// request) and `voice.call` (VoIP) are granted to EVERY default role — anyone can ask for a vehicle
// or call a colleague — while fleet/fuel/workshop management and the live tracking map stay
// System-administrator-only by default, matching the "IT/control room hold the sensitive
// operational surfaces, nobody else by default" pattern SPTS established for live location.
const db = require('./db');
const logger = require('./logger');

const DEFAULT_SCREENS = {
  'System administrator': ['dashboard', 'fleet', 'trips', 'tracking', 'fuel', 'maintenance', 'drivers', 'mytrips', 'voip', 'admin', 'reports', 'account'],
  'HR administrator': ['dashboard', 'drivers', 'mytrips', 'voip', 'reports', 'account'],
  'Head of Department': ['dashboard', 'trips', 'drivers', 'mytrips', 'voip', 'reports', 'account'],
  'System Analyst': ['dashboard', 'fleet', 'drivers', 'mytrips', 'voip', 'reports', 'account'],
  'Data & CRM officer': ['mytrips', 'voip', 'account'],
  'Employee': ['mytrips', 'voip', 'account'],
  'Partner (external)': ['mytrips', 'voip', 'account'],
};

const DEFAULT_PERMISSIONS = {
  'System administrator': ['fleet.manage', 'trip.authorise', 'fuel.verify', 'maintenance.manage',
    'driver.manage', 'fleet.view.org', 'tracking.live.view', 'report.export', 'admin.roles', 'trip.own.submit', 'voice.call'],
  'HR administrator': ['driver.manage', 'report.export', 'trip.own.submit', 'voice.call'],
  'Head of Department': ['trip.authorise.dept', 'driver.view.dept', 'report.export', 'trip.own.submit', 'voice.call'],
  'System Analyst': ['fleet.view.org', 'driver.view.org', 'report.export', 'trip.own.submit', 'voice.call'],
  'Data & CRM officer': ['trip.own.submit', 'voice.call'],
  'Employee': ['trip.own.submit', 'voice.call'],
  'Partner (external)': ['trip.own.submit', 'voice.call'],
};

const ROLE_DESCRIPTIONS = {
  'System administrator': 'Organisation — full fleet, fuel and workshop administration',
  'HR administrator': 'Organisation-wide driver personnel records — no fleet/fuel operations',
  'Head of Department': 'Own department — trip requests, approvals and driver visibility',
  'System Analyst': 'Organisation, read/audit — fleet and driver visibility, no live tracking',
  'Data & CRM officer': 'Self only — own trip requests',
  'Employee': 'Self only — own trip requests',
  'Partner (external)': 'Self only — own trip requests',
};

const ROLES = {};
Object.keys(DEFAULT_SCREENS).forEach((k) => {
  ROLES[k] = { label: k, scope: ROLE_DESCRIPTIONS[k] || '', screens: [...DEFAULT_SCREENS[k]], permissions: [...(DEFAULT_PERMISSIONS[k] || [])] };
});

// Adds a stub entry (empty screens/permissions, ready to configure from the matrix) for any
// role_name reconcile.js has seen on a synced employee that isn't one of the 7 named roles above —
// a role created or renamed in the HRIS after this app shipped. Idempotent: does nothing for a role
// already known.
async function discoverRoles() {
  const rows = await db.query(`SELECT DISTINCT role_name FROM employee_cache WHERE role_name IS NOT NULL AND role_name <> ''`);
  const found = [];
  for (const r of rows) {
    if (!ROLES[r.role_name]) {
      ROLES[r.role_name] = { label: r.role_name, scope: 'Custom role synced from the HRIS — configure screens & permissions below', screens: [], permissions: [] };
      found.push(r.role_name);
    }
  }
  if (found.length) logger.info(`Discovered ${found.length} new HRIS role(s) not previously known to FLMS: ${found.join(', ')}`);
  return found;
}

// Screen keys are stored in the SAME role_permission table as capability keys, distinguished only
// by a `screen:` prefix — one generic grant mechanism, one admin matrix, rather than two parallel
// systems. A role with zero rows in role_permission (never configured, and not yet reconciled since
// last restart) keeps whatever was assigned at module-load time above (the hardcoded default for a
// known role, or the empty stub for a freshly-discovered one) rather than being wiped to nothing.
async function loadPermissionsFromDb() {
  await discoverRoles();
  const rows = await db.query('SELECT role_key, permission_key FROM role_permission');
  const byRole = {};
  rows.forEach((r) => { (byRole[r.role_key] ||= []).push(r.permission_key); });
  Object.keys(ROLES).forEach((k) => {
    if (!byRole[k]) return; // no DB rows yet for this role — keep the hardcoded/stub defaults live
    ROLES[k].screens = byRole[k].filter((p) => p.startsWith('screen:')).map((p) => p.slice(7));
    ROLES[k].permissions = byRole[k].filter((p) => !p.startsWith('screen:'));
  });
}

// `permissionKey` may be a bare capability key ("fleet.manage") or a screen grant ("screen:fleet")
// — both live in the same table, so this one function toggles either kind identically.
async function setPermission(roleKey, permissionKey, granted) {
  if (!ROLES[roleKey]) throw new Error(`Unknown role: ${roleKey}`);
  if (granted) {
    await db.query('INSERT IGNORE INTO role_permission (role_key, permission_key) VALUES (?, ?)', [roleKey, permissionKey]);
  } else {
    await db.query('DELETE FROM role_permission WHERE role_key = ? AND permission_key = ?', [roleKey, permissionKey]);
  }
  await loadPermissionsFromDb();
}

// One-time (idempotent) conversion of the hardcoded DEFAULT_SCREENS/DEFAULT_PERMISSIONS into real
// role_permission rows for the 7 named roles — called from seed.js. A role with rows already
// present is left untouched (INSERT IGNORE), so re-running this after an admin has customised the
// matrix never reverts their changes.
async function seedDefaultRolePermissions() {
  for (const [roleKey, screens] of Object.entries(DEFAULT_SCREENS)) {
    for (const screen of screens) {
      await db.query('INSERT IGNORE INTO role_permission (role_key, permission_key) VALUES (?, ?)', [roleKey, `screen:${screen}`]);
    }
  }
  for (const [roleKey, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
    for (const perm of perms) {
      await db.query('INSERT IGNORE INTO role_permission (role_key, permission_key) VALUES (?, ?)', [roleKey, perm]);
    }
  }
}

// Capabilities down the side, roles across the top — renders the Users & permissions matrix's
// "Capabilities" table.
const PERM_ROWS = [
  ['fleet.manage', 'Register and manage fleet vehicles'],
  ['fleet.view.org', 'View the full fleet register (read-only)'],
  ['trip.authorise', 'Authorise, reject or close any trip (organisation-wide)'],
  ['trip.authorise.dept', 'Authorise, reject or close a trip (own department)'],
  ['fuel.verify', 'Verify or reject fuel transactions'],
  ['maintenance.manage', 'Manage the workshop board (work orders)'],
  ['driver.manage', 'Edit driver licence and safety profile data'],
  ['driver.view.dept', 'View driver profiles (own department)'],
  ['driver.view.org', 'View driver profiles (organisation-wide)'],
  ['tracking.live.view', 'View live vehicle tracking'],
  ['report.export', 'Export reports'],
  ['trip.own.submit', 'Request a trip for oneself'],
  ['voice.call', 'Make and receive on-net VoIP calls'],
  ['admin.roles', 'Manage the permission matrix'],
];

const NAV = [
  ['Overview', [
    ['dashboard', 'Command overview'],
  ]],
  ['Fleet', [
    ['fleet', 'Fleet register'],
    ['trips', 'Trip authorisation'],
    ['tracking', 'Live tracking'],
  ]],
  ['Fuel & workshop', [
    ['fuel', 'Fuel log'],
    ['maintenance', 'Maintenance'],
  ]],
  ['Workforce', [
    ['drivers', 'Drivers'],
    ['mytrips', 'My trips'],
  ]],
  ['Communication', [
    ['voip', 'Calls'],
  ]],
  ['Administration', [
    ['admin', 'Users & permissions'],
    ['reports', 'Reports & export'],
  ]],
  ['Account', [
    ['account', 'Account & security'],
  ]],
];

// Every screen key + label, flattened from NAV — renders the Users & permissions matrix's "Screen
// access" table (same shape as PERM_ROWS, just for screens instead of capabilities). Built with
// reduce+concat rather than Array.prototype.flatMap (Node 11+ only) so this parses and runs on
// older Node runtimes too — several production hosts in this ecosystem predate that.
const SCREEN_ROWS = NAV.reduce((acc, entry) => acc.concat(entry[1]), []);

function roleScreens(k) { return (ROLES[k] && ROLES[k].screens) || []; }
function rolePermissions(k) { return (ROLES[k] && ROLES[k].permissions) || []; }

const hasScreen = (roleKeys, screen) => roleKeys.some((k) => roleScreens(k).includes(screen));
const hasPermission = (roleKeys, perm) => roleKeys.some((k) => rolePermissions(k).includes(perm));
const screensFor = (roleKeys) => {
  const all = roleKeys.reduce((acc, k) => acc.concat(roleScreens(k)), []);
  return Array.from(new Set(all));
};

module.exports = {
  ROLES, PERM_ROWS, SCREEN_ROWS, NAV, hasScreen, hasPermission, screensFor,
  DEFAULT_SCREENS, DEFAULT_PERMISSIONS, loadPermissionsFromDb, setPermission, discoverRoles, seedDefaultRolePermissions,
};
