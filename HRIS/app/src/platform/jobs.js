// Scheduled digests referenced in the prototype's Settings > Notifications screen.
// Registered from server.js with the `node-cron` instance so there's a single scheduler.
const db = require('./db');
const { logger } = require('./logger');
const { notify } = require('./mailer');

module.exports = function registerJobs(cron) {
  // Friday 15:00 — anyone missing a timesheet entry for today gets flagged to themselves + manager.
  cron.schedule('0 15 * * 5', async () => {
    logger.info('cron: timesheet_missing digest starting');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const missing = await db.query(
        `SELECT p.employee_no, p.full_legal_name, p.email, e.reports_to_employee_no
         FROM person p
         JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         WHERE p.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM work_timer wt WHERE wt.employee_no = p.employee_no AND DATE(wt.clock_in) = ?)`,
        [today]
      );
      for (const row of missing) {
        await notify.timesheetMissing(row.email, row.full_legal_name, today);
        if (row.reports_to_employee_no) {
          const [mgr] = await db.query('SELECT email FROM person WHERE employee_no = ?', [row.reports_to_employee_no]);
          if (mgr) await notify.timesheetMissing(mgr.email, row.full_legal_name, today);
        }
      }
      logger.info('cron: timesheet_missing digest done', { count: missing.length });
    } catch (err) {
      logger.error('cron: timesheet_missing digest failed', { error: err.message });
    }
  });

  // Weekly (Monday 08:00) — certifications expiring within 90 days.
  cron.schedule('0 8 * * 1', async () => {
    logger.info('cron: certification_expiring digest starting');
    try {
      const rows = await db.query(
        `SELECT c.name, c.expires_at, p.employee_no, p.full_legal_name, p.email, e.reports_to_employee_no
         FROM certification c
         JOIN person p ON p.employee_no = c.employee_no
         LEFT JOIN employment e ON e.employee_no = p.employee_no AND e.is_current = 1
         WHERE c.expires_at IS NOT NULL AND c.expires_at <= DATE_ADD(CURDATE(), INTERVAL 90 DAY) AND c.expires_at >= CURDATE()`
      );
      for (const row of rows) {
        await notify.certificationExpiring(row.email, row.full_legal_name, row.name, row.expires_at);
        if (row.reports_to_employee_no) {
          const [mgr] = await db.query('SELECT email FROM person WHERE employee_no = ?', [row.reports_to_employee_no]);
          if (mgr) await notify.certificationExpiring(mgr.email, row.full_legal_name, row.name, row.expires_at);
        }
      }
      logger.info('cron: certification_expiring digest done', { count: rows.length });
    } catch (err) {
      logger.error('cron: certification_expiring digest failed', { error: err.message });
    }
  });

  logger.info('cron jobs registered: timesheet_missing (Fri 15:00), certification_expiring (Mon 08:00)');
};
