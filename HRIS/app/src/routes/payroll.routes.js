const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound, conflict } = require('../platform/errors');
const { requireScope, scopeFilterSql, scopeMeta } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { notify } = require('../platform/mailer');
const { paylineUpdateSchema, payrollRunCreateSchema, bulkAdjustSchema } = require('../validators/payroll.validators');
const enc = require('../platform/crypto');
const rk = require('../platform/reportKit');

const router = express.Router();

// bank_account and tax_number are stored AES-256-GCM encrypted — decrypt on every payline read,
// encrypt on every write. Centralized so no read/write site here reimplements the field list.
function decryptPayline(row) {
  if (!row) return row;
  row.bank_account = enc.decrypt(row.bank_account);
  row.tax_number = enc.decrypt(row.tax_number);
  return row;
}

// Itemized allowance/deduction lines for a payline — optional, additive detail on top of the
// payline's own allowances/deductions totals. See payline_item's schema comment for the
// source-of-truth rule: these totals are always kept in sync with the sum of their items.
async function getPaylineItems(paylineId) {
  return db.query('SELECT id, kind, label, amount, sort_order FROM payline_item WHERE payline_id = ? ORDER BY kind, sort_order, id', [paylineId]);
}

async function attachItems(rows) {
  for (const row of rows) row.items = await getPaylineItems(row.id);
  return rows;
}

const SEQUENCE = ['draft', 'inputs_locked', 'in_review', 'approved_finance', 'approved_ed', 'paid', 'closed'];

router.get('/runs', requireScope('payroll', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT r.*, COUNT(pl.id) AS employee_count, COALESCE(SUM(pl.net), 0) AS net_total
     FROM payroll_run r
     LEFT JOIN payline pl ON pl.payroll_run_id = r.id
     GROUP BY r.id
     ORDER BY r.period DESC`
  );
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/runs/:id', requireScope('payroll', 'read'), asyncHandler(async (req, res) => {
  const runs = await db.query('SELECT * FROM payroll_run WHERE id = ?', [req.params.id]);
  if (!runs[0]) throw notFound('Payroll run not found');

  const filter = await scopeFilterSql(req.scope, req.session.user, 'pl.employee_no');
  const paylines = await db.query(
    `SELECT pl.*, p.full_legal_name
     FROM payline pl JOIN person p ON p.employee_no = pl.employee_no
     WHERE pl.payroll_run_id = ? AND ${filter.clause}
     ORDER BY p.full_legal_name`,
    [req.params.id, ...filter.params]
  );
  paylines.forEach(decryptPayline);
  await attachItems(paylines);

  res.json({ data: { ...runs[0], paylines }, meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/paylines', requireScope('payroll', 'read'), asyncHandler(async (req, res) => {
  const employeeNo = req.query.employee_no || req.session.user.employeeNo;
  const filter = await scopeFilterSql(req.scope, req.session.user, 'pl.employee_no');
  const rows = await db.query(
    `SELECT pl.*, r.period, r.status AS run_status
     FROM payline pl JOIN payroll_run r ON r.id = pl.payroll_run_id
     WHERE pl.employee_no = ? AND ${filter.clause}
     ORDER BY r.period DESC`,
    [employeeNo, ...filter.params]
  );
  rows.forEach(decryptPayline);
  await attachItems(rows);
  res.json({ data: rows, meta: { scope: scopeMeta(req.scope) } });
}));

// Employee-facing payslip download — the same scope filter as /paylines and /runs/:id applied
// to a single-row lookup, so a payline that isn't the caller's own (and isn't in a wider
// scope's reach) 404s exactly like it doesn't exist, rather than a separate 403 check.
router.get('/paylines/:id/payslip.pdf', requireScope('payroll', 'read'), asyncHandler(async (req, res) => {
  const filter = await scopeFilterSql(req.scope, req.session.user, 'pl.employee_no');
  const rows = await db.query(
    `SELECT pl.*, r.period, r.status AS run_status, p.employee_no, p.full_legal_name,
            e.position_title, ou.name AS department
     FROM payline pl
     JOIN payroll_run r ON r.id = pl.payroll_run_id
     JOIN person p ON p.employee_no = pl.employee_no
     LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
     LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
     WHERE pl.id = ? AND ${filter.clause}`,
    [req.params.id, ...filter.params]
  );
  if (!rows[0]) throw notFound('Payslip not found');
  const payline = decryptPayline(rows[0]);
  const items = await getPaylineItems(payline.id);

  const orgInfo = await rk.getOrgInfo(db);
  await writeAudit(req, 'export', 'payslip', req.params.id, null, { period: payline.period });

  // Masked for display — this is an internal document about the employee's own pay (an employee
  // seeing the last 4 digits of their own bank account on their own payslip is normal), never the
  // full number. The full number stays visible only in the admin compensation drawer.
  const maskedBankAccount = payline.bank_account ? `••••${String(payline.bank_account).slice(-4)}` : null;

  rk.buildPayslipPdf(
    {
      orgInfo,
      person: { employee_no: payline.employee_no, full_legal_name: payline.full_legal_name },
      run: { period: payline.period, status: payline.run_status },
      payline,
      items,
      position: payline.position_title,
      department: payline.department,
      maskedBankAccount,
      taxNumber: payline.tax_number,
    },
    res,
    `payslip-${payline.employee_no}-${payline.period}.pdf`
  );
}));

router.post('/runs', requireScope('payroll', 'create'), asyncHandler(async (req, res) => {
  const parsed = payrollRunCreateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid payroll run data', parsed.error.flatten());
  const { period } = parsed.data;

  const existing = await db.query('SELECT id FROM payroll_run WHERE period = ?', [period]);
  if (existing[0]) throw conflict(`A payroll run for ${period} already exists`);

  const result = await db.query(
    `INSERT INTO payroll_run (period, status, created_by_employee_no) VALUES (?, 'draft', ?)`,
    [period, req.session.user.employeeNo]
  );
  await writeAudit(req, 'create', 'payroll_run', result.insertId, null, { period });
  res.status(201).json({ data: { id: result.insertId } });
}));

// Creating a run only inserts the run header — this populates one payline per active employee
// not already in the run. Each new payline carries forward that employee's basic/allowances/
// deductions (and any itemized breakdown) from their own most recent EARLIER-period payline, if
// they have one — this is what makes a bulk percentage increment/COLA/bonus meaningful the
// following month instead of starting every run from zero. Overtime never carries forward (it's
// genuinely per-period). An employee with no prior payline anywhere still starts at zero, exactly
// as before.
router.post('/runs/:id/populate', requireScope('payroll', 'create'), asyncHandler(async (req, res) => {
  const runs = await db.query('SELECT * FROM payroll_run WHERE id = ?', [req.params.id]);
  if (!runs[0]) throw notFound('Payroll run not found');
  if (!['draft', 'inputs_locked'].includes(runs[0].status)) throw conflict('Payroll inputs are locked for this run');

  const missing = await db.query(
    `SELECT p.employee_no FROM person p
     WHERE p.status = 'active' AND NOT EXISTS (SELECT 1 FROM payline pl WHERE pl.payroll_run_id = ? AND pl.employee_no = p.employee_no)`,
    [req.params.id]
  );

  await db.tx(async (t) => {
    for (const row of missing) {
      const prior = await t.query(
        `SELECT pl.* FROM payline pl JOIN payroll_run r ON r.id = pl.payroll_run_id
         WHERE pl.employee_no = ? AND r.period < ? ORDER BY r.period DESC LIMIT 1`,
        [row.employee_no, runs[0].period]
      );
      let base = prior[0];
      if (!base) {
        // No payroll history at all (a brand-new hire's first run) — start them at their current
        // employment record's basic_salary instead of a hardcoded zero, so setting a salary when
        // adding an employee actually flows through to their first payslip.
        const current = await t.query(
          `SELECT basic_salary FROM employment WHERE employee_no = ? AND is_current = 1 LIMIT 1`,
          [row.employee_no]
        );
        base = { basic: (current[0] && current[0].basic_salary) || 0, allowances: 0, deductions: 0 };
      }
      const net = Number(base.basic) + Number(base.allowances) - Number(base.deductions);
      const result = await t.query(
        `INSERT INTO payline (payroll_run_id, employee_no, basic, allowances, overtime, deductions, net, bank_account, tax_number)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [req.params.id, row.employee_no, base.basic, base.allowances, base.deductions, net, base.bank_account || null, base.tax_number || null]
      );
      if (prior[0]) {
        const priorItems = await t.query('SELECT kind, label, amount, sort_order FROM payline_item WHERE payline_id = ?', [prior[0].id]);
        for (const item of priorItems) {
          await t.query(
            'INSERT INTO payline_item (payline_id, kind, label, amount, sort_order) VALUES (?, ?, ?, ?, ?)',
            [result.insertId, item.kind, item.label, item.amount, item.sort_order]
          );
        }
      }
    }
  });

  await writeAudit(req, 'create', 'payline', req.params.id, null, { added: missing.length });
  res.status(201).json({ data: { added: missing.length } });
}));

// Applies one pay decision (a percentage increment, a COLA, or a bonus) across every payline
// resolved by `target` in a single request, instead of hand-editing each employee's payline —
// see bulkAdjustSchema for the accepted shapes. `increment_percent` changes `basic` directly (a
// raise to base pay); `cola`/`bonus` are each recorded as a new payline_item so the reason for
// the change stays visible on every affected payslip, not folded anonymously into a flat total.
router.post('/runs/:id/bulk-adjust', requireScope('payroll', 'update'), asyncHandler(async (req, res) => {
  const runs = await db.query('SELECT * FROM payroll_run WHERE id = ?', [req.params.id]);
  if (!runs[0]) throw notFound('Payroll run not found');
  if (!['draft', 'inputs_locked'].includes(runs[0].status)) throw conflict('Payroll inputs are locked for this run');

  const parsed = bulkAdjustSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid bulk adjustment', parsed.error.flatten());
  const d = parsed.data;

  let targetClause = '1=1';
  let targetParams = [];
  if (d.target === 'department') {
    targetClause = `pl.employee_no IN (
      SELECT e.employee_no FROM employment e WHERE e.department_org_unit_id = ? AND e.is_current = 1
    )`;
    targetParams = [d.department_org_unit_id];
  } else if (d.target === 'selected') {
    targetClause = `pl.employee_no IN (${d.employee_nos.map(() => '?').join(',')})`;
    targetParams = d.employee_nos;
  }

  const paylines = await db.query(
    `SELECT pl.* FROM payline pl WHERE pl.payroll_run_id = ? AND ${targetClause}`,
    [req.params.id, ...targetParams]
  );
  if (!paylines.length) throw badRequest('No paylines matched this target');

  await db.tx(async (t) => {
    for (const pl of paylines) {
      let basic = Number(pl.basic);
      let allowances = Number(pl.allowances);

      if (d.type === 'increment_percent') {
        basic = Math.round(basic * (1 + d.value / 100) * 100) / 100;
      } else {
        const amount = d.type === 'cola' && d.mode === 'flat' ? d.value
          : d.type === 'cola' ? Math.round(basic * d.value / 100 * 100) / 100
          : d.value; // bonus — always flat

        // A payline that has never been itemized has its whole allowance total sitting in the
        // flat `allowances` column, not in any payline_item row. Adding a COLA/bonus item and
        // then recomputing allowances as "sum of items" would silently DISCARD that pre-existing
        // flat total rather than adding on top of it — caught via manual verification (a COLA on
        // a payline with allowances=1200 collapsed it to just the new item's amount). Fix: convert
        // the existing flat total into a baseline "Allowances" item first, exactly once, only for
        // a payline that has no allowance items yet — every subsequent bulk adjustment on the same
        // payline just adds another item on top, nothing is ever converted twice.
        const existingAllowanceItems = await t.query(
          "SELECT id FROM payline_item WHERE payline_id = ? AND kind = 'allowance'", [pl.id]
        );
        if (!existingAllowanceItems.length && allowances > 0) {
          await t.query(
            "INSERT INTO payline_item (payline_id, kind, label, amount, sort_order) VALUES (?, 'allowance', 'Allowances', ?, 0)",
            [pl.id, allowances]
          );
        }
        await t.query(
          "INSERT INTO payline_item (payline_id, kind, label, amount, sort_order) VALUES (?, 'allowance', ?, ?, 999)",
          [pl.id, d.label, amount]
        );
        const items = await t.query("SELECT amount FROM payline_item WHERE payline_id = ? AND kind = 'allowance'", [pl.id]);
        allowances = items.reduce((s, i) => s + Number(i.amount), 0);
      }

      const net = basic + allowances + Number(pl.overtime) - Number(pl.deductions);
      await t.query('UPDATE payline SET basic = ?, allowances = ?, net = ? WHERE id = ?', [basic, allowances, net, pl.id]);
    }
  });

  await writeAudit(req, 'bulk_adjust', 'payroll_run', req.params.id, null, {
    type: d.type, value: d.value, mode: d.mode, label: d.label, target: d.target, affected: paylines.length,
  });
  res.json({ data: { affected: paylines.length, type: d.type, value: d.value } });
}));

router.delete('/runs/:id', requireScope('payroll', 'delete'), asyncHandler(async (req, res) => {
  const runs = await db.query('SELECT * FROM payroll_run WHERE id = ?', [req.params.id]);
  if (!runs[0]) throw notFound('Payroll run not found');
  if (runs[0].status !== 'draft') throw conflict('Only a draft run can be deleted — advance it back is not supported, this prevents losing an audited run.');

  await db.query('DELETE FROM payroll_run WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'payroll_run', req.params.id, runs[0], null);
  res.json({ ok: true });
}));

router.delete('/paylines/:id', requireScope('payroll', 'delete'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT pl.*, r.status AS run_status FROM payline pl JOIN payroll_run r ON r.id = pl.payroll_run_id WHERE pl.id = ?`,
    [req.params.id]
  );
  if (!rows[0]) throw notFound('Payline not found');
  if (!['draft', 'inputs_locked'].includes(rows[0].run_status)) throw conflict('Payroll inputs are locked for this run');
  decryptPayline(rows[0]);

  await db.query('DELETE FROM payline WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'payline', req.params.id, rows[0], null);
  res.json({ ok: true });
}));

router.put('/paylines/:id', requireScope('payroll', 'update'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT pl.*, r.status AS run_status FROM payline pl JOIN payroll_run r ON r.id = pl.payroll_run_id WHERE pl.id = ?`,
    [req.params.id]
  );
  if (!rows[0]) throw notFound('Payline not found');
  const before = decryptPayline(rows[0]);
  if (!['draft', 'inputs_locked'].includes(before.run_status)) {
    throw conflict('Payroll inputs are locked for this run');
  }

  const parsed = paylineUpdateSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid payline data', parsed.error.flatten());
  const d = parsed.data;

  const merged = {
    basic: d.basic !== undefined ? d.basic : Number(before.basic),
    allowances: d.allowances !== undefined ? d.allowances : Number(before.allowances),
    overtime: d.overtime !== undefined ? d.overtime : Number(before.overtime),
    deductions: d.deductions !== undefined ? d.deductions : Number(before.deductions),
    bank_account: d.bank_account !== undefined ? d.bank_account : before.bank_account,
    tax_number: d.tax_number !== undefined ? d.tax_number : before.tax_number,
  };

  // When an itemized breakdown is sent, it replaces the payline's payline_item rows and the
  // allowances/deductions totals are recomputed as the sum of their own items — items win over
  // any flat allowances/deductions also present in the same request. No items in the request at
  // all (the common case for a payline that's never been itemized) leaves the flat totals exactly
  // as submitted, unchanged from today's behaviour.
  let items = null;
  if (d.items !== undefined) {
    items = await db.tx(async (t) => {
      await t.query('DELETE FROM payline_item WHERE payline_id = ?', [req.params.id]);
      let sortOrder = 0;
      for (const item of d.items) {
        await t.query(
          'INSERT INTO payline_item (payline_id, kind, label, amount, sort_order) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, item.kind, item.label, item.amount, sortOrder++]
        );
      }
      return d.items;
    });
    merged.allowances = items.filter((i) => i.kind === 'allowance').reduce((s, i) => s + i.amount, 0);
    merged.deductions = items.filter((i) => i.kind === 'deduction').reduce((s, i) => s + i.amount, 0);
  }

  const net = merged.basic + merged.allowances + merged.overtime - merged.deductions;

  await db.query(
    'UPDATE payline SET basic = ?, allowances = ?, overtime = ?, deductions = ?, net = ?, bank_account = ?, tax_number = ? WHERE id = ?',
    [merged.basic, merged.allowances, merged.overtime, merged.deductions, net, enc.encrypt(merged.bank_account), enc.encrypt(merged.tax_number), req.params.id]
  );
  await writeAudit(req, 'update', 'payline', req.params.id, before, { ...merged, net });
  res.json({ data: { id: Number(req.params.id), ...merged, net, items: await getPaylineItems(req.params.id) } });
}));

router.post('/runs/:id/advance', requireScope('payroll', 'update'), asyncHandler(async (req, res) => {
  const { to } = req.body || {};
  const runs = await db.query('SELECT * FROM payroll_run WHERE id = ?', [req.params.id]);
  if (!runs[0]) throw notFound('Payroll run not found');
  const run = runs[0];

  const currentIndex = SEQUENCE.indexOf(run.status);
  const nextStatus = SEQUENCE[currentIndex + 1];
  if (!to || to !== nextStatus) {
    throw badRequest(`Invalid transition — the only valid next status from "${run.status}" is "${nextStatus || 'none'}"`);
  }

  const setClauses = ['status = ?'];
  const params = [to];
  if (to === 'approved_finance') { setClauses.push('approved_finance_by = ?', 'approved_finance_at = NOW()'); params.push(req.session.user.employeeNo); }
  if (to === 'approved_ed') { setClauses.push('approved_ed_by = ?', 'approved_ed_at = NOW()'); params.push(req.session.user.employeeNo); }
  if (to === 'paid') { setClauses.push('paid_at = NOW()'); }
  params.push(req.params.id);

  await db.query(`UPDATE payroll_run SET ${setClauses.join(', ')} WHERE id = ?`, params);
  await writeAudit(req, 'advance', 'payroll_run', req.params.id, { status: run.status }, { status: to });

  if (to === 'in_review') {
    const approvers = await db.query(
      `SELECT p.email FROM app_user u JOIN role r ON r.id = u.role_id JOIN person p ON p.employee_no = u.employee_no
       WHERE r.name IN ('HR administrator', 'System administrator')`
    );
    for (const a of approvers) {
      try { await notify.payrollAwaitingApproval(a.email, run.period); } catch (err) { req.log.error('payroll notify failed', { error: err.message }); }
    }
  }

  if (to === 'paid') {
    const paylines = await db.query(
      `SELECT p.email, p.full_legal_name FROM payline pl JOIN person p ON p.employee_no = pl.employee_no WHERE pl.payroll_run_id = ?`,
      [req.params.id]
    );
    for (const pl of paylines) {
      try { await notify.payslipReleased(pl.email, pl.full_legal_name, run.period); } catch (err) { req.log.error('payslip notify failed', { error: err.message }); }
    }
  }

  res.json({ data: { status: to } });
}));

module.exports = router;
