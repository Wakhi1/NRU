  // Machine-to-machine integration API — lets the organisation's OTHER systems (smartphone
  // tracking, accounting, fleet/logistics management) pull employee details and timesheets from
  // this HRIS, which is the single source of truth for that data. See docs/INTEGRATION.md.
  //
  // Two distinct audiences, two distinct auth mechanisms, both live in this one router:
  //   - `/keys/*`  — admins managing API keys from the browser. Session-based, requireRole, same
  //                  as every other admin-only surface in this app (Settings, Audit trail).
  //   - everything else — external systems calling with an API key. No session, no cookies —
  //                  authenticated per-request by apiKeyAuth (Authorization: Bearer <key>).
  // Mounted in server.js WITHOUT the app's session requireAuth, deliberately, since the data
  // endpoints must work for a caller that never logs in.
  const path = require('path');
  const fs = require('fs');
  const express = require('express');
  const db = require('../platform/db');
  const { asyncHandler, badRequest, notFound, conflict } = require('../platform/errors');
  const { requireRole, verifyPassword } = require('../platform/auth');
  const { writeAudit } = require('../platform/audit');
  const { notify } = require('../platform/mailer');
  const { generateApiKey } = require('../platform/apiKey');
  const { apiKeyAuth, requireApiScope } = require('../platform/apiKeyAuth');
  const { INTEGRATION_CATEGORIES, apiKeyCreateSchema, apiKeyScopesUpdateSchema, auditEventCreateSchema, mfaVerifyIntegrationSchema, loginVerifyIntegrationSchema } = require('../validators/integration.validators');
  const enc = require('../platform/crypto');
  const { verifyTotp, generateEmailOtp, hashCode, verifyCode, LOCKOUT_DEFAULT_ATTEMPTS, LOCKOUT_DEFAULT_WINDOW_MIN } = require('../platform/mfa');

  const UPLOAD_DIR = path.join(__dirname, '..', '..', 'private', 'uploads');

  const router = express.Router();

  // ============================== Admin: manage API keys ==============================
  const keys = express.Router();
  keys.use(requireRole('System administrator', 'HR administrator'));

  // The admin UI's CRUD matrix widget fetches this once and renders a checkbox only for cells this
  // list marks allowed — the vocabulary lives in one place (the validator) so the UI can never offer
  // a scope the server wouldn't actually accept.
  keys.get('/matrix-schema', asyncHandler(async (req, res) => {
    res.json({ data: INTEGRATION_CATEGORIES });
  }));

  keys.get('/', asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT k.id, k.name, k.key_prefix, k.scopes, k.is_active, k.last_used_at, k.expires_at, k.created_at,
              p.full_legal_name AS created_by_name
      FROM api_key k LEFT JOIN person p ON p.employee_no = k.created_by_employee_no
      ORDER BY k.created_at DESC`
    );
    res.json({ data: rows });
  }));

  keys.post('/', asyncHandler(async (req, res) => {
    const parsed = apiKeyCreateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid API key data', parsed.error.flatten());
    const d = parsed.data;

    const { plaintext, prefix, hash } = await generateApiKey();
    const result = await db.query(
      `INSERT INTO api_key (name, key_prefix, key_hash, scopes, created_by_employee_no, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [d.name, prefix, hash, d.scopes.join(','), req.session.user.employeeNo, d.expires_at || null]
    );
    await writeAudit(req, 'create', 'api_key', result.insertId, null, { name: d.name, scopes: d.scopes });
    // The plaintext key is returned exactly once — only key_hash is ever stored, so this is the
    // only moment it exists outside the caller's own records.
    res.status(201).json({ data: { id: result.insertId, key: plaintext, prefix } });
  }));

  // Changes what an EXISTING credential is allowed to do, without touching the secret itself — an
  // admin adding e.g. timesheets:create to a key already deployed on a live smartphone-tracking
  // integration shouldn't have to rotate (Renew) and re-distribute a new secret just to widen access.
  keys.put('/:id', asyncHandler(async (req, res) => {
    const rows = await db.query('SELECT * FROM api_key WHERE id = ?', [req.params.id]);
    if (!rows[0]) throw notFound('API key not found');
    const parsed = apiKeyScopesUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid scopes', parsed.error.flatten());

    await db.query('UPDATE api_key SET scopes = ? WHERE id = ?', [parsed.data.scopes.join(','), req.params.id]);
    await writeAudit(req, 'update', 'api_key', req.params.id, { scopes: rows[0].scopes }, { scopes: parsed.data.scopes });
    res.json({ data: { id: Number(req.params.id), scopes: parsed.data.scopes } });
  }));

  keys.post('/:id/revoke', asyncHandler(async (req, res) => {
    const rows = await db.query('SELECT * FROM api_key WHERE id = ?', [req.params.id]);
    if (!rows[0]) throw notFound('API key not found');
    await db.query('UPDATE api_key SET is_active = 0 WHERE id = ?', [req.params.id]);
    await writeAudit(req, 'revoke', 'api_key', req.params.id, { is_active: rows[0].is_active }, { is_active: 0 });
    res.json({ ok: true });
  }));

  // Undoes a revoke — a paused/suspended key is not a dead credential, just one an admin wants to
  // stop using temporarily. Kept as its own endpoint (rather than folding into a generic PUT) so
  // it reads the same way revoke does in both the API and the audit trail.
  keys.post('/:id/reactivate', asyncHandler(async (req, res) => {
    const rows = await db.query('SELECT * FROM api_key WHERE id = ?', [req.params.id]);
    if (!rows[0]) throw notFound('API key not found');
    await db.query('UPDATE api_key SET is_active = 1 WHERE id = ?', [req.params.id]);
    await writeAudit(req, 'reactivate', 'api_key', req.params.id, { is_active: rows[0].is_active }, { is_active: 1 });
    res.json({ ok: true });
  }));

  // Hard delete — distinct from revoke/reactivate (which only flip is_active). Irreversible, so the
  // before-payload captures what's about to disappear since there will be no row left to look up.
  keys.delete('/:id', asyncHandler(async (req, res) => {
    const rows = await db.query('SELECT * FROM api_key WHERE id = ?', [req.params.id]);
    if (!rows[0]) throw notFound('API key not found');
    await db.query('DELETE FROM api_key WHERE id = ?', [req.params.id]);
    await writeAudit(req, 'delete', 'api_key', req.params.id, { name: rows[0].name, scopes: rows[0].scopes, is_active: rows[0].is_active }, null);
    res.json({ ok: true });
  }));

  // Rotates the credential in place — same row (id/name/scopes/created_by unchanged), brand new
  // secret. Optionally pushes the expiry out too. Returns the new plaintext exactly once, same
  // shape as creation, so the frontend's existing one-time-reveal flow works unchanged.
  keys.post('/:id/renew', asyncHandler(async (req, res) => {
    const rows = await db.query('SELECT * FROM api_key WHERE id = ?', [req.params.id]);
    if (!rows[0]) throw notFound('API key not found');
    const expiresAt = req.body && req.body.expires_at ? req.body.expires_at : rows[0].expires_at;

    const { plaintext, prefix, hash } = await generateApiKey();
    await db.query('UPDATE api_key SET key_prefix = ?, key_hash = ?, expires_at = ? WHERE id = ?', [prefix, hash, expiresAt, req.params.id]);
    await writeAudit(req, 'renew', 'api_key', req.params.id, { key_prefix: rows[0].key_prefix }, { key_prefix: prefix });
    res.json({ data: { id: Number(req.params.id), key: plaintext, prefix } });
  }));

  router.use('/keys', keys);

  // ============================== External systems: data pulls ==============================
  router.use(apiKeyAuth);

  // Field set was widened deliberately (an explicit later decision, not the default) to cover "most
  // data fields" a consuming system's own UI would want to render — name variants, contact details,
  // a profile photo, org placement, grade, line manager. The boundary that does NOT move: national
  // ID, date of birth, next-of-kin, home address, marital status, bank/tax details never appear on
  // this API at any scope — see "What is deliberately NOT exposed" in docs/INTEGRATION.md. photo_url
  // here is a link back to THIS endpoint's own photo route (below), never the internal /uploads path
  // (which requires a browser session and wouldn't resolve for a server-to-server caller anyway).
  router.get('/employees', requireApiScope('employees:read'), asyncHandler(async (req, res) => {
    const where = ["1=1"];
    const params = [];
    if (req.query.status) { where.push('p.status = ?'); params.push(req.query.status); }
    if (req.query.updated_since) { where.push('p.updated_at > ?'); params.push(req.query.updated_since); }

    const rows = await db.query(
      `SELECT p.employee_no, p.full_legal_name, p.preferred_name, p.email, p.phone, p.gender,
              p.photo_url, p.status, p.updated_at,
              e.position_title, e.contract_type, e.start_date, e.grade, e.duty_station,
              e.reports_to_employee_no, ou.name AS department,
              r.name AS role_name, u.is_active AS has_login
      FROM person p
      LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
      LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
      LEFT JOIN app_user u ON u.employee_no = p.employee_no
      LEFT JOIN role r ON r.id = u.role_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.full_legal_name`,
      params
    );
    rows.forEach((r) => { r.has_login = !!r.has_login; });
    rows.forEach((r) => {
      r.photo_url = r.photo_url ? `/api/v1/integration/employees/${r.employee_no}/photo` : null;
    });
    await writeAudit(req, 'export', 'employee', 'bulk', null, { query: req.query, count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: rows });
  }));

  // Streams the decrypted photo — mirrors platform/fileServe.js's serveEncryptedDir, but as a single
  // bearer-token-authenticated route rather than a static mount, since /uploads itself requires a
  // browser session an external system doesn't have.
  router.get('/employees/:employeeNo/photo', requireApiScope('employees:read'), asyncHandler(async (req, res) => {
    const rows = await db.query('SELECT photo_url FROM person WHERE employee_no = ?', [req.params.employeeNo]);
    if (!rows[0] || !rows[0].photo_url) throw notFound('No photo on file for this employee');

    const filePath = path.join(UPLOAD_DIR, path.basename(rows[0].photo_url));
    fs.readFile(filePath, (err, buf) => {
      if (err) return res.status(404).json({ error: 'Photo file missing on disk' });
      const plain = enc.decryptBufferTolerant(buf);
      const ext = path.extname(filePath).toLowerCase();
      const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(plain);
    });
  }));

  router.get('/employees/:employeeNo/timesheets', requireApiScope('timesheets:read'), asyncHandler(async (req, res) => {
    const person = await db.query('SELECT employee_no FROM person WHERE employee_no = ?', [req.params.employeeNo]);
    if (!person[0]) throw notFound('Employee not found');

    const where = ['wt.employee_no = ?'];
    const params = [req.params.employeeNo];
    if (req.query.from) { where.push('wt.clock_in >= ?'); params.push(req.query.from); }
    if (req.query.to) { where.push('wt.clock_in <= ?'); params.push(req.query.to); }

    const rows = await db.query(
      `SELECT wt.id, wt.employee_no, wt.clock_in, wt.clock_out, wt.source, wt.device
      FROM work_timer wt WHERE ${where.join(' AND ')} ORDER BY wt.clock_in DESC`,
      params
    );
    await writeAudit(req, 'export', 'timesheet', req.params.employeeNo, null, { query: req.query, count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: rows });
  }));

  // Write-back: lets a device-tracking system (or a fleet vehicle log) record a clock event on an
  // employee's behalf. Mirrors src/routes/attendance.routes.js's own POST /clock-in and
  // POST /clock-out exactly (same "already clocked in today" guard, same shift_pattern_id
  // fallback, same audit pattern) — the only differences are the target employee comes from the
  // URL instead of the session, and `source` defaults to 'mobile_gps' instead of 'web' ('web' is
  // reserved for a clock-in made through the HRIS browser UI itself and is rejected here).
  const CLOCK_IN_SOURCES = ['terminal', 'mobile_gps', 'vehicle_log'];

  router.post('/employees/:employeeNo/clock-in', requireApiScope('timesheets:create'), asyncHandler(async (req, res) => {
    const person = await db.query('SELECT employee_no FROM person WHERE employee_no = ?', [req.params.employeeNo]);
    if (!person[0]) throw notFound('Employee not found');

    const source = (req.body && req.body.source) || 'mobile_gps';
    if (!CLOCK_IN_SOURCES.includes(source)) {
      throw badRequest(`Invalid source — must be one of: ${CLOCK_IN_SOURCES.join(', ')} ("web" is reserved for the HRIS browser UI)`);
    }
    const device = (req.body && req.body.device) || null;
    const geo = (req.body && req.body.geo) || null;

    const open = await db.query(
      `SELECT id FROM work_timer WHERE employee_no = ? AND clock_out IS NULL AND DATE(clock_in) = CURDATE()`,
      [req.params.employeeNo]
    );
    if (open[0]) throw conflict('Already clocked in — clock out first');

    const standard = await db.query(`SELECT id FROM shift_pattern WHERE name = 'Standard day' LIMIT 1`);
    const shiftPatternId = standard[0] ? standard[0].id : null;

    const result = await db.query(
      `INSERT INTO work_timer (employee_no, shift_pattern_id, clock_in, source, device, geo) VALUES (?, ?, NOW(), ?, ?, ?)`,
      [req.params.employeeNo, shiftPatternId, source, device, geo]
    );
    await writeAudit(req, 'create', 'work_timer', result.insertId, null, { clock_in: 'now', source }, { consumer: req.apiKey.name });
    res.status(201).json({ data: { id: result.insertId, employee_no: req.params.employeeNo, source } });
  }));

  router.post('/employees/:employeeNo/clock-out', requireApiScope('timesheets:update'), asyncHandler(async (req, res) => {
    const open = await db.query(
      `SELECT id FROM work_timer WHERE employee_no = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`,
      [req.params.employeeNo]
    );
    if (!open[0]) throw notFound('No open timer to clock out of');

    await db.query('UPDATE work_timer SET clock_out = NOW() WHERE id = ?', [open[0].id]);
    await writeAudit(req, 'update', 'work_timer', open[0].id, { clock_out: null }, { clock_out: 'now' }, { consumer: req.apiKey.name });
    res.json({ data: { id: open[0].id, employee_no: req.params.employeeNo } });
  }));

  router.get('/timesheets', requireApiScope('timesheets:read'), asyncHandler(async (req, res) => {
    const where = ['1=1'];
    const params = [];
    if (req.query.from) { where.push('wt.clock_in >= ?'); params.push(req.query.from); }
    if (req.query.to) { where.push('wt.clock_in <= ?'); params.push(req.query.to); }
    if (req.query.department) { where.push('ou.name = ?'); params.push(req.query.department); }

    const rows = await db.query(
      `SELECT wt.id, wt.employee_no, p.full_legal_name, ou.name AS department, wt.clock_in, wt.clock_out, wt.source, wt.device
      FROM work_timer wt
      JOIN person p ON p.employee_no = wt.employee_no
      LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
      LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
      WHERE ${where.join(' AND ')}
      ORDER BY wt.clock_in DESC
      LIMIT 5000`,
      params
    );
    await writeAudit(req, 'export', 'timesheet', 'bulk', null, { query: req.query, count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: rows });
  }));

  // ------------------------------ Org structure ------------------------------
  // Department/committee hierarchy + cost centres — the accounting system uses this to map
  // timesheet/payroll rows to a GL cost centre; the fleet/logistics system uses it to route by
  // duty station. No people data beyond the unit lead's employee_no.
  router.get('/org-units', requireApiScope('org:read'), asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT ou.id, ou.kind, ou.name, ou.parent_id, ou.cost_centre, ou.duty_station, ou.lead_employee_no,
              (SELECT COUNT(*) FROM employment e WHERE e.department_org_unit_id = ou.id AND e.is_current = 1) AS current_headcount
      FROM org_unit ou ORDER BY ou.parent_id IS NULL DESC, ou.name`
    );
    await writeAudit(req, 'export', 'org_unit', 'bulk', null, { count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: rows });
  }));

  // ------------------------------ Leave ------------------------------
  // Approved/pending leave windows — lets a scheduling system (fleet/logistics dispatch, shift
  // planning) avoid rostering someone who is on leave, and gives accounting the unpaid-leave
  // context behind a payroll deduction. Deliberately excludes the `reason` free-text field — dates
  // and status are what an external scheduler needs, not why.
  router.get('/employees/:employeeNo/leave', requireApiScope('leave:read'), asyncHandler(async (req, res) => {
    const person = await db.query('SELECT employee_no FROM person WHERE employee_no = ?', [req.params.employeeNo]);
    if (!person[0]) throw notFound('Employee not found');

    const where = ['lr.employee_no = ?'];
    const params = [req.params.employeeNo];
    if (req.query.status) { where.push('lr.status = ?'); params.push(req.query.status); }
    if (req.query.from) { where.push('lr.end_date >= ?'); params.push(req.query.from); }
    if (req.query.to) { where.push('lr.start_date <= ?'); params.push(req.query.to); }

    const rows = await db.query(
      `SELECT lr.id, lr.employee_no, lt.name AS leave_type, lr.start_date, lr.end_date, lr.days, lr.status
      FROM leave_request lr JOIN leave_type lt ON lt.id = lr.leave_type_id
      WHERE ${where.join(' AND ')} ORDER BY lr.start_date DESC`,
      params
    );
    await writeAudit(req, 'export', 'leave_request', req.params.employeeNo, null, { query: req.query, count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: rows });
  }));

  router.get('/leave', requireApiScope('leave:read'), asyncHandler(async (req, res) => {
    const where = ['1=1'];
    const params = [];
    if (req.query.status) { where.push('lr.status = ?'); params.push(req.query.status); }
    if (req.query.from) { where.push('lr.end_date >= ?'); params.push(req.query.from); }
    if (req.query.to) { where.push('lr.start_date <= ?'); params.push(req.query.to); }
    if (req.query.department) { where.push('ou.name = ?'); params.push(req.query.department); }

    const rows = await db.query(
      `SELECT lr.id, lr.employee_no, p.full_legal_name, ou.name AS department, lt.name AS leave_type,
              lr.start_date, lr.end_date, lr.days, lr.status
      FROM leave_request lr
      JOIN person p ON p.employee_no = lr.employee_no
      JOIN leave_type lt ON lt.id = lr.leave_type_id
      LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
      LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
      WHERE ${where.join(' AND ')} ORDER BY lr.start_date DESC LIMIT 5000`,
      params
    );
    await writeAudit(req, 'export', 'leave_request', 'bulk', null, { query: req.query, count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: rows });
  }));

  // ------------------------------ Payroll (accounting) ------------------------------
  // Gross/net figures for GL posting — bank_account and tax_number stay internal-only, same as
  // every other surface in this app; an accounting system reconciles by employee_no + period, it
  // doesn't need to originate the actual bank payment (that stays this app's own payroll module).
  router.get('/payroll/runs', requireApiScope('payroll:read'), asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT r.id, r.period, r.status, r.paid_at, COUNT(pl.id) AS employee_count, COALESCE(SUM(pl.net), 0) AS net_total
      FROM payroll_run r LEFT JOIN payline pl ON pl.payroll_run_id = r.id
      GROUP BY r.id ORDER BY r.period DESC`
    );
    await writeAudit(req, 'export', 'payroll_run', 'bulk', null, { count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: rows });
  }));

  router.get('/payroll/runs/:id/lines', requireApiScope('payroll:read'), asyncHandler(async (req, res) => {
    const runs = await db.query('SELECT id, period, status FROM payroll_run WHERE id = ?', [req.params.id]);
    if (!runs[0]) throw notFound('Payroll run not found');

    const rows = await db.query(
      `SELECT pl.employee_no, p.full_legal_name, ou.name AS department, pl.basic, pl.allowances, pl.overtime, pl.deductions, pl.net
      FROM payline pl
      JOIN person p ON p.employee_no = pl.employee_no
      LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
      LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
      WHERE pl.payroll_run_id = ? ORDER BY p.full_legal_name`,
      [req.params.id]
    );
    await writeAudit(req, 'export', 'payroll_run', req.params.id, null, { count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: { ...runs[0], lines: rows } });
  }));

  // Write-back: the accounting system disburses the actual payment outside HRIS, then calls this
  // once it's done. Only valid from 'approved_ed' — HRIS's own approval chain must already have
  // completed; this cannot be used to skip it, only to complete the final step once HRIS has
  // already signed off. Fires the identical payslip-ready notification the internal manual
  // advance-to-paid path sends (see POST /payroll/runs/:id/advance in payroll.routes.js) so an
  // employee's notification doesn't depend on which of the two paths marked their run paid.
  router.post('/payroll/runs/:id/mark-paid', requireApiScope('payroll:update'), asyncHandler(async (req, res) => {
    const runs = await db.query('SELECT * FROM payroll_run WHERE id = ?', [req.params.id]);
    if (!runs[0]) throw notFound('Payroll run not found');
    const run = runs[0];
    if (run.status !== 'approved_ed') {
      throw badRequest(`Cannot mark paid — run is "${run.status}", not "approved_ed". HRIS's own approval chain must complete first.`);
    }

    const paymentReference = req.body && req.body.payment_reference ? String(req.body.payment_reference) : null;
    const paidAt = req.body && req.body.paid_at ? new Date(req.body.paid_at) : new Date();
    if (Number.isNaN(paidAt.getTime())) throw badRequest('Invalid paid_at date');

    await db.query(
      `UPDATE payroll_run SET status = 'paid', paid_at = ?, paid_via = 'accounting_integration', payment_reference = ? WHERE id = ?`,
      [paidAt, paymentReference, req.params.id]
    );
    await writeAudit(
      req, 'mark_paid', 'payroll_run', req.params.id,
      { status: 'approved_ed' }, { status: 'paid', payment_reference: paymentReference },
      { consumer: req.apiKey.name }
    );

    const paylines = await db.query(
      `SELECT p.email, p.full_legal_name FROM payline pl JOIN person p ON p.employee_no = pl.employee_no WHERE pl.payroll_run_id = ?`,
      [req.params.id]
    );
    for (const pl of paylines) {
      try { await notify.payslipReleased(pl.email, pl.full_legal_name, run.period); } catch (err) { req.log.error('payslip notify failed', { error: err.message }); }
    }

    res.json({ data: { id: Number(req.params.id), status: 'paid', paid_via: 'accounting_integration', payment_reference: paymentReference } });
  }));

  // ------------------------------ Certifications ------------------------------
  // Compliance monitoring — a fleet/logistics system needs to know a driver's licence or safety
  // certification is about to lapse before dispatching them.
  router.get('/employees/:employeeNo/certifications', requireApiScope('certifications:read'), asyncHandler(async (req, res) => {
    const person = await db.query('SELECT employee_no FROM person WHERE employee_no = ?', [req.params.employeeNo]);
    if (!person[0]) throw notFound('Employee not found');

    const rows = await db.query(
      `SELECT id, name, issued_at, expires_at, issuing_body FROM certification WHERE employee_no = ? ORDER BY expires_at`,
      [req.params.employeeNo]
    );
    await writeAudit(req, 'export', 'certification', req.params.employeeNo, null, { count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: rows });
  }));

  router.get('/certifications', requireApiScope('certifications:read'), asyncHandler(async (req, res) => {
    const where = ['1=1'];
    const params = [];
    if (req.query.expiring_within_days) {
      where.push('c.expires_at IS NOT NULL AND c.expires_at BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)');
      params.push(parseInt(req.query.expiring_within_days, 10) || 0);
    }
    const rows = await db.query(
      `SELECT c.id, c.employee_no, p.full_legal_name, c.name, c.issued_at, c.expires_at, c.issuing_body
      FROM certification c JOIN person p ON p.employee_no = c.employee_no
      WHERE ${where.join(' AND ')} ORDER BY c.expires_at`,
      params
    );
    await writeAudit(req, 'export', 'certification', 'bulk', null, { query: req.query, count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: rows });
  }));

  // ------------------------------ Devices ------------------------------
  // Which device/extension is assigned to which employee — for the smartphone tracking system to
  // correlate a tracked device back to a person. Deliberately excludes SIP credentials, voicemail
  // PIN, and emergency/forwarding numbers, none of which a device-tracking system needs.
  router.get('/employees/:employeeNo/device', requireApiScope('devices:read'), asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT employee_no, extension, status, device_assigned FROM voip_extension WHERE employee_no = ?`,
      [req.params.employeeNo]
    );
    if (!rows[0]) throw notFound('No device assignment for this employee');
    await writeAudit(req, 'export', 'device', req.params.employeeNo, null, {}, { consumer: req.apiKey.name });
    res.json({ data: rows[0] });
  }));

  router.get('/devices', requireApiScope('devices:read'), asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT v.employee_no, p.full_legal_name, v.extension, v.status, v.device_assigned, ou.name AS department
      FROM voip_extension v
      JOIN person p ON p.employee_no = v.employee_no
      LEFT JOIN org_unit ou ON ou.id = v.department_org_unit_id
      ORDER BY p.full_legal_name`
    );
    await writeAudit(req, 'export', 'device', 'bulk', null, { count: rows.length }, { consumer: req.apiKey.name });
    res.json({ data: rows });
  }));

  // ------------------------------ Audit (write-only) ------------------------------
  // Lets an integrating system push its OWN privileged-action log into the HRIS's central audit
  // trail — e.g. the smartphone tracking system recording "a supervisor granted a geofence
  // override" here too, so "who did what, when" is answerable from one place across systems rather
  // than split across each system's own log. This is distinct from the automatic export-audit rows
  // every GET above already writes (those record "this key pulled this data"); this endpoint lets
  // the OTHER system tell HRIS about something that happened entirely on its own side. No read, no
  // update, no delete — a write-only log sink. `entity_type` is stored exactly as given (NOT
  // prefixed with the consumer name — an earlier version did that and silently truncated against
  // the column's 60-char limit whenever the key's own name was long); the `consumer` column already
  // unambiguously attributes the row to the calling system, same as it does for every export row
  // above, so a reader can always tell an external-system row apart from one HRIS wrote about itself.
  router.post('/audit-events', requireApiScope('audit:create'), asyncHandler(async (req, res) => {
    const parsed = auditEventCreateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid audit event', parsed.error.flatten());
    const { action, entity_type, entity_id, actor_employee_no, note } = parsed.data;

    let actor = null;
    if (actor_employee_no) {
      const person = await db.query('SELECT employee_no FROM person WHERE employee_no = ?', [actor_employee_no]);
      if (person[0]) actor = actor_employee_no;
    }

    const result = await db.query(
      `INSERT INTO audit_event (actor_employee_no, action, entity_type, entity_id, before_json, after_json, ip, consumer)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
      [actor, action, entity_type, entity_id ? String(entity_id) : null,
        note ? JSON.stringify({ note }) : null, req.headers['x-forwarded-for'] || req.socket.remoteAddress || '', req.apiKey.name]
    );
    res.status(201).json({ data: { id: result.insertId } });
  }));

  // ------------------------------ MFA (ecosystem authenticator) ------------------------------
  // Makes the HRIS the single MFA authority across every system in the ecosystem: an employee who
  // has already enrolled an authenticator app (or email codes) here should never be asked to enrol
  // again in SPTS, or any future system — that system just asks HRIS "is this employee covered, and
  // is this code right?" The raw TOTP secret NEVER crosses this API in either direction; only a
  // yes/no status and a yes/no verification answer do.
  router.get('/employees/:employeeNo/mfa-status', requireApiScope('mfa:read'), asyncHandler(async (req, res) => {
    const rows = await db.query(
      'SELECT totp_enabled, email_otp_enabled FROM app_user WHERE employee_no = ? AND is_active = 1',
      [req.params.employeeNo]
    );
    if (!rows[0]) throw notFound('Employee not found or has no HRIS login');
    res.json({ data: { totp_enabled: !!rows[0].totp_enabled, email_otp_enabled: !!rows[0].email_otp_enabled } });
  }));

  // Generates and emails a code the SAME way the browser login flow does (notify.securityOtp), but
  // stores its hash in `mfa_challenge` (employee_no-keyed) instead of a browser session, since the
  // caller here has no session with HRIS at all.
  router.post('/employees/:employeeNo/mfa/send-email-code', requireApiScope('mfa:create'), asyncHandler(async (req, res) => {
    const rows = await db.query('SELECT email, email_otp_enabled FROM app_user WHERE employee_no = ? AND is_active = 1', [req.params.employeeNo]);
    if (!rows[0]) throw notFound('Employee not found or has no HRIS login');
    if (!rows[0].email_otp_enabled) throw badRequest('Email code sign-in is not enabled for this employee on the HRIS');

    const code = generateEmailOtp();
    const codeHash = await hashCode(code);
    await db.query(
      `INSERT INTO mfa_challenge (employee_no, code_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [req.params.employeeNo, codeHash]
    );
    await notify.securityOtp(rows[0].email, code);
    res.json({ data: { sentTo: rows[0].email.replace(/^(.{2}).*(@.*)$/, '$1***$2') } });
  }));

  router.post('/employees/:employeeNo/mfa/verify', requireApiScope('mfa:create'), asyncHandler(async (req, res) => {
    const parsed = mfaVerifyIntegrationSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid verification request', parsed.error.flatten());
    const { code, method } = parsed.data;

    const users = await db.query(
      'SELECT id, totp_secret, totp_enabled, email_otp_enabled FROM app_user WHERE employee_no = ? AND is_active = 1',
      [req.params.employeeNo]
    );
    if (!users[0]) throw notFound('Employee not found or has no HRIS login');
    const user = users[0];

    let valid = false;
    if (method === 'totp' && user.totp_enabled) {
      valid = verifyTotp(code, enc.decrypt(user.totp_secret));
    } else if (method === 'email' && user.email_otp_enabled) {
      const pending = await db.query(
        `SELECT id, code_hash FROM mfa_challenge WHERE employee_no = ? AND consumed_at IS NULL AND expires_at > NOW() ORDER BY id DESC LIMIT 1`,
        [req.params.employeeNo]
      );
      if (pending[0] && await verifyCode(code, pending[0].code_hash)) {
        await db.query('UPDATE mfa_challenge SET consumed_at = NOW() WHERE id = ?', [pending[0].id]);
        valid = true;
      }
    } else if (method === 'backup') {
      const backupRows = await db.query('SELECT id, code_hash FROM mfa_backup_code WHERE app_user_id = ? AND used_at IS NULL', [user.id]);
      for (const row of backupRows) {
        if (await verifyCode(String(code).trim().toUpperCase(), row.code_hash)) {
          await db.query('UPDATE mfa_backup_code SET used_at = NOW() WHERE id = ?', [row.id]);
          valid = true;
          break;
        }
      }
    }

    await writeAudit(req, valid ? 'mfa.verify.ok' : 'mfa.verify.fail', 'app_user', req.params.employeeNo, null, { method }, { consumer: req.apiKey.name });
    res.json({ data: { valid } });
  }));

  // ------------------------------ Identity (login delegation) ------------------------------
// The HRIS is the ecosystem's single account, not a template other apps copy — this is the
// endpoint that makes that real: another system's own login form calls this instead of keeping a
// local password_hash. Deliberately reuses the EXACT SAME check the browser login route
// (auth.routes.js POST /login) runs — same lockout counters on the same app_user row, so a
// brute-force attempt through SPTS's login page locks the account out of the HRIS's own login too,
// and vice versa. The password and its hash never leave this function; only true/false (plus
// employee_no on success) crosses the API boundary.
router.post('/auth/verify-login', requireApiScope('identity:create'), asyncHandler(async (req, res) => {
  const parsed = loginVerifyIntegrationSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid email or password');
  const { email, password } = parsed.data;

  const rows = await db.query(
    `SELECT u.id, u.employee_no, u.password_hash, u.is_active, u.failed_attempts, u.locked_until, p.full_legal_name
     FROM app_user u JOIN person p ON p.employee_no = u.employee_no WHERE u.email = ?`,
    [email]
  );
  const user = rows[0];
  if (!user || !user.is_active) {
    await writeAudit(req, 'identity.verify_login.no_such_user', 'app_user', email, null, null, { consumer: req.apiKey.name });
    return res.json({ data: { valid: false, locked: false } });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    return res.json({ data: { valid: false, locked: true, minutes_left: minutesLeft } });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    const nextFailed = user.failed_attempts + 1;
    if (nextFailed >= LOCKOUT_DEFAULT_ATTEMPTS) {
      await db.query('UPDATE app_user SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?', [LOCKOUT_DEFAULT_WINDOW_MIN, user.id]);
      await writeAudit(req, 'identity.verify_login.lockout', 'app_user', user.employee_no, null, { attempts: nextFailed }, { consumer: req.apiKey.name });
    } else {
      await db.query('UPDATE app_user SET failed_attempts = ? WHERE id = ?', [nextFailed, user.id]);
    }
    return res.json({ data: { valid: false, locked: false } });
  }

  await db.query('UPDATE app_user SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
  await writeAudit(req, 'identity.verify_login.ok', 'app_user', user.employee_no, null, null, { consumer: req.apiKey.name });
  res.json({ data: { valid: true, employee_no: user.employee_no, full_legal_name: user.full_legal_name } });
}));

module.exports = router;
