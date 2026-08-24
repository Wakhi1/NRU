const nodemailer = require('nodemailer');
const env = require('../config/env');
const { logger } = require('./logger');
const db = require('./db');

let transporter = null;
if (env.smtp.host) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
} else {
  logger.warn('SMTP not configured (SMTP_HOST empty) — outgoing mail will be logged, not sent.');
}

function wrap(title, bodyHtml) {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto">
    <div style="background:#0f3b2e;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
      <strong>NRU HRIS</strong>
    </div>
    <div style="border:1px solid #e2e2e2;border-top:none;padding:20px;border-radius:0 0 8px 8px">
      <h2 style="margin-top:0;font-size:18px">${title}</h2>
      ${bodyHtml}
    </div>
    <p style="color:#888;font-size:12px;padding:12px 4px">United Nations and Religions World Organization · Information Technology Department</p>
  </div>`;
}

// Sends mail if the SMTP transport is configured and the event is enabled in notification_setting.
// Always writes a notification_log row (status sent/failed/skipped) so Settings > Notifications is truthful.
async function sendNotification(eventKey, to, subject, bodyHtml) {
  let enabled = true;
  try {
    const rows = await db.query('SELECT is_enabled FROM notification_setting WHERE event_key = ?', [eventKey]);
    if (rows.length) enabled = !!rows[0].is_enabled;
  } catch (err) {
    logger.error('failed to read notification_setting', { eventKey, error: err.message });
  }

  if (!enabled) {
    await logAttempt(eventKey, to, subject, 'skipped', 'event disabled in notification settings');
    return;
  }
  if (!to) {
    await logAttempt(eventKey, to, subject, 'skipped', 'recipient has no email on file');
    return;
  }
  if (!transporter) {
    logger.info('mail (SMTP not configured, not sent)', { eventKey, to, subject });
    await logAttempt(eventKey, to, subject, 'skipped', 'SMTP not configured');
    return;
  }

  try {
    await transporter.sendMail({ from: env.smtp.from, to, subject, html: wrap(subject, bodyHtml) });
    logger.info('mail sent', { eventKey, to, subject });
    await logAttempt(eventKey, to, subject, 'sent', null);
  } catch (err) {
    logger.error('mail send failed', { eventKey, to, subject, error: err.message });
    await logAttempt(eventKey, to, subject, 'failed', err.message);
  }
}

// Security mail (login OTP codes, MFA enrollment/disable confirmations) is never gated by
// notification_setting — an admin disabling a routine notification event must not be able to
// accidentally turn off login security codes. Still logged to notification_log for visibility.
async function sendSecurityMail(eventKey, to, subject, bodyHtml) {
  if (!to) { await logAttempt(eventKey, to, subject, 'skipped', 'recipient has no email on file'); return; }
  if (!transporter) {
    logger.warn('security mail (SMTP not configured, not sent)', { eventKey, to, subject });
    await logAttempt(eventKey, to, subject, 'skipped', 'SMTP not configured');
    return;
  }
  try {
    await transporter.sendMail({ from: env.smtp.from, to, subject, html: wrap(subject, bodyHtml) });
    logger.info('security mail sent', { eventKey, to, subject });
    await logAttempt(eventKey, to, subject, 'sent', null);
  } catch (err) {
    logger.error('security mail send failed', { eventKey, to, subject, error: err.message });
    await logAttempt(eventKey, to, subject, 'failed', err.message);
  }
}

async function logAttempt(eventKey, to, subject, status, error) {
  try {
    await db.query(
      'INSERT INTO notification_log (event_key, recipient_email, subject, status, error) VALUES (?, ?, ?, ?, ?)',
      [eventKey, to, subject, status, error]
    );
  } catch (err) {
    logger.error('failed to write notification_log', { error: err.message });
  }
}

const notify = {
  leaveSubmitted: (to, employeeName, days, type) =>
    sendNotification('leave_submitted', to, `Leave request submitted — ${employeeName}`,
      `<p>${employeeName} submitted a request for <strong>${days} day(s)</strong> of ${type}.</p>`),

  leaveDecided: (to, employeeName, status, type) =>
    sendNotification('leave_decided', to, `Leave ${status} — ${type}`,
      `<p>Your ${type} request has been <strong>${status}</strong>.</p>`),

  timesheetMissing: (to, employeeName, period) =>
    sendNotification('timesheet_missing', to, `Timesheet not submitted — ${period}`,
      `<p>${employeeName} has not submitted a timesheet for ${period}. Please complete it before the weekly cut-off.</p>`),

  payslipReleased: (to, employeeName, period) =>
    sendNotification('payslip_released', to, `Payslip released — ${period}`,
      `<p>Your payslip for ${period} is now available in Employee self-service.</p>`),

  payrollAwaitingApproval: (to, period) =>
    sendNotification('payroll_awaiting_approval', to, `Payroll run awaiting approval — ${period}`,
      `<p>The ${period} payroll run is ready for your review and approval.</p>`),

  certificationExpiring: (to, employeeName, certName, expiresAt) =>
    sendNotification('certification_expiring', to, `Certification expiring soon — ${certName}`,
      `<p>${employeeName}'s <strong>${certName}</strong> expires on ${expiresAt}. Please arrange renewal.</p>`),

  securityOtp: (to, code) =>
    sendSecurityMail('login_email_otp', to, `Your sign-in code: ${code}`,
      `<p>Use this code to finish signing in. It expires in 10 minutes.</p>
       <p style="font-family:monospace;font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">${code}</p>
       <p style="color:#888;font-size:12px">If you didn't try to sign in, you can ignore this email — your account is still safe.</p>`),

  mfaEnrolled: (to, method) =>
    sendSecurityMail('mfa_enrolled', to, `Two-factor authentication enabled (${method})`,
      `<p>${method === 'totp' ? 'An authenticator app' : 'Email code sign-in'} was just enabled on your NRU HRIS account. If this wasn't you, contact HR or IT immediately.</p>`),

  mfaDisabled: (to, method) =>
    sendSecurityMail('mfa_disabled', to, `Two-factor authentication disabled (${method})`,
      `<p>${method === 'totp' ? 'Authenticator app' : 'Email code'} sign-in was just turned off on your NRU HRIS account. If this wasn't you, contact HR or IT immediately.</p>`),
};

module.exports = { sendNotification, sendSecurityMail, notify };
