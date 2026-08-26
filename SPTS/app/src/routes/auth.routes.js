// Login is fully delegated to the HRIS — SPTS holds no local password, no local TOTP secret, no
// local email-OTP state for anyone. This is a deliberate, explicit decision: "SPTS should not use
// users within its own database to do any actions, integrations come in in that place... there
// should be one database that records if a user has enrolled in an authenticator app — the HRIS."
// Every employee in this ecosystem is the same account everywhere; SPTS's job is to ask the HRIS
// "is this login valid?" and "does this person need a second factor?", never to keep its own copy
// of the answer. An employee with no HRIS login simply cannot sign in to SPTS — that's the correct
// outcome of centralizing identity, not a bug.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, unauthorized, forbidden } = require('../platform/errors');
const { getEffectiveRoleKeys, requireAuth } = require('../platform/auth');
const { writeAudit } = require('../platform/audit');
const { mfaVerifySchema, loginSchema } = require('../validators/schemas');
const { ROLES, screensFor } = require('../platform/scope');
const hris = require('../platform/hris');
const logger = require('../platform/logger');

const router = express.Router();

async function sessionUserFor(employeeNo, name) {
  const roleKeys = await getEffectiveRoleKeys(employeeNo);
  return { employeeNo, name, roleKeys };
}

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid email or password');
  const { email, password } = parsed.data;

  let verdict;
  try {
    verdict = await hris.verifyLogin(email, password);
  } catch (err) {
    logger.error('HRIS login verification call failed', err.message);
    throw new Error('Could not reach the HRIS to sign you in — try again shortly');
  }

  if (verdict.locked) throw forbidden(`Too many failed attempts. Try again in ${verdict.minutes_left} minute(s).`);
  if (!verdict.valid) throw unauthorized('Invalid email or password');

  // employee_cache is refreshed nightly (and on-demand via admin "Reconcile now") — a brand-new
  // HRIS account that hasn't synced here yet would otherwise pass the HRIS credential check and
  // then have nothing for SPTS to attach a role to. Rather than surface that as a confusing
  // "invalid role" error, tell the person plainly what's actually going on.
  const emp = await db.query('SELECT status FROM employee_cache WHERE employee_no = ?', [verdict.employee_no]);
  if (!emp[0] || emp[0].status !== 'active') {
    throw forbidden('Your HRIS account checked out, but SPTS hasn\'t synced you yet — ask IT to run "Reconcile from HRIS now"');
  }

  const hrisStatus = await hris.getMfaStatus(verdict.employee_no).catch((err) => {
    logger.warn('HRIS MFA status check failed', err.message);
    return null;
  });
  const methods = [];
  if (hrisStatus?.totp_enabled) methods.push('totp');
  if (hrisStatus?.email_otp_enabled) methods.push('email');

  if (methods.length) {
    req.session.pendingMfa = { employeeNo: verdict.employee_no, name: verdict.full_legal_name, methods, attempts: 0 };
    return res.json({ ok: true, mfaRequired: true, methods });
  }

  req.session.user = await sessionUserFor(verdict.employee_no, verdict.full_legal_name);
  await writeAudit(req, 'login', 'employee_cache', verdict.employee_no, null, null);
  res.json({ ok: true, user: req.session.user });
}));

router.post('/login/send-email-code', asyncHandler(async (req, res) => {
  const pending = req.session.pendingMfa;
  if (!pending) throw unauthorized('No sign-in in progress');
  if (!pending.methods.includes('email')) throw badRequest('Email code is not enabled for this account');
  if (pending.emailCodeSentAt && Date.now() - pending.emailCodeSentAt < 30000) throw badRequest('Please wait a few seconds before requesting another code');

  const { sentTo } = await hris.sendMfaEmailCode(pending.employeeNo);
  pending.emailCodeSentAt = Date.now();
  res.json({ ok: true, sentTo });
}));

router.post('/login/verify', asyncHandler(async (req, res) => {
  const pending = req.session.pendingMfa;
  if (!pending) throw unauthorized('No sign-in in progress');

  const parsed = mfaVerifySchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Enter the 6-digit code');
  const { code, method } = parsed.data;

  if (pending.attempts >= 8) {
    delete req.session.pendingMfa;
    throw forbidden('Too many attempts — please sign in again');
  }

  let valid = false;
  try {
    const result = await hris.verifyMfaCode(pending.employeeNo, code, method);
    valid = !!result.valid;
  } catch (err) {
    logger.error('HRIS MFA verify call failed', err.message);
    throw new Error('Could not reach the HRIS to verify this code — try again shortly');
  }

  if (!valid) {
    pending.attempts += 1;
    await writeAudit(req, 'login_mfa_failed', 'employee_cache', pending.employeeNo, null, { method });
    throw unauthorized('Incorrect code');
  }

  const employeeNo = pending.employeeNo, name = pending.name;
  delete req.session.pendingMfa;
  req.session.user = await sessionUserFor(employeeNo, name);
  await writeAudit(req, 'login', 'employee_cache', employeeNo, null, { mfa: method });
  res.json({ ok: true, user: req.session.user });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const roleKeys = await getEffectiveRoleKeys(req.session.user.employeeNo);
  req.session.user.roleKeys = roleKeys;
  const photoRows = await db.query('SELECT photo_path FROM employee_cache WHERE employee_no = ?', [req.session.user.employeeNo]);
  res.json({
    data: {
      employeeNo: req.session.user.employeeNo,
      name: req.session.user.name,
      photoPath: photoRows[0]?.photo_path || null,
      roleKeys,
      roleLabels: roleKeys.map((k) => ROLES[k]?.label).filter(Boolean),
      screens: screensFor(roleKeys),
    },
  });
}));

module.exports = router;
