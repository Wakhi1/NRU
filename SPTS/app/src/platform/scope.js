// Roles are the HRIS's OWN roles — "HR administrator", "Head of Department", "Employee", "System
// administrator", "Data & CRM officer", "Partner (external)", "System Analyst" — never an
// SPTS-invented vocabulary. An explicit later decision: "role assignment data is already in
// HRIS... all this data should come with integrations." Permissions are DB-backed and
// admin-editable (`role_permission` table, see admin.routes.js's PUT /matrix) — DEFAULT_PERMISSIONS
// below is only the seed default. `loadPermissionsFromDb()` overwrites each ROLES[key].permissions
// array IN PLACE at boot and after every admin edit, so every hasPermission()/requirePermission()
// call site stays synchronous with no per-request DB round-trip.
//
// What SPTS does NOT have anymore: a separate SPTS role per employee (role_assignment), temporary
// elevation, or any title-matching "derive a role from a job title" heuristic. Work/location
// assignment ("who's checked in against which zone, for what kind of work") is a completely
// different, still very much SPTS-owned concept — see zone_assignment — deliberately kept apart
// from role/permission so a Head of IT never has to invent a fake "role" just to describe where
// someone works.
//
// `checkin.own.submit` (self-service clock-in) is granted to EVERY role — "employees can have the
// clock-in feature, like most apps" — and live location / geofence management / the handset
// registry / admin.roles stay System-administrator-only, matching the architecture doc's "IT and
// control room hold live location, nobody else by default" (HRIS has no separate control-room role,
// so System administrator covers that ground here).
const db = require('./db');

const DEFAULT_PERMISSIONS = {
  'System administrator': ['location.live.view', 'location.history.view', 'checkin.override.grant', 'geofence.manage',
    'device.manage', 'staff.view.org', 'report.export', 'aggregate.view', 'admin.roles', 'checkin.own.submit'],
  'HR administrator': ['staff.view.org', 'report.export', 'aggregate.view', 'checkin.own.submit'],
  'Head of Department': ['staff.view.dept', 'report.export', 'checkin.own.submit'],
  'System Analyst': ['location.history.view', 'staff.view.org', 'report.export', 'aggregate.view', 'checkin.own.submit'],
  'Data & CRM officer': ['checkin.own.submit'],
  'Employee': ['checkin.own.submit'],
  'Partner (external)': ['checkin.own.submit'],
};

const ROLES = {
  'System administrator': {
    label: 'System administrator', scope: 'Organisation — full technical administration',
    screens: ['map', 'devices', 'zones', 'history', 'staff', 'admin', 'exec', 'reports', 'myshift', 'account'],
  },
  'HR administrator': {
    label: 'HR administrator', scope: 'Organisation-wide staff/device coverage — no live location',
    screens: ['staff', 'exec', 'reports', 'myshift', 'account'],
  },
  'Head of Department': {
    label: 'Head of Department', scope: 'Own department — progress only, no live location',
    screens: ['staff', 'reports', 'myshift', 'account'],
  },
  'System Analyst': {
    label: 'System Analyst', scope: 'Organisation, read/audit — location history but not live position',
    screens: ['history', 'staff', 'exec', 'reports', 'myshift', 'account'],
  },
  'Data & CRM officer': {
    label: 'Data & CRM officer', scope: 'Self only',
    screens: ['myshift', 'account'],
  },
  'Employee': {
    label: 'Employee', scope: 'Self only — own assignment, own handset',
    screens: ['myshift', 'account'],
  },
  'Partner (external)': {
    label: 'Partner (external)', scope: 'Self only',
    screens: ['myshift', 'account'],
  },
};

Object.keys(ROLES).forEach((k) => { ROLES[k].permissions = [...(DEFAULT_PERMISSIONS[k] || [])]; });

async function loadPermissionsFromDb() {
  const rows = await db.query('SELECT role_key, permission_key FROM role_permission');
  if (rows.length === 0) return; // not seeded yet — keep the hardcoded defaults live
  const byRole = {};
  rows.forEach((r) => { (byRole[r.role_key] ||= []).push(r.permission_key); });
  Object.keys(ROLES).forEach((k) => { ROLES[k].permissions = byRole[k] || []; });
}

async function setPermission(roleKey, permissionKey, granted) {
  if (!ROLES[roleKey]) throw new Error(`Unknown role: ${roleKey}`);
  if (granted) {
    await db.query('INSERT IGNORE INTO role_permission (role_key, permission_key) VALUES (?, ?)', [roleKey, permissionKey]);
  } else {
    await db.query('DELETE FROM role_permission WHERE role_key = ? AND permission_key = ?', [roleKey, permissionKey]);
  }
  await loadPermissionsFromDb();
}

// Capabilities down the side, roles across the top — renders the Users & permissions matrix.
const PERM_ROWS = [
  ['location.live.view', 'Live location of any handset'],
  ['location.history.view', 'Location history / playback'],
  ['checkin.override.grant', 'Grant a check-in override'],
  ['geofence.manage', 'Manage geofences & zones'],
  ['device.manage', 'Manage the handset registry'],
  ['staff.view.org', 'View all-employee device coverage (org-wide)'],
  ['staff.view.dept', 'View device coverage (own department)'],
  ['aggregate.view', 'View organisation aggregates'],
  ['report.export', 'Export reports'],
  ['checkin.own.submit', 'Confirm own location at shift check-in'],
  ['admin.roles', 'Manage the permission matrix'],
];

const NAV = [
  ['Monitoring', [
    ['map', 'Live map'],
    ['devices', 'Handsets'],
    ['zones', 'Geofences & alerts'],
    ['history', 'Location history'],
  ]],
  ['Workforce', [
    ['staff', 'All employee devices'],
    ['myshift', 'My shift check-in'],
  ]],
  ['Administration', [
    ['admin', 'Users & permissions'],
    ['exec', 'Executive overview'],
    ['reports', 'Reports & export'],
  ]],
  ['Account', [
    ['account', 'Account & security'],
  ]],
];

const hasScreen = (roleKeys, screen) => roleKeys.some((k) => (ROLES[k]?.screens || []).includes(screen));
const hasPermission = (roleKeys, perm) => roleKeys.some((k) => (ROLES[k]?.permissions || []).includes(perm));
const screensFor = (roleKeys) => [...new Set(roleKeys.flatMap((k) => ROLES[k]?.screens || []))];

module.exports = {
  ROLES, PERM_ROWS, NAV, hasScreen, hasPermission, screensFor,
  DEFAULT_PERMISSIONS, loadPermissionsFromDb, setPermission,
};
