// Full reporting module: a registry of real, filterable reports (workforce, absence, attendance,
// payroll, recruitment, training, performance, benefits), each independently previewable (formal
// HTML letterhead layout) and exportable (PDF/XLSX/CSV) via src/platform/reportKit.js. Reports
// can also be combined into one multi-section document, and any filter set can be saved for reuse.
// Row-level results are always narrowed by the caller's own `reports` module data_scope — a
// department-scoped HR user cannot use the report builder to see organisation-wide payroll.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, notFound } = require('../platform/errors');
const { requireScope, scopeMeta, scopeFilterSql } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const rk = require('../platform/reportKit');

const router = express.Router();

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------
// Row-level narrowing for person-keyed report tables (workforce/absence/attendance/payroll/
// training/performance/benefits all ultimately key off an employee_no).
async function personClause(scope, user, column) {
  return scopeFilterSql(scope, user, column);
}
// Recruitment isn't person-keyed (candidates aren't employees) — narrow by the caller's own
// department instead once dataScope is anything narrower than organisation-wide.
async function deptClause(scope, user, column) {
  if (scope.dataScope === 'organisation') return { clause: '1=1', params: [] };
  return {
    clause: `${column} = (SELECT department_org_unit_id FROM employment WHERE employee_no = ? AND is_current = 1)`,
    params: [user.employeeNo],
  };
}

// Organisation-wide datasets that don't belong to any one employee or department (partner
// orgs, programmes, data feeds) — only a caller whose `reports` data_scope is the full
// organisation gets to see them at all; anyone narrower gets an empty report, not a partial one.
function orgOnly(scope) {
  return scope.dataScope === 'organisation';
}

function dateRangeClause(column, from, to) {
  const clauses = [];
  const params = [];
  if (from) { clauses.push(`${column} >= ?`); params.push(from); }
  if (to) { clauses.push(`${column} <= ?`); params.push(to); }
  return { clause: clauses.length ? clauses.join(' AND ') : '1=1', params };
}

function filterLabel(fields, key, value) {
  if (value === undefined || value === null || value === '') return null;
  const f = fields.find((x) => x.key === key);
  if (!f) return `${key}: ${value}`;
  const opt = (f.staticOptions || []).find((o) => String(o.value) === String(value));
  return `${f.label}: ${opt ? opt.label : value}`;
}

// ---------------------------------------------------------------------------
// Report registry
// ---------------------------------------------------------------------------
const STATUS_ALL = { value: '', label: 'All' };

const REPORTS = {
  workforce: {
    label: 'Workforce & headcount',
    description: 'Active roster with department, contract type and start date.',
    filterFields: [
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
      { key: 'contractType', label: 'Contract type', type: 'select', staticOptions: [STATUS_ALL, { value: 'permanent', label: 'Permanent' }, { value: 'fixed_term', label: 'Fixed term' }, { value: 'consultant', label: 'Consultant' }, { value: 'intern', label: 'Intern' }] },
      { key: 'status', label: 'Employee status', type: 'select', staticOptions: [{ value: 'active', label: 'Active only' }, STATUS_ALL, { value: 'on_leave', label: 'On leave' }, { value: 'suspended', label: 'Suspended' }, { value: 'exited', label: 'Exited' }] },
    ],
    columns: [
      { key: 'employee_no', label: 'Employee no.' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department' },
      { key: 'position_title', label: 'Position' }, { key: 'contract_type', label: 'Contract' }, { key: 'status', label: 'Status' },
      { key: 'start_date', label: 'Start date', type: 'date' },
    ],
    summary: (rows) => [{ label: 'Headcount', value: rows.length }],
    async query(filters, scope, user) {
      const where = ['e.is_current = 1'];
      const params = [];
      if (filters.department) { where.push('e.department_org_unit_id = ?'); params.push(filters.department); }
      if (filters.contractType) { where.push('e.contract_type = ?'); params.push(filters.contractType); }
      where.push(filters.status ? 'p.status = ?' : "p.status = 'active'");
      if (filters.status) params.push(filters.status);
      const pc = await personClause(scope, user, 'p.employee_no');
      where.push(pc.clause); params.push(...pc.params);
      const rows = await db.query(
        `SELECT p.employee_no, p.full_legal_name AS name, ou.name AS department, e.position_title, e.contract_type, p.status, e.start_date
         FROM person p JOIN employment e ON e.employee_no = p.employee_no
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY p.full_legal_name`, params
      );
      return rows;
    },
  },

  absence: {
    label: 'Absence & leave',
    description: 'Leave requests with type, dates, duration and approval status.',
    filterFields: [
      { key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' },
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
      { key: 'leaveType', label: 'Leave type', type: 'select', optionsKey: 'leaveTypes' },
      { key: 'status', label: 'Status', type: 'select', staticOptions: [STATUS_ALL, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'declined', label: 'Declined' }, { value: 'cancelled', label: 'Cancelled' }] },
    ],
    columns: [
      { key: 'employee_no', label: 'Employee no.' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department' },
      { key: 'leave_type', label: 'Leave type' }, { key: 'start_date', label: 'Start', type: 'date' }, { key: 'end_date', label: 'End', type: 'date' },
      { key: 'days', label: 'Days', type: 'number' }, { key: 'status', label: 'Status' },
    ],
    summary: (rows) => [
      { label: 'Requests', value: rows.length },
      { label: 'Total days', value: rows.reduce((s, r) => s + Number(r.days || 0), 0) },
      { label: 'Approved', value: rows.filter((r) => r.status === 'approved').length },
    ],
    async query(filters, scope, user) {
      const where = ['1=1'];
      const params = [];
      const dr = dateRangeClause('lr.start_date', filters.dateFrom, filters.dateTo);
      where.push(dr.clause); params.push(...dr.params);
      if (filters.department) { where.push('e.department_org_unit_id = ?'); params.push(filters.department); }
      if (filters.leaveType) { where.push('lr.leave_type_id = ?'); params.push(filters.leaveType); }
      if (filters.status) { where.push('lr.status = ?'); params.push(filters.status); }
      const pc = await personClause(scope, user, 'p.employee_no');
      where.push(pc.clause); params.push(...pc.params);
      const rows = await db.query(
        `SELECT p.employee_no, p.full_legal_name AS name, ou.name AS department, lt.name AS leave_type,
                lr.start_date, lr.end_date, lr.days, lr.status
         FROM leave_request lr
         JOIN person p ON p.employee_no = lr.employee_no
         JOIN leave_type lt ON lt.id = lr.leave_type_id
         LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY lr.start_date DESC`, params
      );
      return rows;
    },
  },

  attendance: {
    label: 'Time & attendance',
    description: 'Clock-in/clock-out sessions with computed hours.',
    filterFields: [
      { key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' },
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
    ],
    columns: [
      { key: 'employee_no', label: 'Employee no.' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department' },
      { key: 'clock_in', label: 'Clock in' }, { key: 'clock_out', label: 'Clock out' }, { key: 'hours', label: 'Hours', type: 'number' }, { key: 'source', label: 'Source' },
    ],
    summary: (rows) => [{ label: 'Sessions', value: rows.length }, { label: 'Total hours', value: Math.round(rows.reduce((s, r) => s + Number(r.hours || 0), 0) * 10) / 10 }],
    async query(filters, scope, user) {
      const where = ['1=1'];
      const params = [];
      const dr = dateRangeClause('wt.clock_in', filters.dateFrom, filters.dateTo);
      where.push(dr.clause); params.push(...dr.params);
      if (filters.department) { where.push('e.department_org_unit_id = ?'); params.push(filters.department); }
      const pc = await personClause(scope, user, 'p.employee_no');
      where.push(pc.clause); params.push(...pc.params);
      const rows = await db.query(
        `SELECT p.employee_no, p.full_legal_name AS name, ou.name AS department, wt.clock_in, wt.clock_out,
                ROUND(TIMESTAMPDIFF(MINUTE, wt.clock_in, COALESCE(wt.clock_out, NOW())) / 60, 2) AS hours, wt.source
         FROM work_timer wt
         JOIN person p ON p.employee_no = wt.employee_no
         LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY wt.clock_in DESC`, params
      );
      return rows;
    },
  },

  payroll: {
    label: 'Payroll',
    description: 'Pay line detail for a given run, with gross/deductions/net breakdown.',
    filterFields: [
      { key: 'period', label: 'Pay period', type: 'select', optionsKey: 'payrollPeriods' },
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
    ],
    columns: [
      { key: 'employee_no', label: 'Employee no.' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department' },
      { key: 'basic', label: 'Basic', type: 'currency' }, { key: 'allowances', label: 'Allowances', type: 'currency' },
      { key: 'overtime', label: 'Overtime', type: 'currency' }, { key: 'deductions', label: 'Deductions', type: 'currency' }, { key: 'net', label: 'Net', type: 'currency' },
    ],
    summary: (rows) => [
      { label: 'Employees', value: rows.length },
      { label: 'Gross', value: rows.reduce((s, r) => s + Number(r.basic || 0) + Number(r.allowances || 0) + Number(r.overtime || 0), 0).toFixed(2) },
      { label: 'Net', value: rows.reduce((s, r) => s + Number(r.net || 0), 0).toFixed(2) },
    ],
    async query(filters, scope, user) {
      if (!filters.period) return [];
      const where = ['pr.period = ?'];
      const params = [filters.period];
      if (filters.department) { where.push('e.department_org_unit_id = ?'); params.push(filters.department); }
      const pc = await personClause(scope, user, 'p.employee_no');
      where.push(pc.clause); params.push(...pc.params);
      const rows = await db.query(
        `SELECT p.employee_no, p.full_legal_name AS name, ou.name AS department, pl.basic, pl.allowances, pl.overtime, pl.deductions, pl.net
         FROM payline pl
         JOIN payroll_run pr ON pr.id = pl.payroll_run_id
         JOIN person p ON p.employee_no = pl.employee_no
         LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY p.full_legal_name`, params
      );
      return rows;
    },
  },

  recruitment: {
    label: 'Recruitment funnel',
    description: 'Candidate applications with requisition, stage and date applied.',
    filterFields: [
      { key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' },
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
      { key: 'stage', label: 'Stage', type: 'select', staticOptions: [STATUS_ALL, { value: 'applied', label: 'Applied' }, { value: 'screening', label: 'Screening' }, { value: 'interview', label: 'Interview' }, { value: 'offer', label: 'Offer' }, { value: 'hired', label: 'Hired' }, { value: 'rejected', label: 'Rejected' }] },
    ],
    columns: [
      { key: 'candidate', label: 'Candidate' }, { key: 'requisition', label: 'Requisition' }, { key: 'department', label: 'Department' },
      { key: 'stage', label: 'Stage' }, { key: 'applied_at', label: 'Applied', type: 'date' },
    ],
    summary: (rows) => [{ label: 'Applications', value: rows.length }, { label: 'Hired', value: rows.filter((r) => r.stage === 'hired').length }],
    async query(filters, scope, user) {
      const where = ['1=1'];
      const params = [];
      const dr = dateRangeClause('a.applied_at', filters.dateFrom, filters.dateTo);
      where.push(dr.clause); params.push(...dr.params);
      if (filters.department) { where.push('jr.department_org_unit_id = ?'); params.push(filters.department); }
      if (filters.stage) { where.push('a.stage = ?'); params.push(filters.stage); }
      const dc = await deptClause(scope, user, 'jr.department_org_unit_id');
      where.push(dc.clause); params.push(...dc.params);
      const rows = await db.query(
        `SELECT c.full_name AS candidate, jr.title AS requisition, ou.name AS department, a.stage, a.applied_at
         FROM application a
         JOIN candidate c ON c.id = a.candidate_id
         JOIN job_requisition jr ON jr.id = a.requisition_id
         LEFT JOIN org_unit ou ON ou.id = jr.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY a.applied_at DESC`, params
      );
      return rows;
    },
  },

  training: {
    label: 'Training & certification',
    description: 'Course enrollments with completion status.',
    filterFields: [
      { key: 'dateFrom', label: 'Completed from', type: 'date' }, { key: 'dateTo', label: 'Completed to', type: 'date' },
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
      { key: 'course', label: 'Course', type: 'select', optionsKey: 'trainingCourses' },
      { key: 'status', label: 'Status', type: 'select', staticOptions: [STATUS_ALL, { value: 'enrolled', label: 'Enrolled' }, { value: 'in_progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }, { value: 'failed', label: 'Failed' }] },
    ],
    columns: [
      { key: 'employee_no', label: 'Employee no.' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department' },
      { key: 'course', label: 'Course' }, { key: 'status', label: 'Status' }, { key: 'completed_at', label: 'Completed', type: 'date' },
    ],
    summary: (rows) => [{ label: 'Enrollments', value: rows.length }, { label: 'Completed', value: rows.filter((r) => r.status === 'completed').length }],
    async query(filters, scope, user) {
      const where = ['1=1'];
      const params = [];
      const dr = dateRangeClause('te.completed_at', filters.dateFrom, filters.dateTo);
      where.push(dr.clause); params.push(...dr.params);
      if (filters.department) { where.push('e.department_org_unit_id = ?'); params.push(filters.department); }
      if (filters.course) { where.push('te.course_id = ?'); params.push(filters.course); }
      if (filters.status) { where.push('te.status = ?'); params.push(filters.status); }
      const pc = await personClause(scope, user, 'p.employee_no');
      where.push(pc.clause); params.push(...pc.params);
      const rows = await db.query(
        `SELECT p.employee_no, p.full_legal_name AS name, ou.name AS department, tc.name AS course, te.status, te.completed_at
         FROM training_enrollment te
         JOIN person p ON p.employee_no = te.employee_no
         JOIN training_course tc ON tc.id = te.course_id
         LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY te.completed_at DESC`, params
      );
      return rows;
    },
  },

  performance: {
    label: 'Performance reviews',
    description: 'Self and manager ratings by review cycle.',
    filterFields: [
      { key: 'cycle', label: 'Review cycle', type: 'select', optionsKey: 'reviewCycles' },
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
      { key: 'status', label: 'Status', type: 'select', staticOptions: [STATUS_ALL, { value: 'not_started', label: 'Not started' }, { value: 'self_submitted', label: 'Self submitted' }, { value: 'manager_submitted', label: 'Manager submitted' }, { value: 'completed', label: 'Completed' }] },
    ],
    columns: [
      { key: 'employee_no', label: 'Employee no.' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department' },
      { key: 'cycle', label: 'Cycle' }, { key: 'self_rating', label: 'Self rating', type: 'number' }, { key: 'manager_rating', label: 'Manager rating', type: 'number' }, { key: 'status', label: 'Status' },
    ],
    summary: (rows) => [{ label: 'Reviews', value: rows.length }, { label: 'Completed', value: rows.filter((r) => r.status === 'completed').length }],
    async query(filters, scope, user) {
      const where = ['1=1'];
      const params = [];
      if (filters.cycle) { where.push('pr.cycle_id = ?'); params.push(filters.cycle); }
      if (filters.department) { where.push('e.department_org_unit_id = ?'); params.push(filters.department); }
      if (filters.status) { where.push('pr.status = ?'); params.push(filters.status); }
      const pc = await personClause(scope, user, 'p.employee_no');
      where.push(pc.clause); params.push(...pc.params);
      const rows = await db.query(
        `SELECT p.employee_no, p.full_legal_name AS name, ou.name AS department, rc.name AS cycle, pr.self_rating, pr.manager_rating, pr.status
         FROM performance_review pr
         JOIN person p ON p.employee_no = pr.employee_no
         JOIN review_cycle rc ON rc.id = pr.cycle_id
         LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY rc.period DESC, p.full_legal_name`, params
      );
      return rows;
    },
  },

  benefits: {
    label: 'Benefits enrollment',
    description: 'Plan enrollments with status.',
    filterFields: [
      { key: 'plan', label: 'Benefit plan', type: 'select', optionsKey: 'benefitPlans' },
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
      { key: 'status', label: 'Status', type: 'select', staticOptions: [STATUS_ALL, { value: 'active', label: 'Active' }, { value: 'cancelled', label: 'Cancelled' }] },
    ],
    columns: [
      { key: 'employee_no', label: 'Employee no.' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department' },
      { key: 'plan', label: 'Plan' }, { key: 'enrolled_at', label: 'Enrolled', type: 'date' }, { key: 'status', label: 'Status' },
    ],
    summary: (rows) => [{ label: 'Enrollments', value: rows.length }, { label: 'Active', value: rows.filter((r) => r.status === 'active').length }],
    async query(filters, scope, user) {
      const where = ['1=1'];
      const params = [];
      if (filters.plan) { where.push('be.benefit_plan_id = ?'); params.push(filters.plan); }
      if (filters.department) { where.push('e.department_org_unit_id = ?'); params.push(filters.department); }
      if (filters.status) { where.push('be.status = ?'); params.push(filters.status); }
      const pc = await personClause(scope, user, 'p.employee_no');
      where.push(pc.clause); params.push(...pc.params);
      const rows = await db.query(
        `SELECT p.employee_no, p.full_legal_name AS name, ou.name AS department, bp.name AS plan, be.enrolled_at, be.status
         FROM benefit_enrollment be
         JOIN person p ON p.employee_no = be.employee_no
         JOIN benefit_plan bp ON bp.id = be.benefit_plan_id
         LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY be.enrolled_at DESC`, params
      );
      return rows;
    },
  },

  succession: {
    label: 'Succession planning',
    description: 'Key positions, incumbent, risk rating and bench strength.',
    filterFields: [
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
      { key: 'risk', label: 'Risk', type: 'select', staticOptions: [STATUS_ALL, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }] },
    ],
    columns: [
      { key: 'position_title', label: 'Position' }, { key: 'department', label: 'Department' }, { key: 'incumbent', label: 'Incumbent' },
      { key: 'risk', label: 'Risk' }, { key: 'successors', label: 'Successors identified', type: 'number' }, { key: 'note', label: 'Note' },
    ],
    summary: (rows) => [{ label: 'Positions tracked', value: rows.length }, { label: 'High risk', value: rows.filter((r) => r.risk === 'high').length }],
    async query(filters, scope, user) {
      const where = ['1=1'];
      const params = [];
      if (filters.department) { where.push('sp.org_unit_id = ?'); params.push(filters.department); }
      if (filters.risk) { where.push('sp.risk = ?'); params.push(filters.risk); }
      const dc = await deptClause(scope, user, 'sp.org_unit_id');
      where.push(dc.clause); params.push(...dc.params);
      const rows = await db.query(
        `SELECT sp.position_title, ou.name AS department, p.full_legal_name AS incumbent, sp.risk, sp.note,
                (SELECT COUNT(*) FROM successor_candidate sc WHERE sc.succession_plan_id = sp.id) AS successors
         FROM succession_plan sp
         LEFT JOIN org_unit ou ON ou.id = sp.org_unit_id
         LEFT JOIN person p ON p.employee_no = sp.incumbent_employee_no
         WHERE ${where.join(' AND ')} ORDER BY FIELD(sp.risk,'high','medium','low')`, params
      );
      return rows;
    },
  },

  certifications: {
    label: 'Certifications & compliance',
    description: 'Staff certifications with issue/expiry dates.',
    filterFields: [
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
      { key: 'expiryStatus', label: 'Expiry', type: 'select', staticOptions: [STATUS_ALL, { value: 'valid', label: 'Valid (90+ days)' }, { value: 'expiring_90', label: 'Expiring within 90 days' }, { value: 'expired', label: 'Expired' }] },
    ],
    columns: [
      { key: 'employee_no', label: 'Employee no.' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department' },
      { key: 'certification', label: 'Certification' }, { key: 'issuing_body', label: 'Issuing body' },
      { key: 'issued_at', label: 'Issued', type: 'date' }, { key: 'expires_at', label: 'Expires', type: 'date' },
    ],
    summary: (rows) => [{ label: 'Certifications', value: rows.length }, { label: 'Expired', value: rows.filter((r) => r.expires_at && new Date(r.expires_at) < new Date()).length }],
    async query(filters, scope, user) {
      const where = ['1=1'];
      const params = [];
      if (filters.department) { where.push('e.department_org_unit_id = ?'); params.push(filters.department); }
      if (filters.expiryStatus === 'expired') where.push('c.expires_at IS NOT NULL AND c.expires_at < CURDATE()');
      else if (filters.expiryStatus === 'expiring_90') where.push('c.expires_at IS NOT NULL AND c.expires_at >= CURDATE() AND c.expires_at < DATE_ADD(CURDATE(), INTERVAL 90 DAY)');
      else if (filters.expiryStatus === 'valid') where.push('(c.expires_at IS NULL OR c.expires_at >= DATE_ADD(CURDATE(), INTERVAL 90 DAY))');
      const pc = await personClause(scope, user, 'p.employee_no');
      where.push(pc.clause); params.push(...pc.params);
      const rows = await db.query(
        `SELECT p.employee_no, p.full_legal_name AS name, ou.name AS department, c.name AS certification, c.issuing_body, c.issued_at, c.expires_at
         FROM certification c
         JOIN person p ON p.employee_no = c.employee_no
         LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY c.expires_at IS NULL, c.expires_at`, params
      );
      return rows;
    },
  },

  partners: {
    label: 'Partners & agreements',
    description: 'External partner organisations, agreement status and linked programmes.',
    filterFields: [
      { key: 'status', label: 'Status', type: 'select', staticOptions: [STATUS_ALL, { value: 'active', label: 'Active' }, { value: 'renewal_due', label: 'Renewal due' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    columns: [
      { key: 'name', label: 'Partner' }, { key: 'type', label: 'Type' }, { key: 'status', label: 'Status' },
      { key: 'contact_name', label: 'Contact' }, { key: 'contact_phone', label: 'Phone' }, { key: 'since_year', label: 'Since' }, { key: 'programmes', label: 'Programmes', type: 'number' },
    ],
    summary: (rows) => [{ label: 'Partners', value: rows.length }, { label: 'Renewal due', value: rows.filter((r) => r.status === 'renewal_due').length }],
    async query(filters, scope) {
      if (!orgOnly(scope)) return [];
      const where = ['1=1'];
      const params = [];
      if (filters.status) { where.push('po.status = ?'); params.push(filters.status); }
      const rows = await db.query(
        `SELECT po.name, po.type, po.status, po.contact_name, po.contact_phone, po.since_year,
                (SELECT COUNT(*) FROM programme_partner pp WHERE pp.partner_org_id = po.id) AS programmes
         FROM partner_org po WHERE ${where.join(' AND ')} ORDER BY po.name`, params
      );
      return rows;
    },
  },

  programme_indicators: {
    label: 'Programme indicators',
    description: 'Indicator values collected against programmes and partners, by period.',
    filterFields: [
      { key: 'programme', label: 'Programme', type: 'select', optionsKey: 'programmes' },
      { key: 'dateFrom', label: 'Collected from', type: 'date' }, { key: 'dateTo', label: 'Collected to', type: 'date' },
    ],
    columns: [
      { key: 'programme', label: 'Programme' }, { key: 'partner', label: 'Partner' }, { key: 'indicator_name', label: 'Indicator' },
      { key: 'period', label: 'Period' }, { key: 'value', label: 'Value', type: 'number' }, { key: 'collected_by', label: 'Collected by' }, { key: 'created_at', label: 'Recorded', type: 'date' },
    ],
    summary: (rows) => [{ label: 'Records', value: rows.length }, { label: 'Total value', value: rows.reduce((s, r) => s + Number(r.value || 0), 0) }],
    async query(filters, scope) {
      if (!orgOnly(scope)) return [];
      const where = ['1=1'];
      const params = [];
      if (filters.programme) { where.push('ir.programme_id = ?'); params.push(filters.programme); }
      const dr = dateRangeClause('ir.created_at', filters.dateFrom, filters.dateTo);
      where.push(dr.clause); params.push(...dr.params);
      const rows = await db.query(
        `SELECT pg.name AS programme, po.name AS partner, ir.indicator_name, ir.period, ir.value, ir.created_at,
                p.full_legal_name AS collected_by
         FROM indicator_record ir
         JOIN programme pg ON pg.id = ir.programme_id
         LEFT JOIN partner_org po ON po.id = ir.partner_org_id
         LEFT JOIN person p ON p.employee_no = ir.collected_by_employee_no
         WHERE ${where.join(' AND ')} ORDER BY ir.created_at DESC`, params
      );
      return rows;
    },
  },

  voip_activity: {
    label: 'VoIP call activity',
    description: 'Simulated call log — direction, outcome and duration.',
    filterFields: [
      { key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' },
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
      { key: 'direction', label: 'Direction', type: 'select', staticOptions: [STATUS_ALL, { value: 'outbound', label: 'Outbound' }, { value: 'inbound', label: 'Inbound' }] },
      { key: 'outcome', label: 'Outcome', type: 'select', staticOptions: [STATUS_ALL, { value: 'completed', label: 'Completed' }, { value: 'missed', label: 'Missed' }, { value: 'declined', label: 'Declined' }, { value: 'voicemail', label: 'Voicemail' }] },
    ],
    columns: [
      { key: 'caller', label: 'Caller' }, { key: 'department', label: 'Department' }, { key: 'callee', label: 'Callee' },
      { key: 'started_at', label: 'Started' }, { key: 'duration', label: 'Duration (s)', type: 'number' }, { key: 'direction', label: 'Direction' }, { key: 'outcome', label: 'Outcome' },
    ],
    summary: (rows) => [{ label: 'Calls', value: rows.length }, { label: 'Total minutes', value: Math.round(rows.reduce((s, r) => s + Number(r.duration || 0), 0) / 60) }],
    async query(filters, scope, user) {
      const where = ['1=1'];
      const params = [];
      const dr = dateRangeClause('cr.started_at', filters.dateFrom, filters.dateTo);
      where.push(dr.clause); params.push(...dr.params);
      if (filters.department) { where.push('e.department_org_unit_id = ?'); params.push(filters.department); }
      if (filters.direction) { where.push('cr.direction = ?'); params.push(filters.direction); }
      if (filters.outcome) { where.push('cr.outcome = ?'); params.push(filters.outcome); }
      const pc = await personClause(scope, user, 'p.employee_no');
      where.push(pc.clause); params.push(...pc.params);
      const rows = await db.query(
        `SELECT p.full_legal_name AS caller, ou.name AS department,
                COALESCE(pc2.full_legal_name, cr.callee_number) AS callee,
                cr.started_at, cr.duration_seconds AS duration, cr.direction, cr.outcome
         FROM call_record cr
         JOIN person p ON p.employee_no = cr.caller_employee_no
         LEFT JOIN person pc2 ON pc2.employee_no = cr.callee_employee_no
         LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY cr.started_at DESC`, params
      );
      return rows;
    },
  },

  asset_declarations: {
    label: 'Asset & interest declarations',
    description: 'Integrity/compliance declarations — property, financial interests, gifts, outside employment.',
    filterFields: [
      { key: 'department', label: 'Department', type: 'select', optionsKey: 'departments' },
      { key: 'category', label: 'Category', type: 'select', staticOptions: [STATUS_ALL, { value: 'property', label: 'Property' }, { value: 'vehicle', label: 'Vehicle' }, { value: 'financial_interest', label: 'Financial interest' }, { value: 'gift', label: 'Gift' }, { value: 'outside_employment', label: 'Outside employment' }, { value: 'other', label: 'Other' }] },
      { key: 'status', label: 'Status', type: 'select', staticOptions: [STATUS_ALL, { value: 'draft', label: 'Draft' }, { value: 'submitted', label: 'Submitted' }, { value: 'reviewed', label: 'Reviewed' }, { value: 'flagged', label: 'Flagged' }] },
    ],
    columns: [
      { key: 'employee_no', label: 'Employee no.' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department' },
      { key: 'category', label: 'Category' }, { key: 'description', label: 'Description' }, { key: 'estimated_value', label: 'Value', type: 'currency' },
      { key: 'declared_at', label: 'Declared', type: 'date' }, { key: 'status', label: 'Status' },
    ],
    summary: (rows) => [{ label: 'Declarations', value: rows.length }, { label: 'Flagged', value: rows.filter((r) => r.status === 'flagged').length }],
    async query(filters, scope, user) {
      const where = ['1=1'];
      const params = [];
      if (filters.department) { where.push('e.department_org_unit_id = ?'); params.push(filters.department); }
      if (filters.category) { where.push('ad.category = ?'); params.push(filters.category); }
      if (filters.status) { where.push('ad.status = ?'); params.push(filters.status); }
      const pc = await personClause(scope, user, 'p.employee_no');
      where.push(pc.clause); params.push(...pc.params);
      const rows = await db.query(
        `SELECT p.employee_no, p.full_legal_name AS name, ou.name AS department, ad.category, ad.description,
                ad.estimated_value, ad.declared_at, ad.status
         FROM asset_declaration ad
         JOIN person p ON p.employee_no = ad.employee_no
         LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         LEFT JOIN org_unit ou ON ou.id = e.department_org_unit_id
         WHERE ${where.join(' AND ')} ORDER BY ad.declared_at DESC`, params
      );
      return rows;
    },
  },

  data_feeds: {
    label: 'External data feeds',
    description: 'Ingest feed health — cadence, last run and staged/quarantined record status.',
    filterFields: [
      { key: 'status', label: 'Status', type: 'select', staticOptions: [STATUS_ALL, { value: 'healthy', label: 'Healthy' }, { value: 'degraded', label: 'Degraded' }, { value: 'failed', label: 'Failed' }] },
      { key: 'transport', label: 'Transport', type: 'select', staticOptions: [STATUS_ALL, { value: 'api_pull', label: 'API pull' }, { value: 'sftp', label: 'SFTP' }, { value: 'csv_upload', label: 'CSV upload' }, { value: 'webhook_push', label: 'Webhook push' }] },
    ],
    columns: [
      { key: 'source_name', label: 'Source' }, { key: 'transport', label: 'Transport' }, { key: 'cadence', label: 'Cadence' },
      { key: 'status', label: 'Status' }, { key: 'last_run_at', label: 'Last run' }, { key: 'owner', label: 'Owner' },
      { key: 'staged', label: 'Staged', type: 'number' }, { key: 'quarantined', label: 'Quarantined', type: 'number' },
    ],
    summary: (rows) => [{ label: 'Feeds', value: rows.length }, { label: 'Failed', value: rows.filter((r) => r.status === 'failed').length }],
    async query(filters, scope) {
      if (!orgOnly(scope)) return [];
      const where = ['1=1'];
      const params = [];
      if (filters.status) { where.push('f.status = ?'); params.push(filters.status); }
      if (filters.transport) { where.push('f.transport = ?'); params.push(filters.transport); }
      const rows = await db.query(
        `SELECT f.source_name, f.transport, f.cadence, f.status, f.last_run_at, p.full_legal_name AS owner,
                (SELECT COUNT(*) FROM feed_record fr WHERE fr.feed_id = f.id AND fr.status = 'staged') AS staged,
                (SELECT COUNT(*) FROM feed_record fr WHERE fr.feed_id = f.id AND fr.status = 'quarantined') AS quarantined
         FROM feed f
         LEFT JOIN person p ON p.employee_no = f.owner_employee_no
         WHERE ${where.join(' AND ')} ORDER BY f.source_name`, params
      );
      return rows;
    },
  },
};

function cleanFilters(raw) {
  const out = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

async function runReport(id, rawFilters, scope, user) {
  const def = REPORTS[id];
  if (!def) throw badRequest(`Unknown report "${id}"`);
  const filters = cleanFilters(rawFilters);
  const rows = await def.query(filters, scope, user);
  const lines = def.filterFields.map((f) => filterLabel(def.filterFields, f.key, filters[f.key])).filter(Boolean);
  return { def, rows, filters, filterLines: lines };
}

async function buildSections(reportIds, filtersByReport, scope, user) {
  const sections = [];
  for (const id of reportIds) {
    const { def, rows, filterLines } = await runReport(id, (filtersByReport && filtersByReport[id]) || {}, scope, user);
    sections.push({
      heading: def.label,
      note: def.description,
      kpis: def.summary ? def.summary(rows).map((k) => ({ label: k.label, value: k.value })) : null,
      columns: def.columns,
      rows,
      filterLines,
    });
  }
  return sections;
}

function docMeta(req, title, subtitle) {
  return {
    title,
    subtitle,
    generatedBy: `${req.session.user.name} (${req.session.user.role})`,
    generatedAt: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
  };
}

// ---------------------------------------------------------------------------
// Catalogue + filter options
// ---------------------------------------------------------------------------
router.get('/definitions', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const data = Object.entries(REPORTS).map(([id, def]) => ({ id, label: def.label, description: def.description, filterFields: def.filterFields, columns: def.columns }));
  res.json({ data, meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/filter-options', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const [departments, leaveTypes, trainingCourses, benefitPlans, reviewCycles, payrollPeriods, programmes] = await Promise.all([
    db.query(`SELECT id AS value, name AS label FROM org_unit WHERE kind = 'department' ORDER BY name`),
    db.query(`SELECT id AS value, name AS label FROM leave_type ORDER BY name`),
    db.query(`SELECT id AS value, name AS label FROM training_course ORDER BY name`),
    db.query(`SELECT id AS value, name AS label FROM benefit_plan ORDER BY name`),
    db.query(`SELECT id AS value, CONCAT(name, ' (', period, ')') AS label FROM review_cycle ORDER BY period DESC`),
    db.query(`SELECT period AS value, period AS label FROM payroll_run ORDER BY period DESC`),
    db.query(`SELECT id AS value, name AS label FROM programme ORDER BY name`),
  ]);
  res.json({ data: { departments, leaveTypes, trainingCourses, benefitPlans, reviewCycles, payrollPeriods, programmes } });
}));

// ---------------------------------------------------------------------------
// Combined multi-report preview / export — registered before the "/:id/..." single-report
// routes below, since Express matches route order and "/:id" would otherwise greedily swallow
// "/combined/preview" as id="combined".
// ---------------------------------------------------------------------------
router.post('/combined/preview', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const reportIds = Array.isArray(req.body.reportIds) ? req.body.reportIds : [];
  if (!reportIds.length) throw badRequest('Pick at least one report to combine');
  const sections = await buildSections(reportIds, req.body.filters, req.scope, req.session.user);
  const org = await rk.getOrgInfo(db);
  const allFilterLines = [...new Set(sections.flatMap((s) => s.filterLines || []))];
  const html = rk.buildPreviewHtml({
    ...docMeta(req, 'Combined report', `${sections.length} sections: ${sections.map((s) => s.heading).join(', ')}`),
    orgName: org.orgName, logoUrl: org.logoUrl, filterLines: allFilterLines, sections,
  });
  res.json({ data: { html, rowCount: sections.reduce((s, x) => s + x.rows.length, 0) } });
}));

router.post('/combined/export', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const reportIds = Array.isArray(req.body.reportIds) ? req.body.reportIds : [];
  if (!reportIds.length) throw badRequest('Pick at least one report to combine');
  const format = (req.body.format || 'pdf').toLowerCase();
  const sections = await buildSections(reportIds, req.body.filters, req.scope, req.session.user);
  const org = await rk.getOrgInfo(db);
  const stamp = new Date().toISOString().slice(0, 10);

  await writeAudit(req, 'export', 'report', 'combined', null, { format, reportIds, rowCount: sections.reduce((s, x) => s + x.rows.length, 0) });

  const allFilterLines = [...new Set(sections.flatMap((s) => s.filterLines || []))];
  const payload = { ...docMeta(req, 'Combined report', `${sections.length} sections: ${sections.map((s) => s.heading).join(', ')}`), orgName: org.orgName, logoUrl: org.logoUrl, filterLines: allFilterLines, sections };
  if (format === 'pdf') return rk.buildPdf(payload, res, `combined-report-${stamp}.pdf`);
  if (format === 'xlsx') return rk.buildXlsx(payload, res, `combined-report-${stamp}.xlsx`);
  throw badRequest('Combined export supports pdf or xlsx only — export sections individually for CSV');
}));

// ---------------------------------------------------------------------------
// Saved reports (a named, reusable single or combined config) — also registered before "/:id"
// for the same reason ("/saved" itself is a single segment so it's safe, but keeping the whole
// group together above the wildcard routes avoids this class of bug entirely).
// ---------------------------------------------------------------------------
router.get('/saved', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT sr.id, sr.name, sr.report_ids_json, sr.filters_json, sr.created_at, p.full_legal_name AS created_by
     FROM saved_report sr LEFT JOIN person p ON p.employee_no = sr.created_by_employee_no
     ORDER BY sr.created_at DESC`
  );
  res.json({
    data: rows.map((r) => ({
      id: r.id, name: r.name, reportIds: JSON.parse(r.report_ids_json), filters: JSON.parse(r.filters_json),
      createdBy: r.created_by, createdAt: r.created_at,
    })),
  });
}));

router.post('/saved', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const { name, reportIds, filters } = req.body;
  if (!name || !name.trim()) throw badRequest('Name is required');
  if (!Array.isArray(reportIds) || !reportIds.length) throw badRequest('Pick at least one report');
  const invalid = reportIds.filter((id) => !REPORTS[id]);
  if (invalid.length) throw badRequest(`Unknown report(s): ${invalid.join(', ')}`);
  const result = await db.query(
    'INSERT INTO saved_report (name, report_ids_json, filters_json, created_by_employee_no) VALUES (?, ?, ?, ?)',
    [name.trim(), JSON.stringify(reportIds), JSON.stringify(filters || {}), req.session.user.employeeNo]
  );
  await writeAudit(req, 'create', 'saved_report', result.insertId, null, { name, reportIds });
  res.status(201).json({ data: { id: result.insertId } });
}));

router.delete('/saved/:id', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT id, name FROM saved_report WHERE id = ?', [req.params.id]);
  if (!rows.length) throw notFound('Saved report not found');
  await db.query('DELETE FROM saved_report WHERE id = ?', [req.params.id]);
  await writeAudit(req, 'delete', 'saved_report', req.params.id, rows[0], null);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Single-report preview / export — the "/:id" wildcard, registered last among the /reports/*
// POST routes above so it can never shadow a literal path like "/combined/preview".
// ---------------------------------------------------------------------------
router.post('/:id/preview', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const { def, rows, filterLines } = await runReport(req.params.id, req.body.filters, req.scope, req.session.user);
  const org = await rk.getOrgInfo(db);
  const html = rk.buildPreviewHtml({
    ...docMeta(req, def.label, def.description),
    orgName: org.orgName, logoUrl: org.logoUrl, filterLines,
    sections: [{ heading: def.label, note: def.description, kpis: def.summary ? def.summary(rows) : null, columns: def.columns, rows }],
  });
  res.json({ data: { html, rowCount: rows.length } });
}));

router.post('/:id/export', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const format = (req.body.format || 'pdf').toLowerCase();
  const { def, rows, filterLines } = await runReport(req.params.id, req.body.filters, req.scope, req.session.user);
  const org = await rk.getOrgInfo(db);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = def.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  await writeAudit(req, 'export', 'report', req.params.id, null, { format, filters: req.body.filters || {}, rowCount: rows.length });

  const payload = {
    ...docMeta(req, def.label, def.description),
    orgName: org.orgName, logoUrl: org.logoUrl, filterLines,
    sections: [{ heading: def.label, note: def.description, kpis: def.summary ? def.summary(rows) : null, columns: def.columns, rows }],
  };
  if (format === 'pdf') return rk.buildPdf(payload, res, `${base}-${stamp}.pdf`);
  if (format === 'xlsx') return rk.buildXlsx(payload, res, `${base}-${stamp}.xlsx`);
  if (format === 'csv') return rk.sendCsv(res, def.columns, rows, `${base}-${stamp}.csv`);
  throw badRequest('format must be pdf, xlsx or csv');
}));

// ---------------------------------------------------------------------------
// Legacy chart-data endpoints — the Overview tab's existing bar charts.
// ---------------------------------------------------------------------------
router.get('/workforce', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const byDepartment = await db.query(
    `SELECT ou.name AS label, COUNT(*) AS value
     FROM employment e
     JOIN org_unit ou ON ou.id = e.department_org_unit_id
     JOIN person p ON p.employee_no = e.employee_no
     WHERE e.is_current = 1 AND p.status = 'active'
     GROUP BY ou.name ORDER BY value DESC`
  );
  const byContractType = await db.query(
    `SELECT e.contract_type AS label, COUNT(*) AS value
     FROM employment e JOIN person p ON p.employee_no = e.employee_no
     WHERE e.is_current = 1 AND p.status = 'active'
     GROUP BY e.contract_type ORDER BY value DESC`
  );
  const byGender = await db.query(
    `SELECT COALESCE(NULLIF(gender, ''), 'Not stated') AS label, COUNT(*) AS value
     FROM person WHERE status = 'active' GROUP BY label ORDER BY value DESC`
  );
  res.json({ byDepartment, byContractType, byGender, meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/absence', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const byMonth = await db.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS label, COUNT(*) AS value
     FROM leave_request
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY label ORDER BY label`
  );
  const byType = await db.query(
    `SELECT lt.name AS label, COUNT(*) AS value
     FROM leave_request lr JOIN leave_type lt ON lt.id = lr.leave_type_id
     GROUP BY lt.name ORDER BY value DESC`
  );
  const byStatus = await db.query(
    `SELECT status AS label, COUNT(*) AS value FROM leave_request GROUP BY status ORDER BY value DESC`
  );
  res.json({ byMonth, byType, byStatus, meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/payroll', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const byPeriod = await db.query(
    `SELECT pr.period AS label, SUM(pl.net) AS value
     FROM payline pl JOIN payroll_run pr ON pr.id = pl.payroll_run_id
     GROUP BY pr.period ORDER BY pr.period DESC LIMIT 6`
  );
  byPeriod.reverse();

  const [latestRun] = await db.query('SELECT id, period FROM payroll_run ORDER BY period DESC LIMIT 1');
  let kpis = [];
  if (latestRun) {
    const [totals] = await db.query(
      `SELECT SUM(basic + allowances + overtime) AS gross, SUM(deductions) AS deductions, SUM(net) AS net, COUNT(*) AS n
       FROM payline WHERE payroll_run_id = ?`,
      [latestRun.id]
    );
    kpis = [
      { label: `Gross (${latestRun.period})`, value: Number(totals.gross || 0) },
      { label: `Deductions (${latestRun.period})`, value: Number(totals.deductions || 0) },
      { label: `Net pay (${latestRun.period})`, value: Number(totals.net || 0) },
      { label: 'Employees in run', value: totals.n },
    ];
  }
  res.json({ byPeriod, kpis, meta: { scope: scopeMeta(req.scope) } });
}));

router.get('/recruitment', requireScope('reports', 'read'), asyncHandler(async (req, res) => {
  const byRequisitionStatus = await db.query(
    `SELECT status AS label, COUNT(*) AS value FROM job_requisition GROUP BY status ORDER BY value DESC`
  );
  const byApplicationStage = await db.query(
    `SELECT stage AS label, COUNT(*) AS value FROM application GROUP BY stage ORDER BY value DESC`
  );
  res.json({ byRequisitionStatus, byApplicationStage, meta: { scope: scopeMeta(req.scope) } });
}));

module.exports = router;
