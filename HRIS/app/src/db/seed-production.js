// Clean production seed: roles + the full permission matrix (RBAC needs all 6 roles to exist
// regardless of how many people are in the system) plus exactly two real accounts — System
// administrator and HR administrator — and nothing else. No demo departments, employees, leave,
// payroll, recruitment, CRM, or any other sample records. The org can add its own departments,
// employees, leave types, benefit plans, etc. through the app's own admin UI after first login.
// Idempotent the same way seed.js is: skips entirely if `person` already has rows.
//
// Usage: node src/db/seed-production.js
// Change SYSADMIN/HR_ADMIN below (name, email) to the real people before running, or edit their
// profile from the app afterwards — either works, this is just the initial login.
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const env = require('../config/env');

const SEED_PASSWORD = 'Passw0rd!'; // change on first login — see Settings > Security

const MODULES = [
  'people', 'org', 'worktime', 'attendance', 'leave', 'benefits', 'payroll',
  'recruitment', 'performance', 'succession', 'training', 'intake', 'crm', 'reports', 'voip', 'assets',
];

const ROLES = [
  { name: 'HR administrator', description: 'Full read/write across HR modules for the whole organisation.' },
  { name: 'Head of Department', description: 'Manages their department: team-scoped read/write, approves for direct reports.' },
  { name: 'Data & CRM officer', description: 'Owns external data intake and partner/programme records.' },
  { name: 'Employee', description: 'Self-service access plus read on shared structures.' },
  { name: 'System administrator', description: 'Full technical administration, including access control.' },
  { name: 'Partner (external)', description: 'External partner with narrow, programme-scoped read access.' },
];

// Same matrix as seed.js — kept identical so behavior doesn't diverge between a demo and a
// production install. If you only want two roles to exist at all, trim ROLES/PERM_MATRIX
// together, but the app's own Settings > Roles screen can add/remove roles later regardless.
const PERM_MATRIX = {
  'HR administrator': {
    people: ['CRUD', 'organisation'], org: ['CRUD', 'organisation'], worktime: ['CRUD', 'organisation'],
    attendance: ['CRUD', 'organisation'], leave: ['CRUD', 'organisation'], benefits: ['CRUD', 'organisation'],
    payroll: ['CRUD', 'organisation'], recruitment: ['CRUD', 'organisation'], performance: ['CRUD', 'organisation'],
    succession: ['CRUD', 'organisation'], training: ['CRUD', 'organisation'], intake: ['CRUD', 'organisation'],
    crm: ['CRUD', 'organisation'], reports: ['R', 'organisation'], voip: ['CRUD', 'self'], assets: ['CRUD', 'organisation'],
  },
  'Head of Department': {
    people: ['RU', 'department'], org: ['R', 'department'], worktime: ['RU', 'department'],
    attendance: ['CRU', 'department'], leave: ['CRU', 'department'], benefits: ['R', 'department'],
    payroll: ['R', 'department'], recruitment: ['CRU', 'department'], performance: ['CRU', 'department'],
    succession: ['RU', 'department'], training: ['RU', 'department'], intake: ['-', 'self'],
    crm: ['-', 'self'], reports: ['R', 'department'], voip: ['CRUD', 'self'], assets: ['CRU', 'self'],
  },
  'Data & CRM officer': {
    people: ['R', 'organisation'], org: ['R', 'organisation'], worktime: ['-', 'self'],
    attendance: ['CRU', 'self'], leave: ['R', 'self'], benefits: ['-', 'self'],
    payroll: ['-', 'self'], recruitment: ['-', 'self'], performance: ['-', 'self'],
    succession: ['-', 'self'], training: ['-', 'self'], intake: ['CRUD', 'organisation'],
    crm: ['CRUD', 'organisation'], reports: ['R', 'organisation'], voip: ['CRUD', 'self'], assets: ['CRU', 'self'],
  },
  Employee: {
    people: ['RU', 'self'], org: ['R', 'self'], worktime: ['R', 'self'],
    attendance: ['CRU', 'self'], leave: ['CRU', 'self'], benefits: ['RU', 'self'],
    payroll: ['R', 'self'], recruitment: ['-', 'self'], performance: ['RU', 'self'],
    succession: ['-', 'self'], training: ['RU', 'self'], intake: ['-', 'self'],
    crm: ['-', 'self'], reports: ['-', 'self'], voip: ['CRUD', 'self'], assets: ['CRU', 'self'],
  },
  'System administrator': {
    people: ['CRUD', 'organisation'], org: ['CRUD', 'organisation'], worktime: ['CRUD', 'organisation'],
    attendance: ['CRUD', 'organisation'], leave: ['CRUD', 'organisation'], benefits: ['CRUD', 'organisation'],
    payroll: ['CRUD', 'organisation'], recruitment: ['CRUD', 'organisation'], performance: ['CRUD', 'organisation'],
    succession: ['CRUD', 'organisation'], training: ['CRUD', 'organisation'], intake: ['CRUD', 'organisation'],
    crm: ['CRUD', 'organisation'], reports: ['CRUD', 'organisation'], voip: ['CRUD', 'organisation'], assets: ['CRUD', 'organisation'],
  },
  'Partner (external)': {
    people: ['-', 'self'], org: ['-', 'self'], worktime: ['-', 'self'], attendance: ['-', 'self'],
    leave: ['-', 'self'], benefits: ['-', 'self'], payroll: ['-', 'self'], recruitment: ['-', 'self'],
    performance: ['-', 'self'], succession: ['-', 'self'], training: ['-', 'self'], intake: ['-', 'self'],
    crm: ['R', 'programme'], reports: ['-', 'self'], voip: ['-', 'self'], assets: ['-', 'self'],
  },
};

const FIELD_CLASSES = {
  people: 'public,internal,restricted,sensitive', org: 'public,internal', worktime: 'public,internal',
  attendance: 'public,internal', leave: 'public,internal', benefits: 'internal,restricted',
  payroll: 'restricted', recruitment: 'internal', performance: 'internal,sensitive',
  succession: 'internal,sensitive', training: 'public,internal', intake: 'internal',
  crm: 'public,internal', reports: 'internal', voip: 'public,internal', assets: 'internal,restricted',
};

const PEOPLE_FIELD_CLASSES_BY_ROLE = {
  'HR administrator': 'public,internal,restricted,sensitive',
  'System administrator': 'public,internal,restricted,sensitive',
  'Head of Department': 'public,internal',
  'Data & CRM officer': 'public,internal',
  Employee: 'public,internal,restricted,sensitive',
  'Partner (external)': 'public,internal,restricted,sensitive',
};

function crudFlags(crud) {
  return {
    can_create: crud.includes('C') ? 1 : 0,
    can_read: crud.includes('R') ? 1 : 0,
    can_update: crud.includes('U') ? 1 : 0,
    can_delete: crud.includes('D') ? 1 : 0,
  };
}

// Edit these two before running.
const SYSADMIN = { id: 'ADM-0001', name: 'System Administrator', email: 'sysadmin@yourorg.org', title: 'System Administrator' };
const HR_ADMIN = { id: 'ADM-0002', name: 'HR Administrator', email: 'hradmin@yourorg.org', title: 'HR Administrator' };

async function seed() {
  const conn = await mysql.createConnection({
    host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password, database: env.db.database,
  });

  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM person');
  if (n > 0) {
    console.log('[seed-production] person table already has data — skipping (truncate the database to re-seed).');
    await conn.end();
    return;
  }

  console.log('[seed-production] seeding roles, permissions, and the two admin accounts only...');

  const roleId = {};
  for (const r of ROLES) {
    const [res] = await conn.query(
      'INSERT INTO role (name, description, is_super_admin) VALUES (?, ?, ?)',
      [r.name, r.description, r.name === 'System administrator' ? 1 : 0]
    );
    roleId[r.name] = res.insertId;
  }
  for (const roleName of Object.keys(PERM_MATRIX)) {
    for (const mod of MODULES) {
      const [crud, scope] = PERM_MATRIX[roleName][mod];
      const flags = crudFlags(crud);
      const fieldClasses = mod === 'people' ? PEOPLE_FIELD_CLASSES_BY_ROLE[roleName] : FIELD_CLASSES[mod];
      await conn.query(
        `INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [roleId[roleName], mod, flags.can_create, flags.can_read, flags.can_update, flags.can_delete, scope, fieldClasses]
      );
    }
  }

  const admins = [
    { ...SYSADMIN, role: 'System administrator' },
    { ...HR_ADMIN, role: 'HR administrator' },
  ];

  for (const a of admins) {
    await conn.query(
      `INSERT INTO person (employee_no, full_legal_name, preferred_name, email, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [a.id, a.name, a.name.split(' ')[0], a.email]
    );
    await conn.query(
      `INSERT INTO employment (employee_no, position_title, start_date, is_current)
       VALUES (?, ?, CURDATE(), 1)`,
      [a.id, a.title]
    );
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const a of admins) {
    await conn.query(
      'INSERT INTO app_user (employee_no, email, password_hash, role_id, is_active) VALUES (?, ?, ?, ?, 1)',
      [a.id, a.email, passwordHash, roleId[a.role]]
    );
  }

  // Minimal notification-event catalog — Settings > Notifications expects these rows to exist to
  // toggle, they aren't "demo data" (no org-specific content in them).
  const notifications = [
    { key: 'leave_submitted', desc: 'Leave request submitted', channel: 'email' },
    { key: 'leave_decided', desc: 'Leave approved or declined', channel: 'email' },
    { key: 'timesheet_missing', desc: 'Timesheet not submitted (Friday 15:00 digest)', channel: 'email' },
    { key: 'payslip_released', desc: 'Payslip released', channel: 'email' },
    { key: 'payroll_awaiting_approval', desc: 'Payroll run awaiting approval', channel: 'email' },
    { key: 'certification_expiring', desc: 'Certification expiring in 90 days (weekly digest)', channel: 'email' },
  ];
  for (const n of notifications) {
    await conn.query('INSERT INTO notification_setting (event_key, description, channel, is_enabled) VALUES (?, ?, ?, 1)', [n.key, n.desc, n.channel]);
  }

  const settings = {
    payroll_cutoff_day: '25', leave_cycle: 'calendar_year', session_lifetime_hours: '8',
    reauth_modules: 'payroll,people,access', lockout_attempts: '5', lockout_window_minutes: '15',
  };
  for (const [k, v] of Object.entries(settings)) {
    await conn.query('INSERT INTO app_setting (setting_key, setting_value) VALUES (?, ?)', [k, v]);
  }

  await conn.end();

  console.log('[seed-production] done. Two logins created (password for both: %s — change immediately):', SEED_PASSWORD);
  for (const a of admins) console.log(`  - ${a.email}  (${a.role})`);
  console.log('[seed-production] Set your real organisation name/logo via Settings > Branding, then add departments/employees via the app UI.');
}

seed().catch((err) => {
  console.error('[seed-production] error:', err);
  process.exit(1);
});
