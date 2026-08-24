// Seeds demo data: org structure, one login per role, and representative rows across
// every module so every screen has something to show. Idempotent: if `person` already
// has rows, it exits without touching anything (re-seed by truncating the database).
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const env = require('../config/env');

const SEED_PASSWORD = 'Passw0rd!';

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

// crud is 'CRUD' subset string; scope is the data_scope enum value.
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
  people: 'public,internal,restricted,sensitive',
  org: 'public,internal',
  worktime: 'public,internal',
  attendance: 'public,internal',
  leave: 'public,internal',
  benefits: 'internal,restricted',
  payroll: 'restricted',
  recruitment: 'internal',
  performance: 'internal,sensitive',
  succession: 'internal,sensitive',
  training: 'public,internal',
  intake: 'internal',
  crm: 'public,internal',
  reports: 'internal',
  voip: 'public,internal',
  assets: 'internal,restricted',
};

// Field-sensitivity classes granted on the `people` module specifically differ per role —
// unlike other modules, this is the one place the demo data actually shows masking do
// something: a department-scoped manager sees a report's contact/structures but not their
// national ID or next-of-kin, where HR/sysadmin see everything.
const PEOPLE_FIELD_CLASSES_BY_ROLE = {
  'HR administrator': 'public,internal,restricted,sensitive',
  'System administrator': 'public,internal,restricted,sensitive',
  'Head of Department': 'public,internal',
  'Data & CRM officer': 'public,internal',
  Employee: 'public,internal,restricted,sensitive', // data_scope is 'self' — only ever their own record
  'Partner (external)': 'public,internal,restricted,sensitive', // moot: people crud is '-' for this role
};

function crudFlags(crud) {
  return {
    can_create: crud.includes('C') ? 1 : 0,
    can_read: crud.includes('R') ? 1 : 0,
    can_update: crud.includes('U') ? 1 : 0,
    can_delete: crud.includes('D') ? 1 : 0,
  };
}

async function seed() {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM person');
  if (n > 0) {
    console.log('[seed] person table already has data — skipping (truncate the database to re-seed).');
    await conn.end();
    return;
  }

  console.log('[seed] seeding roles, permissions, org structure, people, and sample records...');

  // ---- roles + permission matrix ----
  const roleId = {};
  for (const r of ROLES) {
    const [res] = await conn.query('INSERT INTO role (name, description) VALUES (?, ?)', [r.name, r.description]);
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

  // ---- org units ----
  const orgUnits = [
    { key: 'it', kind: 'department', name: 'Information Technology', cost_centre: 'CC-1400', duty_station: 'Mbabane' },
    { key: 'hr', kind: 'department', name: 'Human Resources', cost_centre: 'CC-1200', duty_station: 'Mbabane' },
    { key: 'finance', kind: 'department', name: 'Finance', cost_centre: 'CC-1100', duty_station: 'Mbabane' },
    { key: 'programmes', kind: 'department', name: 'Programmes', cost_centre: 'CC-1300', duty_station: 'Manzini' },
    { key: 'fleet', kind: 'department', name: 'Fleet & Logistics', cost_centre: 'CC-1500', duty_station: 'Mbabane' },
    { key: 'field', kind: 'department', name: 'Field Operations', cost_centre: 'CC-1600', duty_station: 'Manzini' },
    { key: 'pqc', kind: 'committee', name: 'Programme Quality Committee', cost_centre: null, duty_station: 'Mbabane' },
    { key: 'board', kind: 'board', name: 'Board of Trustees', cost_centre: null, duty_station: 'Mbabane' },
    { key: 'fdc', kind: 'group', name: 'Field Data Collection team', cost_centre: null, duty_station: 'Manzini' },
    { key: 'ho2026', kind: 'project_team', name: 'Health Outreach 2026', cost_centre: null, duty_station: 'Manzini' },
  ];
  const orgUnitId = {};
  for (const u of orgUnits) {
    const [res] = await conn.query(
      'INSERT INTO org_unit (kind, name, cost_centre, duty_station) VALUES (?, ?, ?, ?)',
      [u.kind, u.name, u.cost_centre, u.duty_station]
    );
    orgUnitId[u.key] = res.insertId;
  }

  // ---- people ----
  const people = [
    { id: 'NRU-0001', name: 'Thandeka Nkosi', role: 'System administrator', dept: 'it', grade: 'G8', title: 'Systems Administrator', email: 'sysadmin@nru.org', gender: 'Female', dob: '1988-03-14' },
    { id: 'NRU-0002', name: 'Bongani Simelane', role: 'HR administrator', dept: 'hr', grade: 'G8', title: 'HR Administrator', email: 'hr.admin@nru.org', gender: 'Male', dob: '1985-07-22' },
    { id: 'NRU-0003', name: 'Nomvula Khumalo', role: 'Head of Department', dept: 'finance', grade: 'G9', title: 'Finance Manager', email: 'finance.hod@nru.org', gender: 'Female', dob: '1982-11-02' },
    { id: 'NRU-0004', name: 'Sipho Dube', role: 'Data & CRM officer', dept: 'programmes', grade: 'G7', title: 'Data & CRM Officer', email: 'data.crm@nru.org', gender: 'Male', dob: '1990-05-18' },
    { id: 'NRU-0005', name: 'Lindiwe Mkhonta', role: 'Head of Department', dept: 'field', grade: 'G9', title: 'Field Operations Manager', email: 'field.hod@nru.org', gender: 'Female', dob: '1984-09-09' },
    { id: 'NRU-0006', name: 'Sarah Nxumalo', role: 'Partner (external)', dept: null, grade: null, title: 'Programmes Director · Caritas Eswatini', email: 'partner@nru.org', gender: 'Female', dob: '1979-01-30' },
    { id: 'NRU-0007', name: 'Musa Fakudze', role: null, dept: 'fleet', grade: 'G5', title: 'Driver', email: 'musa.fakudze@nru.org', gender: 'Male', dob: '1992-02-11' },
    { id: 'NRU-0008', name: 'Zanele Simelane', role: 'Head of Department', dept: 'fleet', grade: 'G9', title: 'Fleet Manager', email: 'fleet.hod@nru.org', gender: 'Female', dob: '1983-06-27' },
    { id: 'NRU-0009', name: 'Andile Ngwenya', role: 'Employee', dept: 'field', grade: 'G4', title: 'Field Enumerator', email: 'employee@nru.org', gender: 'Male', dob: '1995-04-16' },
    { id: 'NRU-0010', name: 'Nokuthula Mabuza', role: null, dept: 'programmes', grade: 'G5', title: 'Programme Assistant', email: 'nokuthula.mabuza@nru.org', gender: 'Female', dob: '1993-08-05' },
    { id: 'NRU-0011', name: 'Sabelo Motsa', role: null, dept: 'fleet', grade: 'G4', title: 'Driver', email: 'sabelo.motsa@nru.org', gender: 'Male', dob: '1991-12-19' },
    { id: 'NRU-0012', name: 'Phindile Vilakati', role: null, dept: 'finance', grade: 'G6', title: 'Payroll Officer', email: 'phindile.vilakati@nru.org', gender: 'Female', dob: '1989-10-23' },
    { id: 'NRU-0013', name: 'Mduduzi Shongwe', role: null, dept: 'hr', grade: 'G5', title: 'HR Officer', email: 'mduduzi.shongwe@nru.org', gender: 'Male', dob: '1994-01-08' },
    { id: 'NRU-0014', name: 'Nonhlanhla Zwane', role: null, dept: 'it', grade: 'G5', title: 'IT Support Officer', email: 'nonhlanhla.zwane@nru.org', gender: 'Female', dob: '1996-03-30' },
    { id: 'NRU-0015', name: 'Bhekani Maseko', role: null, dept: 'programmes', grade: 'G6', title: 'M&E Officer', email: 'bhekani.maseko@nru.org', gender: 'Male', dob: '1987-07-14' },
    { id: 'NRU-0016', name: 'Fikile Dlamini', role: null, dept: 'field', grade: 'G4', title: 'Field Enumerator', email: 'fikile.dlamini@nru.org', gender: 'Female', dob: '1997-05-21' },
  ];

  for (const p of people) {
    await conn.query(
      `INSERT INTO person (employee_no, full_legal_name, preferred_name, date_of_birth, gender, nationality,
        marital_status, languages, email, phone, address, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone, status)
       VALUES (?, ?, ?, ?, ?, 'Liswati', 'Married', 'siSwati, English', ?, ?, ?, ?, 'Spouse', ?, 'active')`,
      [
        p.id, p.name, p.name.split(' ')[0], p.dob, p.gender, p.email,
        '+268 24' + (1000 + Number(p.id.slice(4))).toString().slice(0, 6),
        'Plot ' + (100 + Number(p.id.slice(4))) + ', Mbabane',
        'Next of Kin ' + p.name.split(' ')[0],
        '+268 76' + (2000 + Number(p.id.slice(4))).toString().slice(0, 6),
      ]
    );
  }

  // department leads
  const deptLead = { it: 'NRU-0001', hr: 'NRU-0002', finance: 'NRU-0003', programmes: 'NRU-0004', fleet: 'NRU-0008', field: 'NRU-0005' };
  for (const [key, lead] of Object.entries(deptLead)) {
    await conn.query('UPDATE org_unit SET lead_employee_no = ? WHERE id = ?', [lead, orgUnitId[key]]);
  }
  await conn.query('UPDATE org_unit SET lead_employee_no = ? WHERE id = ?', ['NRU-0004', orgUnitId.pqc]);
  await conn.query('UPDATE org_unit SET lead_employee_no = ? WHERE id = ?', ['NRU-0005', orgUnitId.fdc]);
  await conn.query('UPDATE org_unit SET lead_employee_no = ? WHERE id = ?', ['NRU-0004', orgUnitId.ho2026]);

  // memberships (department membership for everyone with a dept, plus extra group/committee seats)
  for (const p of people) {
    if (p.dept) {
      await conn.query(
        'INSERT INTO membership (employee_no, org_unit_id, role_in_unit, from_date) VALUES (?, ?, ?, ?)',
        [p.id, orgUnitId[p.dept], 'Member', '2023-01-01']
      );
    }
  }
  await conn.query('INSERT INTO membership (employee_no, org_unit_id, role_in_unit, from_date) VALUES (?, ?, ?, ?)', ['NRU-0004', orgUnitId.pqc, 'Chair', '2024-01-01']);
  await conn.query('INSERT INTO membership (employee_no, org_unit_id, role_in_unit, from_date) VALUES (?, ?, ?, ?)', ['NRU-0003', orgUnitId.pqc, 'Member', '2024-01-01']);
  for (const id of ['NRU-0005', 'NRU-0009', 'NRU-0016']) {
    await conn.query('INSERT INTO membership (employee_no, org_unit_id, role_in_unit, from_date) VALUES (?, ?, ?, ?)', [id, orgUnitId.fdc, 'Enumerator', '2024-06-01']);
    await conn.query('INSERT INTO membership (employee_no, org_unit_id, role_in_unit, from_date) VALUES (?, ?, ?, ?)', [id, orgUnitId.ho2026, 'Field staff', '2024-06-01']);
  }

  // employment (reports_to per department lead, leads report to sysadmin/HR admin as ED stand-in)
  const reportsTo = {
    'NRU-0001': null, 'NRU-0002': null, 'NRU-0003': null, 'NRU-0004': 'NRU-0002', 'NRU-0005': null,
    'NRU-0006': null, 'NRU-0007': 'NRU-0008', 'NRU-0008': null, 'NRU-0009': 'NRU-0005', 'NRU-0010': 'NRU-0004',
    'NRU-0011': 'NRU-0008', 'NRU-0012': 'NRU-0003', 'NRU-0013': 'NRU-0002', 'NRU-0014': 'NRU-0001',
    'NRU-0015': 'NRU-0004', 'NRU-0016': 'NRU-0005',
  };
  for (const p of people) {
    await conn.query(
      `INSERT INTO employment (employee_no, position_title, department_org_unit_id, duty_station, grade,
        contract_type, start_date, reports_to_employee_no, cost_centre, is_current)
       VALUES (?, ?, ?, ?, ?, 'permanent', '2023-01-16', ?, ?, 1)`,
      [p.id, p.title, p.dept ? orgUnitId[p.dept] : null, p.dept ? orgUnits.find((u) => u.key === p.dept).duty_station : 'Mbabane',
        p.grade, reportsTo[p.id], p.dept ? orgUnits.find((u) => u.key === p.dept).cost_centre : null]
    );
    if (reportsTo[p.id]) {
      await conn.query('INSERT INTO reporting_line (employee_no, manager_employee_no, from_date) VALUES (?, ?, ?)', [p.id, reportsTo[p.id], '2023-01-16']);
    }
  }

  // ---- app_user (one login per role) ----
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const logins = [
    { id: 'NRU-0001', email: 'sysadmin@nru.org', role: 'System administrator' },
    { id: 'NRU-0002', email: 'hr.admin@nru.org', role: 'HR administrator' },
    { id: 'NRU-0003', email: 'finance.hod@nru.org', role: 'Head of Department' },
    { id: 'NRU-0004', email: 'data.crm@nru.org', role: 'Data & CRM officer' },
    { id: 'NRU-0006', email: 'partner@nru.org', role: 'Partner (external)' },
    { id: 'NRU-0009', email: 'employee@nru.org', role: 'Employee' },
  ];
  for (const l of logins) {
    await conn.query(
      'INSERT INTO app_user (employee_no, email, password_hash, role_id, is_active) VALUES (?, ?, ?, ?, 1)',
      [l.id, l.email, passwordHash, roleId[l.role]]
    );
  }

  // ---- shift patterns ----
  const shifts = [
    { key: 'standard', name: 'Standard day', pattern: 'Mon-Fri 08:00-17:00', hours: 40, brk: '1 hour unpaid lunch', grace: 10, ot: '1.5x after 40 hrs/week', round: 'Nearest 15 min', auto: 0, src: 'web' },
    { key: 'driver', name: 'Driver shift', pattern: 'Variable, dispatch-led', hours: 45, brk: '30 min as scheduled', grace: 15, ot: '1.5x after 45 hrs/week', round: 'Nearest 5 min', auto: 0, src: 'vehicle_log' },
    { key: 'field', name: 'Field roster', pattern: 'Mon-Sat, roster-based', hours: 40, brk: '1 hour unpaid', grace: 15, ot: '1.5x after 40 hrs/week', round: 'Nearest 15 min', auto: 1, src: 'mobile_gps' },
  ];
  const shiftId = {};
  for (const s of shifts) {
    const [res] = await conn.query(
      `INSERT INTO shift_pattern (name, pattern, contracted_hours, break_rule, grace_minutes, overtime_rule, rounding_rule, auto_clock_out, capture_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.name, s.pattern, s.hours, s.brk, s.grace, s.ot, s.round, s.auto, s.src]
    );
    shiftId[s.key] = res.insertId;
  }
  const personShift = {
    'NRU-0007': 'driver', 'NRU-0011': 'driver',
    'NRU-0005': 'field', 'NRU-0009': 'field', 'NRU-0016': 'field', 'NRU-0015': 'field',
  };
  for (const p of people) {
    const key = personShift[p.id] || 'standard';
    for (let d = 1; d <= 5; d++) {
      const day = `2026-08-${String(17 + d).padStart(2, '0')}`;
      await conn.query(
        `INSERT INTO work_timer (employee_no, shift_pattern_id, clock_in, clock_out, source, device)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [p.id, shiftId[key], `${day} 08:0${d % 4}:00`, `${day} 17:0${d % 3}:00`, shifts.find((s) => s.key === key).src, 'Kiosk-1']
      );
    }
  }

  // ---- leave ----
  const leaveTypes = [
    { name: 'Annual Leave', days: 21, paid: 1 },
    { name: 'Sick Leave', days: 14, paid: 1 },
    { name: 'Maternity Leave', days: 90, paid: 1 },
    { name: 'Paternity Leave', days: 5, paid: 1 },
    { name: 'Compassionate Leave', days: 5, paid: 1 },
    { name: 'Study Leave', days: 10, paid: 0 },
  ];
  const leaveTypeId = {};
  for (const t of leaveTypes) {
    const [res] = await conn.query('INSERT INTO leave_type (name, annual_entitlement_days, paid) VALUES (?, ?, ?)', [t.name, t.days, t.paid]);
    leaveTypeId[t.name] = res.insertId;
  }
  for (const p of people) {
    await conn.query('INSERT INTO leave_balance (employee_no, leave_type_id, year, entitled_days, used_days) VALUES (?, ?, 2026, 21, ?)', [p.id, leaveTypeId['Annual Leave'], Math.floor(Math.random() * 8)]);
    await conn.query('INSERT INTO leave_balance (employee_no, leave_type_id, year, entitled_days, used_days) VALUES (?, ?, 2026, 14, ?)', [p.id, leaveTypeId['Sick Leave'], Math.floor(Math.random() * 4)]);
  }
  const leaveRequests = [
    { id: 'NRU-0009', type: 'Annual Leave', start: '2026-08-25', end: '2026-08-27', days: 3, status: 'pending', stage: 'manager', reason: 'Family event' },
    { id: 'NRU-0016', type: 'Sick Leave', start: '2026-08-18', end: '2026-08-19', days: 2, status: 'approved', stage: 'completed', reason: 'Flu' },
    { id: 'NRU-0010', type: 'Annual Leave', start: '2026-09-01', end: '2026-09-05', days: 5, status: 'pending', stage: 'manager', reason: 'Travel' },
    { id: 'NRU-0007', type: 'Compassionate Leave', start: '2026-08-10', end: '2026-08-11', days: 2, status: 'declined', stage: 'completed', reason: 'Bereavement — documentation pending' },
  ];
  for (const l of leaveRequests) {
    await conn.query(
      `INSERT INTO leave_request (employee_no, leave_type_id, start_date, end_date, days, reason, stage, status, decided_by_employee_no, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [l.id, leaveTypeId[l.type], l.start, l.end, l.days, l.reason, l.stage, l.status,
        l.status === 'pending' ? null : 'NRU-0002', l.status === 'pending' ? null : '2026-08-15 09:00:00']
    );
  }

  // ---- benefits ----
  const benefitPlans = [
    { name: 'Medical Aid', kind: 'Health', cost: 420, note: 'Family cover available at own cost.' },
    { name: 'Group Life Assurance', kind: 'Insurance', cost: 65, note: '3x annual salary cover.' },
    { name: 'Wellness & EAP', kind: 'Wellness', cost: 95, note: 'Counselling, legal advice, annual screening.' },
    { name: 'Pension Fund', kind: 'Retirement', cost: 0, note: 'Employer matches 7.5% of basic salary.' },
  ];
  const benefitId = {};
  for (const b of benefitPlans) {
    const [res] = await conn.query('INSERT INTO benefit_plan (name, kind, cost_per_person, note) VALUES (?, ?, ?, ?)', [b.name, b.kind, b.cost, b.note]);
    benefitId[b.name] = res.insertId;
  }
  for (const p of people) {
    await conn.query('INSERT INTO benefit_enrollment (employee_no, benefit_plan_id, enrolled_at, status) VALUES (?, ?, ?, ?)', [p.id, benefitId['Medical Aid'], '2023-02-01', 'active']);
    await conn.query('INSERT INTO benefit_enrollment (employee_no, benefit_plan_id, enrolled_at, status) VALUES (?, ?, ?, ?)', [p.id, benefitId['Pension Fund'], '2023-02-01', 'active']);
  }

  // ---- payroll ----
  const [julyRun] = await conn.query(`INSERT INTO payroll_run (period, status, cutoff_date, created_by_employee_no, approved_finance_by, approved_finance_at, approved_ed_by, approved_ed_at, paid_at)
    VALUES ('2026-07', 'paid', '2026-07-25', 'NRU-0002', 'NRU-0003', '2026-07-24 10:00:00', 'NRU-0001', '2026-07-24 14:00:00', '2026-07-25 09:00:00')`);
  const [augRun] = await conn.query(`INSERT INTO payroll_run (period, status, cutoff_date, created_by_employee_no)
    VALUES ('2026-08', 'in_review', '2026-08-25', 'NRU-0002')`);
  for (const runId of [julyRun.insertId, augRun.insertId]) {
    for (const p of people) {
      const basic = 8500 + Number(p.grade ? p.grade.replace('G', '') : 4) * 900;
      const allowances = 1200;
      const overtime = personShift[p.id] === 'driver' ? 640 : 0;
      const deductions = Math.round(basic * 0.12);
      const net = basic + allowances + overtime - deductions;
      await conn.query(
        `INSERT INTO payline (payroll_run_id, employee_no, basic, allowances, overtime, deductions, net, bank_account, tax_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [runId, p.id, basic, allowances, overtime, deductions, net, 'EFT-' + p.id.slice(4) + '-01', 'TAX-' + p.id.slice(4)]
      );
    }
  }

  // ---- recruitment ----
  const [req1] = await conn.query(`INSERT INTO job_requisition (title, department_org_unit_id, grade, status, opened_by_employee_no, opened_at, headcount)
    VALUES ('Field Enumerator', ?, 'G4', 'open', 'NRU-0005', '2026-08-01', 3)`, [orgUnitId.field]);
  const [req2] = await conn.query(`INSERT INTO job_requisition (title, department_org_unit_id, grade, status, opened_by_employee_no, opened_at, headcount)
    VALUES ('Accountant', ?, 'G6', 'open', 'NRU-0003', '2026-08-05', 1)`, [orgUnitId.finance]);
  const candidates = [
    { name: 'Nomcebo Dlamini', email: 'nomcebo.d@example.com', phone: '+268 7611 2233', source: 'LinkedIn' },
    { name: 'Thulani Nkambule', email: 'thulani.n@example.com', phone: '+268 7622 3344', source: 'Referral' },
    { name: 'Gcina Mamba', email: 'gcina.m@example.com', phone: '+268 7633 4455', source: 'Job board' },
  ];
  const candidateId = [];
  for (const c of candidates) {
    const [res] = await conn.query('INSERT INTO candidate (full_name, email, phone, source) VALUES (?, ?, ?, ?)', [c.name, c.email, c.phone, c.source]);
    candidateId.push(res.insertId);
  }
  const [app1] = await conn.query('INSERT INTO application (requisition_id, candidate_id, stage, applied_at) VALUES (?, ?, ?, ?)', [req1.insertId, candidateId[0], 'interview', '2026-08-06']);
  await conn.query('INSERT INTO application (requisition_id, candidate_id, stage, applied_at) VALUES (?, ?, ?, ?)', [req1.insertId, candidateId[1], 'screening', '2026-08-08']);
  await conn.query('INSERT INTO application (requisition_id, candidate_id, stage, applied_at) VALUES (?, ?, ?, ?)', [req2.insertId, candidateId[2], 'applied', '2026-08-10']);
  await conn.query('INSERT INTO interview (application_id, interviewer_employee_no, scheduled_at, outcome) VALUES (?, ?, ?, ?)', [app1.insertId, 'NRU-0005', '2026-08-27 10:00:00', 'pending']);

  // ---- performance & succession ----
  const [cycleClosed] = await conn.query(`INSERT INTO review_cycle (name, period, status, start_date, end_date) VALUES ('Mid-year 2026', '2026-H1', 'closed', '2026-01-01', '2026-06-30')`);
  const [cycleOpen] = await conn.query(`INSERT INTO review_cycle (name, period, status, start_date, end_date) VALUES ('Annual 2026', '2026', 'open', '2026-01-01', '2026-12-31')`);
  for (const p of people.filter((p) => reportsTo[p.id])) {
    await conn.query(
      `INSERT INTO performance_review (cycle_id, employee_no, reviewer_employee_no, self_rating, manager_rating, status)
       VALUES (?, ?, ?, 4.0, 4.2, 'completed')`,
      [cycleClosed.insertId, p.id, reportsTo[p.id]]
    );
    await conn.query(
      `INSERT INTO performance_review (cycle_id, employee_no, reviewer_employee_no, status)
       VALUES (?, ?, ?, 'not_started')`,
      [cycleOpen.insertId, p.id, reportsTo[p.id]]
    );
  }
  const [sp1] = await conn.query(`INSERT INTO succession_plan (position_title, org_unit_id, incumbent_employee_no, risk, note)
    VALUES ('Finance Manager', ?, 'NRU-0003', 'medium', 'No ready-now successor identified.')`, [orgUnitId.finance]);
  const [sp2] = await conn.query(`INSERT INTO succession_plan (position_title, org_unit_id, incumbent_employee_no, risk, note)
    VALUES ('Fleet Manager', ?, 'NRU-0008', 'high', 'Single point of failure — sole qualified driver-manager.')`, [orgUnitId.fleet]);
  await conn.query('INSERT INTO successor_candidate (succession_plan_id, employee_no, readiness) VALUES (?, ?, ?)', [sp1.insertId, 'NRU-0012', 'ready_1_2yr']);
  await conn.query('INSERT INTO successor_candidate (succession_plan_id, employee_no, readiness) VALUES (?, ?, ?)', [sp2.insertId, 'NRU-0007', 'ready_3_5yr']);

  // ---- training & certification ----
  const courses = [
    { name: 'Data Protection Fundamentals', provider: 'Internal', category: 'Compliance', cert: 0, months: null },
    { name: 'Defensive Driving', provider: 'Eswatini Driving Academy', category: 'Fleet', cert: 1, months: 24 },
    { name: 'Safeguarding Level 1', provider: 'Internal', category: 'Compliance', cert: 1, months: 36 },
    { name: 'First Aid', provider: 'Red Cross Eswatini', category: 'Health & Safety', cert: 1, months: 12 },
  ];
  const courseId = {};
  for (const c of courses) {
    const [res] = await conn.query('INSERT INTO training_course (name, provider, category, is_certification, validity_months) VALUES (?, ?, ?, ?, ?)', [c.name, c.provider, c.category, c.cert, c.months]);
    courseId[c.name] = res.insertId;
  }
  for (const p of people) {
    await conn.query('INSERT INTO training_enrollment (employee_no, course_id, status, completed_at) VALUES (?, ?, ?, ?)', [p.id, courseId['Data Protection Fundamentals'], 'completed', '2026-02-15']);
  }
  await conn.query(`INSERT INTO certification (employee_no, name, issued_at, expires_at, issuing_body) VALUES ('NRU-0007', 'Defensive Driving', '2024-09-02', '2026-09-02', 'Eswatini Driving Academy')`);
  await conn.query(`INSERT INTO certification (employee_no, name, issued_at, expires_at, issuing_body) VALUES ('NRU-0011', 'Defensive Driving', '2025-01-15', '2027-01-15', 'Eswatini Driving Academy')`);
  await conn.query(`INSERT INTO certification (employee_no, name, issued_at, expires_at, issuing_body) VALUES ('NRU-0009', 'Safeguarding Level 1', '2023-08-20', '2026-08-20', 'Internal')`);
  await conn.query(`INSERT INTO certification (employee_no, name, issued_at, expires_at, issuing_body) VALUES ('NRU-0016', 'First Aid', '2025-11-01', '2026-11-01', 'Red Cross Eswatini')`);

  // ---- CRM & external data intake ----
  const partners = [
    { name: 'Caritas Eswatini', type: 'Faith-based NGO', contact: 'S. Nxumalo · Programmes Director', phone: '+268 2404 1180', agreement: 'MoU to 31 Dec 2027', status: 'active', since: 2019 },
    { name: 'Ministry of Health · Manzini region', type: 'Government', contact: 'Dr T. Mkhonta · Regional Health Officer', phone: '+268 2505 2210', agreement: 'Data-sharing agreement to 2028', status: 'active', since: 2021 },
    { name: 'Save the Children Eswatini', type: 'International NGO', contact: 'L. Dube · M&E Lead', phone: '+268 2404 7712', agreement: 'MoU under renewal', status: 'renewal_due', since: 2023 },
  ];
  const partnerId = {};
  for (const p of partners) {
    const [res] = await conn.query('INSERT INTO partner_org (name, type, contact_name, contact_phone, agreement, status, since_year) VALUES (?, ?, ?, ?, ?, ?, ?)', [p.name, p.type, p.contact, p.phone, p.agreement, p.status, p.since]);
    partnerId[p.name] = res.insertId;
  }
  const [prog1] = await conn.query(`INSERT INTO programme (name, lead_employee_no, status, start_date) VALUES ('Health Outreach 2026', 'NRU-0004', 'Active', '2026-01-01')`);
  const [prog2] = await conn.query(`INSERT INTO programme (name, lead_employee_no, status, start_date) VALUES ('Child Nutrition Survey', 'NRU-0004', 'Active', '2026-03-01')`);
  await conn.query('INSERT INTO programme_partner (programme_id, partner_org_id) VALUES (?, ?)', [prog1.insertId, partnerId['Caritas Eswatini']]);
  await conn.query('INSERT INTO programme_partner (programme_id, partner_org_id) VALUES (?, ?)', [prog1.insertId, partnerId['Ministry of Health · Manzini region']]);
  await conn.query('INSERT INTO programme_partner (programme_id, partner_org_id) VALUES (?, ?)', [prog2.insertId, partnerId['Save the Children Eswatini']]);
  await conn.query(`INSERT INTO indicator_record (programme_id, partner_org_id, indicator_name, period, value, source_feed, collected_by_employee_no)
    VALUES (?, ?, 'TB screenings', '2026-07', 612, 'DHIS2 API', 'NRU-0015')`, [prog1.insertId, partnerId['Ministry of Health · Manzini region']]);
  await conn.query(`INSERT INTO indicator_record (programme_id, partner_org_id, indicator_name, period, value, source_feed, collected_by_employee_no)
    VALUES (?, ?, 'Children screened', '2026-07', 908, 'KoboToolbox', 'NRU-0015')`, [prog2.insertId, partnerId['Save the Children Eswatini']]);

  const [feed1] = await conn.query(`INSERT INTO feed (source_name, transport, cadence, field_map, owner_employee_no, status, last_run_at)
    VALUES ('National Payroll Tax Service', 'sftp', 'Monthly', ?, 'NRU-0004', 'healthy', '2026-07-25 18:05:00')`, [JSON.stringify({ tin: 'tax_number', rate: 'paye_rate', month: 'period' })]);
  const [feed2] = await conn.query(`INSERT INTO feed (source_name, transport, cadence, field_map, owner_employee_no, status, last_run_at)
    VALUES ('DHIS2 Facility Indicators', 'api_pull', 'Weekly', ?, 'NRU-0004', 'healthy', '2026-08-18 06:00:00')`, [JSON.stringify({ facility_code: 'org_unit', indicator: 'indicator_name' })]);
  await conn.query('INSERT INTO feed_record (feed_id, raw_payload, status, reason) VALUES (?, ?, ?, ?)', [feed1.insertId, JSON.stringify({ tin: 'X-99213', name: 'Unmapped Employee' }), 'quarantined', 'tax number does not match any active person record']);
  await conn.query('INSERT INTO feed_record (feed_id, raw_payload, status) VALUES (?, ?, ?)', [feed2.insertId, JSON.stringify({ facility_code: 'MZ-12', indicator: 'TB screenings', value: 88 }), 'published']);

  // ---- VoIP ----
  let ext = 100;
  for (const p of people) {
    await conn.query('INSERT INTO voip_extension (employee_no, extension, status) VALUES (?, ?, ?)', [p.id, String(ext++), 'active']);
  }
  await conn.query(`INSERT INTO call_record (caller_employee_no, callee_employee_no, started_at, duration_seconds, direction, outcome)
    VALUES ('NRU-0009', 'NRU-0005', '2026-08-21 09:14:00', 184, 'outbound', 'completed')`);
  await conn.query(`INSERT INTO call_record (caller_employee_no, callee_employee_no, started_at, duration_seconds, direction, outcome)
    VALUES ('NRU-0002', 'NRU-0003', '2026-08-22 11:02:00', 340, 'outbound', 'completed')`);
  await conn.query(`INSERT INTO call_record (caller_employee_no, callee_number, started_at, duration_seconds, direction, outcome)
    VALUES ('NRU-0004', '+268 2404 1180', '2026-08-22 15:40:00', 0, 'outbound', 'missed')`);

  // ---- asset & interest declarations ----
  const declarations = [
    { id: 'NRU-0009', category: 'vehicle', description: '2019 Toyota Hilux, personal use', value: 185000, acquired: '2020-03-01', status: 'reviewed', reviewer: 'NRU-0002' },
    { id: 'NRU-0009', category: 'outside_employment', description: 'Weekend driving instructor, Manzini Driving School', value: null, acquired: null, status: 'submitted', reviewer: null },
    { id: 'NRU-0004', category: 'financial_interest', description: 'Minority shareholder, family trading company', value: 40000, acquired: '2018-01-01', status: 'reviewed', reviewer: 'NRU-0002' },
    { id: 'NRU-0012', category: 'gift', description: 'Conference gift hamper from National Payroll Tax Service', value: 800, acquired: '2026-06-10', status: 'flagged', reviewer: 'NRU-0002' },
    { id: 'NRU-0007', category: 'property', description: 'Residential plot, Ezulwini', value: 260000, acquired: '2015-11-20', status: 'reviewed', reviewer: 'NRU-0002' },
  ];
  for (const d of declarations) {
    await conn.query(
      `INSERT INTO asset_declaration (employee_no, category, description, estimated_value, currency, acquired_at, declared_at, status, reviewed_by_employee_no, reviewed_at, review_note)
       VALUES (?, ?, ?, ?, 'SZL', ?, ?, ?, ?, ?, ?)`,
      [d.id, d.category, d.description, d.value, d.acquired, '2026-07-01', d.status, d.reviewer,
        d.status === 'reviewed' || d.status === 'flagged' ? '2026-07-05 10:00:00' : null,
        d.status === 'flagged' ? 'Value appears above the routine-gift threshold — following up with declarant.' : null]
    );
  }

  // ---- notification settings ----
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

  // ---- app settings ----
  const settings = {
    payroll_cutoff_day: '25',
    leave_cycle: 'calendar_year',
    session_lifetime_hours: '8',
    reauth_modules: 'payroll,people,access',
    lockout_attempts: '5',
    lockout_window_minutes: '15',
  };
  for (const [k, v] of Object.entries(settings)) {
    await conn.query('INSERT INTO app_setting (setting_key, setting_value) VALUES (?, ?)', [k, v]);
  }

  await conn.end();

  console.log('[seed] done. Seeded logins (password for all: %s):', SEED_PASSWORD);
  for (const l of logins) console.log(`  - ${l.email}  (${l.role})`);
}

seed().catch((err) => {
  console.error('[seed] error:', err);
  process.exit(1);
});
