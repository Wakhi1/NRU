const express = require('express');
const db = require('../platform/db');
const { asyncHandler } = require('../platform/errors');
const { resolveScope, scopeFilterSql } = require('../platform/scope');

const router = express.Router();

router.get('/summary', asyncHandler(async (req, res) => {
  const user = req.session.user;
  const [peopleScope, leaveScope, payrollScope, recruitmentScope, attendanceScope, trainingScope] = await Promise.all([
    resolveScope(user, 'people'), resolveScope(user, 'leave'), resolveScope(user, 'payroll'),
    resolveScope(user, 'recruitment'), resolveScope(user, 'attendance'), resolveScope(user, 'training'),
  ]);

  const peopleFilter = await scopeFilterSql(peopleScope, user, 'employee_no');
  const leaveFilter = await scopeFilterSql(leaveScope, user, 'employee_no');
  const attendanceFilter = await scopeFilterSql(attendanceScope, user, 'employee_no');
  const peopleFilterP = await scopeFilterSql(peopleScope, user, 'p.employee_no');
  const leaveFilterP = await scopeFilterSql(leaveScope, user, 'p.employee_no');
  const attendanceFilterP = await scopeFilterSql(attendanceScope, user, 'p.employee_no');

  // ---------------- Existing KPIs ----------------
  const [headcount] = await db.query(
    `SELECT COUNT(*) AS n FROM person WHERE status = 'active' AND ${peopleFilter.clause}`,
    peopleFilter.params
  );
  const [pendingLeave] = await db.query(
    `SELECT COUNT(*) AS n FROM leave_request WHERE status = 'pending' AND ${leaveFilter.clause}`,
    leaveFilter.params
  );
  const today = new Date().toISOString().slice(0, 10);
  const [attendanceToday] = await db.query(
    `SELECT COUNT(DISTINCT employee_no) AS n FROM work_timer WHERE DATE(clock_in) = ? AND ${attendanceFilter.clause}`,
    [today, ...attendanceFilter.params]
  );
  const [openReqs] = await db.query(`SELECT COUNT(*) AS n FROM job_requisition WHERE status = 'open'`);
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const [payrollRun] = await db.query(`SELECT period, status FROM payroll_run WHERE period = ?`, [currentPeriod]);
  const [expiringCerts] = await db.query(
    `SELECT COUNT(*) AS n FROM certification WHERE expires_at IS NOT NULL AND expires_at BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)`
  );

  const recentLeave = await db.query(
    `SELECT lr.id, p.full_legal_name, lt.name AS leave_type, lr.start_date, lr.end_date, lr.days, lr.status
     FROM leave_request lr
     JOIN person p ON p.employee_no = lr.employee_no
     JOIN leave_type lt ON lt.id = lr.leave_type_id
     WHERE ${leaveFilterP.clause}
     ORDER BY lr.created_at DESC LIMIT 6`,
    leaveFilterP.params
  );

  // ---------------- Charts (all scope-filtered the same way as the KPIs above) ----------------
  const charts = {};

  charts.headcountByDept = await db.query(
    `SELECT ou.name AS label, COUNT(*) AS value
     FROM employment e JOIN org_unit ou ON ou.id = e.department_org_unit_id
     JOIN person p ON p.employee_no = e.employee_no
     WHERE e.is_current = 1 AND p.status = 'active' AND ${peopleFilterP.clause}
     GROUP BY ou.name ORDER BY value DESC`,
    peopleFilterP.params
  );

  charts.headcountByContract = await db.query(
    `SELECT e.contract_type AS label, COUNT(*) AS value
     FROM employment e JOIN person p ON p.employee_no = e.employee_no
     WHERE e.is_current = 1 AND p.status = 'active' AND ${peopleFilterP.clause}
     GROUP BY e.contract_type ORDER BY value DESC`,
    peopleFilterP.params
  );

  // Hires per month, last 12 months — a genuine trend line, not just a snapshot.
  charts.hiresTrend = await db.query(
    `SELECT DATE_FORMAT(e.start_date, '%Y-%m') AS label, COUNT(*) AS value
     FROM employment e JOIN person p ON p.employee_no = e.employee_no
     WHERE e.start_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) AND ${peopleFilterP.clause}
     GROUP BY label ORDER BY label`,
    peopleFilterP.params
  );

  charts.leaveByStatus = await db.query(
    `SELECT lr.status AS label, COUNT(*) AS value
     FROM leave_request lr JOIN person p ON p.employee_no = lr.employee_no
     WHERE ${leaveFilterP.clause}
     GROUP BY lr.status ORDER BY value DESC`,
    leaveFilterP.params
  );

  charts.leaveTrend = await db.query(
    `SELECT DATE_FORMAT(lr.created_at, '%Y-%m') AS label, COUNT(*) AS value
     FROM leave_request lr JOIN person p ON p.employee_no = lr.employee_no
     WHERE lr.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) AND ${leaveFilterP.clause}
     GROUP BY label ORDER BY label`,
    leaveFilterP.params
  );

  // Distinct clocked-in headcount per day, last 14 days.
  charts.attendanceTrend = await db.query(
    `SELECT DATE(wt.clock_in) AS label, COUNT(DISTINCT wt.employee_no) AS value
     FROM work_timer wt JOIN person p ON p.employee_no = wt.employee_no
     WHERE wt.clock_in >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND ${attendanceFilterP.clause}
     GROUP BY label ORDER BY label`,
    attendanceFilterP.params
  );

  charts.certificationStatus = await db.query(
    `SELECT
        CASE
          WHEN c.expires_at IS NULL THEN 'No expiry'
          WHEN c.expires_at < CURDATE() THEN 'Expired'
          WHEN c.expires_at < DATE_ADD(CURDATE(), INTERVAL 90 DAY) THEN 'Expiring within 90 days'
          ELSE 'Valid'
        END AS label,
        COUNT(*) AS value
     FROM certification c JOIN person p ON p.employee_no = c.employee_no
     WHERE ${peopleFilterP.clause}
     GROUP BY label`,
    peopleFilterP.params
  );

  if (payrollScope.actions.read) {
    // Read access alone doesn't mean org-wide visibility — an Employee has payroll read/self
    // (their own payslip trend), not a licence to see everyone's aggregate net pay. Scope-filter
    // the same way reports.routes.js's payroll report does.
    const payrollFilter = await scopeFilterSql(payrollScope, user, 'pl.employee_no');
    const byPeriod = await db.query(
      `SELECT pr.period AS label, SUM(pl.net) AS value
       FROM payline pl JOIN payroll_run pr ON pr.id = pl.payroll_run_id
       WHERE ${payrollFilter.clause}
       GROUP BY pr.period ORDER BY pr.period DESC LIMIT 6`,
      payrollFilter.params
    );
    byPeriod.reverse();
    charts.payrollTrend = byPeriod.map((r) => ({ label: r.label, value: Math.round(Number(r.value)) }));
  }

  if (recruitmentScope.actions.read) {
    // Candidates aren't employees, so narrow by the caller's own department once scope is
    // anything less than organisation-wide — same rule reports.routes.js's recruitment report
    // applies (a department-scoped Head of Department shouldn't see other departments' funnels).
    const deptClause = recruitmentScope.dataScope === 'organisation'
      ? { clause: '1=1', params: [] }
      : { clause: 'jr.department_org_unit_id = (SELECT department_org_unit_id FROM employment WHERE employee_no = ? AND is_current = 1)', params: [user.employeeNo] };
    charts.recruitmentFunnel = await db.query(
      `SELECT a.stage AS label, COUNT(*) AS value
       FROM application a JOIN job_requisition jr ON jr.id = a.requisition_id
       WHERE ${deptClause.clause}
       GROUP BY a.stage
       ORDER BY FIELD(a.stage, 'applied','screening','interview','offer','hired','rejected')`,
      deptClause.params
    );
  }

  if (trainingScope.actions.read) {
    charts.trainingCompletion = await db.query(
      `SELECT te.status AS label, COUNT(*) AS value
       FROM training_enrollment te JOIN person p ON p.employee_no = te.employee_no
       WHERE ${peopleFilterP.clause}
       GROUP BY te.status`,
      peopleFilterP.params
    );
  }

  res.json({
    kpis: {
      headcount: headcount.n,
      pendingLeave: pendingLeave.n,
      attendanceToday: attendanceToday.n,
      openRequisitions: openReqs.n,
      expiringCertifications: expiringCerts.n,
      payrollRun: payrollRun || null,
    },
    recentLeave,
    charts,
    meta: { peopleScope: peopleScope.dataScope, payrollRead: payrollScope.actions.read },
  });
}));

module.exports = router;
