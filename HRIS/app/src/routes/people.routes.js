const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, forbidden } = require('../platform/errors');
const { requireScope, resolveScope, scopeFilterSql, maskPerson, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { personSchema, employmentSchema } = require('../validators/people.validators');
const { nextEmployeeNo } = require('../platform/employeeNo');
const enc = require('../platform/crypto');

const router = express.Router();

// national_id and next_of_kin_phone are stored AES-256-GCM encrypted (see platform/crypto.js) —
// every SELECT * FROM person row needs these two fields decrypted before use, and every write
// needs them encrypted before hitting the DB. Centralized here so every read/write site in this
// file goes through the same two calls rather than reimplementing the field list.
function decryptPerson(row) {
  if (!row) return row;
  row.national_id = enc.decrypt(row.national_id);
  row.next_of_kin_phone = enc.decrypt(row.next_of_kin_phone);
  return row;
}

// Fields an employee may edit on their own record (data_scope 'self'). Identity, employment
// status and compliance-sensitive fields (name, national ID, DOB, gender, nationality, status)
// stay HR-controlled — self-service only ever touches contact/next-of-kin/personal-preference
// fields. HR/managers with department or organisation scope keep full field access via the
// personSchema validation already applied below.
const SELF_EDITABLE_FIELDS = [
  'preferred_name', 'email', 'phone', 'address',
  'next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone',
  'languages', 'marital_status',
];

// Deliberately NOT a folder named "uploads" that sits at a path matching its own URL
// (`/uploads/<file>`) — on Apache/LiteSpeed+Passenger hosting, a real on-disk file at the exact
// requested path gets served directly by the webserver, bypassing both Node's requireAuth check
// and its decrypt-on-read step entirely (confirmed in production: encrypted files were coming
// back as raw ciphertext). `private/` never matches any URL the app actually serves, so there's
// never a real file for the webserver to shortcut to — every request is forced through Node.
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'private', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// memoryStorage (not diskStorage) so the raw photo is never written to disk in plaintext, even
// momentarily — the route handler below encrypts req.file.buffer and writes the ciphertext
// directly. Read back out via platform/fileServe.js, which decrypts on the way to a response.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(badRequest('Only JPEG, PNG, WebP or GIF images are allowed'));
    cb(null, true);
  },
});

router.get('/', requireScope('people', 'read'), asyncHandler(async (req, res) => {
  const { q, department, status } = req.query;
  const filter = await scopeFilterSql(req.scope, req.session.user, 'p.employee_no');
  let sql = `SELECT p.*, e.position_title, e.grade, e.duty_station, e.contract_type, ou.id AS department_id, ou.name AS department_name
             FROM person p
             LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
             LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
             WHERE ${filter.clause}`;
  const params = [...filter.params];
  if (q) { sql += ' AND (p.full_legal_name LIKE ? OR p.employee_no LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (department) { sql += ' AND ou.id = ?'; params.push(department); }
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  sql += ' ORDER BY p.full_legal_name';

  const rows = await db.query(sql, params);
  const data = rows.map((r) => ({
    ...maskPerson(decryptPerson(r), req.scope.fields ? req.scope.fields : req.scope.fieldClasses),
    position_title: r.position_title,
    grade: r.grade,
    duty_station: r.duty_station,
    contract_type: r.contract_type,
    department_id: r.department_id,
    department_name: r.department_name,
  }));
  res.json({ data, meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/:id', requireScope('people', 'read'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'employee_no');
  const rows = await db.query(`SELECT * FROM person WHERE employee_no = ? AND ${filter.clause}`, [req.params.id, ...filter.params]);
  if (!rows[0]) throw notFound('Person not found or out of scope');
  decryptPerson(rows[0]);

  const employment = await db.query(
    `SELECT e.*, ou.name AS department_name FROM employment e LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
     WHERE e.employee_no = ? ORDER BY e.start_date DESC`,
    [req.params.id]
  );

  // basic_salary is payroll-sensitive, not a plain 'people' field — e.* above pulls it in
  // unconditionally, so it must be stripped back out here unless the caller's PAYROLL scope
  // (not their people scope) actually reaches this specific employee. Read access to payroll
  // alone isn't enough — data_scope must reach req.params.id too (an Employee's own read/self
  // shows only their own salary; a department-scoped Head of Department sees their own
  // department; organisation scope sees everyone) — same two-part check payroll.routes.js and
  // dashboard.routes.js already apply to payroll data elsewhere in this app.
  const payrollScope = await resolveScope(req.session.user, 'payroll');
  let salaryAuthorized = false;
  if (payrollScope.actions.read) {
    const payrollFilter = await scopeFilterSql(payrollScope, req.session.user, 'employee_no');
    const check = await db.query(`SELECT 1 FROM person WHERE employee_no = ? AND ${payrollFilter.clause} LIMIT 1`, [req.params.id, ...payrollFilter.params]);
    salaryAuthorized = !!check[0];
  }
  if (!salaryAuthorized) employment.forEach((row) => { delete row.basic_salary; });

  const memberships = await db.query(
    `SELECT m.*, ou.name AS org_unit_name, ou.kind FROM membership m JOIN org_unit ou ON ou.id = m.org_unit_id
     WHERE m.employee_no = ? ORDER BY m.from_date DESC`,
    [req.params.id]
  );
  const voipRows = await db.query('SELECT extension, status FROM voip_extension WHERE employee_no = ?', [req.params.id]);
  const certs = await db.query('SELECT name, issued_at, expires_at, issuing_body FROM certification WHERE employee_no = ?', [req.params.id]);

  res.json({
    data: {
      ...maskPerson(rows[0], req.scope.fields || req.scope.fieldClasses),
      employment,
      memberships,
      voip: voipRows[0] || null,
      certifications: certs,
    },
    meta: { scope: scopeMeta(req.scope) },
  });
}));

// Teams-style "who reports to who and who they work with": manager, peers (same manager),
// and direct reports around one person. Names/titles/department are the 'public' sensitivity
// class per the doc, so this deliberately doesn't re-mask manager/peers/reports rows beyond
// the initial scope check on the centered person — the reporting chain itself is meant to be
// visible to anyone who can see the person, same as it would be in a directory app.
router.get('/:id/relationships', requireScope('people', 'read'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'employee_no');
  const selfRows = await db.query(
    `SELECT p.employee_no, p.full_legal_name, p.preferred_name, e.position_title, e.reports_to_employee_no, ou.name AS department_name
     FROM person p
     LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
     LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
     WHERE p.employee_no = ? AND ${filter.clause}`,
    [req.params.id, ...filter.params]
  );
  if (!selfRows[0]) throw notFound('Person not found or out of scope');
  const self = selfRows[0];

  const personCard = (r) => ({
    employee_no: r.employee_no,
    name: r.preferred_name || r.full_legal_name,
    position_title: r.position_title || null,
    department_name: r.department_name || null,
  });

  let manager = null;
  if (self.reports_to_employee_no) {
    const mgrRows = await db.query(
      `SELECT p.employee_no, p.full_legal_name, p.preferred_name, e.position_title, ou.name AS department_name
       FROM person p
       LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
       LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
       WHERE p.employee_no = ?`,
      [self.reports_to_employee_no]
    );
    if (mgrRows[0]) manager = personCard(mgrRows[0]);
  }

  const peers = self.reports_to_employee_no
    ? (await db.query(
        `SELECT p.employee_no, p.full_legal_name, p.preferred_name, e.position_title, ou.name AS department_name
         FROM person p
         JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE e.reports_to_employee_no = ? AND p.employee_no != ?
         ORDER BY p.full_legal_name`,
        [self.reports_to_employee_no, req.params.id]
      )).map(personCard)
    : [];

  const directReports = (
    await db.query(
      `SELECT p.employee_no, p.full_legal_name, p.preferred_name, e.position_title, ou.name AS department_name
       FROM person p
       JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
       LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
       WHERE e.reports_to_employee_no = ?
       ORDER BY p.full_legal_name`,
      [req.params.id]
    )
  ).map(personCard);

  res.json({ data: { self: personCard(self), manager, peers, directReports } });
}));

router.post('/', requireScope('people', 'create'), asyncHandler(async (req, res) => {
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid person data', parsed.error.flatten());
  const d = parsed.data;

  let employeeNo = d.employee_no;
  if (!employeeNo) employeeNo = await nextEmployeeNo();

  await db.query(
    `INSERT INTO person (employee_no, full_legal_name, preferred_name, national_id, date_of_birth, gender, nationality,
      marital_status, languages, email, phone, address, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [employeeNo, d.full_legal_name, d.preferred_name || null, enc.encrypt(d.national_id), d.date_of_birth || null, d.gender || null,
      d.nationality || null, d.marital_status || null, d.languages || null, d.email || null, d.phone || null, d.address || null,
      d.next_of_kin_name || null, d.next_of_kin_relationship || null, enc.encrypt(d.next_of_kin_phone), d.status || 'active']
  );
  await writeAudit(req, 'create', 'person', employeeNo, null, d);
  res.status(201).json({ data: { employee_no: employeeNo } });
}));

router.put('/:id', requireScope('people', 'update'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'employee_no');
  const before = await db.query(`SELECT * FROM person WHERE employee_no = ? AND ${filter.clause}`, [req.params.id, ...filter.params]);
  if (!before[0]) throw notFound('Person not found or out of scope');
  decryptPerson(before[0]);

  const parsed = personSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid person data', parsed.error.flatten());
  const d = parsed.data;
  let fields = Object.keys(d).filter((k) => k !== 'employee_no');

  // Self-service: an employee editing their own record (data_scope 'self') may only touch the
  // self-editable whitelist — HR/managers with department or organisation scope keep full access.
  const isEditingSelf = req.session.user.employeeNo === req.params.id;
  if (isEditingSelf && req.scope.dataScope === 'self') {
    const disallowed = fields.filter((f) => !SELF_EDITABLE_FIELDS.includes(f));
    if (disallowed.length) throw forbidden(`These fields are HR-controlled and can't be edited from self-service: ${disallowed.join(', ')}`);
  }

  if (!fields.length) return res.json({ data: before[0] });

  const ENCRYPTED_FIELDS = ['national_id', 'next_of_kin_phone'];
  const setSql = fields.map((f) => `${f} = ?`).join(', ');
  const setValues = fields.map((f) => (ENCRYPTED_FIELDS.includes(f) ? enc.encrypt(d[f]) : d[f]));
  await db.query(`UPDATE person SET ${setSql} WHERE employee_no = ?`, [...setValues, req.params.id]);
  await writeAudit(req, 'update', 'person', req.params.id, before[0], d);

  const after = await db.query('SELECT * FROM person WHERE employee_no = ?', [req.params.id]);
  decryptPerson(after[0]);
  res.json({ data: after[0] });
}));

router.post('/:id/photo', requireScope('people', 'update'), upload.single('photo'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'employee_no');
  const before = await db.query(`SELECT employee_no, photo_url FROM person WHERE employee_no = ? AND ${filter.clause}`, [req.params.id, ...filter.params]);
  if (!before[0]) throw notFound('Person not found or out of scope');
  if (!req.file) throw badRequest('No photo uploaded');

  const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const filename = `${req.params.id}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), enc.encryptBuffer(req.file.buffer));

  const photoUrl = `/uploads/${filename}`;
  await db.query('UPDATE person SET photo_url = ? WHERE employee_no = ?', [photoUrl, req.params.id]);
  await writeAudit(req, 'update', 'person', req.params.id, { photo_url: before[0].photo_url }, { photo_url: photoUrl });

  if (before[0].photo_url && before[0].photo_url.startsWith('/uploads/')) {
    const oldPath = path.join(UPLOAD_DIR, path.basename(before[0].photo_url));
    fs.unlink(oldPath, () => {}); // best-effort cleanup; a failed delete here shouldn't fail the request
  }

  res.json({ data: { photo_url: photoUrl } });
}));

router.post('/:id/employment', requireScope('people', 'update'), asyncHandler(async (req, res) => {
  const parsed = employmentSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid employment data', parsed.error.flatten());
  const d = parsed.data;

  const person = await db.query('SELECT employee_no FROM person WHERE employee_no = ?', [req.params.id]);
  if (!person[0]) throw notFound('Person not found');

  await db.query('UPDATE employment SET is_current = 0 WHERE employee_no = ? AND is_current = 1', [req.params.id]);
  const result = await db.query(
    `INSERT INTO employment (employee_no, position_title, department_org_unit_id, duty_station, grade, contract_type,
      start_date, reports_to_employee_no, cost_centre, basic_salary, is_current)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [req.params.id, d.position_title, d.department_org_unit_id || null, d.duty_station || null, d.grade || null,
      d.contract_type, d.start_date, d.reports_to_employee_no || null, d.cost_centre || null, d.basic_salary ?? null]
  );
  if (d.reports_to_employee_no) {
    await db.query('UPDATE reporting_line SET to_date = CURDATE() WHERE employee_no = ? AND to_date IS NULL', [req.params.id]);
    await db.query('INSERT INTO reporting_line (employee_no, manager_employee_no, from_date) VALUES (?, ?, ?)', [req.params.id, d.reports_to_employee_no, d.start_date]);
  }
  await writeAudit(req, 'create', 'employment', req.params.id, null, d);
  res.status(201).json({ data: { id: result.insertId } });
}));

// Lightweight "reassign manager" — updates reports_to on the CURRENT employment row in place
// rather than versioning a whole new employment record (that's what POST /:id/employment is
// for, when the position itself changes). reporting_line still gets a proper history entry,
// since that table exists specifically to track manager changes independent of full employment
// versioning (dotted lines, interim coverage, etc.) — see Implementation documentation.md §2.
router.patch('/:id/manager', requireScope('people', 'update'), asyncHandler(async (req, res) => {
  const managerNo = req.body && req.body.reports_to_employee_no ? String(req.body.reports_to_employee_no) : null;
  if (managerNo === req.params.id) throw badRequest('A person cannot report to themselves');

  const filter = await scopeFilterSql(req.scope, req.session.user, 'employee_no');
  const person = await db.query(`SELECT employee_no FROM person WHERE employee_no = ? AND ${filter.clause}`, [req.params.id, ...filter.params]);
  if (!person[0]) throw notFound('Person not found or out of scope');

  const current = await db.query('SELECT id, reports_to_employee_no FROM employment WHERE employee_no = ? AND is_current = 1', [req.params.id]);
  if (!current[0]) throw notFound('This person has no current employment record to attach a manager to — add one first');

  if (managerNo) {
    const manager = await db.query('SELECT employee_no FROM person WHERE employee_no = ?', [managerNo]);
    if (!manager[0]) throw badRequest('Manager not found');
  }

  await db.query('UPDATE employment SET reports_to_employee_no = ? WHERE id = ?', [managerNo, current[0].id]);
  await db.query('UPDATE reporting_line SET to_date = CURDATE() WHERE employee_no = ? AND to_date IS NULL', [req.params.id]);
  if (managerNo) {
    await db.query('INSERT INTO reporting_line (employee_no, manager_employee_no, from_date) VALUES (?, ?, CURDATE())', [req.params.id, managerNo]);
  }
  await writeAudit(req, 'update', 'employment.reports_to', req.params.id, { reports_to_employee_no: current[0].reports_to_employee_no }, { reports_to_employee_no: managerNo });

  res.json({ data: { employee_no: req.params.id, reports_to_employee_no: managerNo } });
}));

module.exports = router;
