// Self-service MFA enrollment — every user manages their own second factor(s) here (Settings
// > Security). Two independent methods can be enabled at once: an authenticator app (TOTP)
// and email one-time codes. Backup codes are generated alongside TOTP enrollment as the
// recovery path if the authenticator device is lost.
const express = require('express');
const db = require('../platform/db');
const { asyncHandler, badRequest, conflict } = require('../platform/errors');
const { verifyPassword } = require('../platform/auth');
const { notify } = require('../platform/mailer');
const { writeAudit } = require('../platform/audit');
const {
  generateTotpSecret, totpUri, totpQrCodeDataUrl, verifyTotp,
  generateEmailOtp, hashCode, verifyCode, generateBackupCodes,
} = require('../platform/mfa');
const { totpConfirmSchema, passwordConfirmSchema, emailOtpConfirmSchema } = require('../validators/mfa.validators');
const enc = require('../platform/crypto');

const router = express.Router();

async function currentUser(req) {
  const rows = await db.query(
    `SELECT id, email, password_hash, totp_enabled, totp_secret, email_otp_enabled, mfa_enrolled_at
     FROM app_user WHERE employee_no = ?`,
    [req.session.user.employeeNo]
  );
  if (rows[0]) rows[0].totp_secret = enc.decrypt(rows[0].totp_secret);
  return rows[0];
}

async function backupCodesRemaining(userId) {
  const rows = await db.query('SELECT COUNT(*) AS n FROM mfa_backup_code WHERE app_user_id = ? AND used_at IS NULL', [userId]);
  return rows[0].n;
}

router.get('/status', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  res.json({
    data: {
      totp_enabled: !!user.totp_enabled,
      email_otp_enabled: !!user.email_otp_enabled,
      mfa_enrolled_at: user.mfa_enrolled_at,
      backup_codes_remaining: user.totp_enabled ? await backupCodesRemaining(user.id) : 0,
    },
  });
}));

// ---- Authenticator app (TOTP) ----

router.post('/totp/setup', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const secret = generateTotpSecret();
  // Stored immediately but totp_enabled stays 0 until /totp/confirm — an abandoned setup
  // just leaves an unused secret, no functional difference from not having started.
  await db.query('UPDATE app_user SET totp_secret = ? WHERE id = ?', [enc.encrypt(secret), user.id]);
  const qrCodeDataUrl = await totpQrCodeDataUrl(user.email, secret);
  res.json({ data: { secret, otpauthUrl: totpUri(user.email, secret), qrCodeDataUrl } });
}));

router.post('/totp/confirm', asyncHandler(async (req, res) => {
  const parsed = totpConfirmSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Enter the 6-digit code from your app');
  const user = await currentUser(req);
  if (!user.totp_secret) throw badRequest('Start setup first');
  if (!verifyTotp(parsed.data.code, user.totp_secret)) throw badRequest('Incorrect code — check your app and try again');

  await db.query('UPDATE app_user SET totp_enabled = 1, mfa_enrolled_at = COALESCE(mfa_enrolled_at, NOW()) WHERE id = ?', [user.id]);
  await db.query('DELETE FROM mfa_backup_code WHERE app_user_id = ?', [user.id]);
  const codes = generateBackupCodes();
  for (const code of codes) {
    await db.query('INSERT INTO mfa_backup_code (app_user_id, code_hash) VALUES (?, ?)', [user.id, await hashCode(code)]);
  }
  await writeAudit(req, 'update', 'app_user.mfa', user.id, { totp_enabled: false }, { totp_enabled: true });
  notify.mfaEnrolled(user.email, 'totp').catch(() => {});
  res.json({ data: { backupCodes: codes } });
}));

router.post('/totp/disable', asyncHandler(async (req, res) => {
  const parsed = passwordConfirmSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Enter your password to confirm');
  const user = await currentUser(req);
  if (!await verifyPassword(parsed.data.password, user.password_hash)) throw badRequest('Incorrect password');

  await db.query('UPDATE app_user SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', [user.id]);
  await db.query('DELETE FROM mfa_backup_code WHERE app_user_id = ?', [user.id]);
  await writeAudit(req, 'update', 'app_user.mfa', user.id, { totp_enabled: true }, { totp_enabled: false });
  notify.mfaDisabled(user.email, 'totp').catch(() => {});
  res.json({ ok: true });
}));

router.post('/backup-codes/regenerate', asyncHandler(async (req, res) => {
  const parsed = passwordConfirmSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Enter your password to confirm');
  const user = await currentUser(req);
  if (!user.totp_enabled) throw conflict('Enable the authenticator app first');
  if (!await verifyPassword(parsed.data.password, user.password_hash)) throw badRequest('Incorrect password');

  await db.query('DELETE FROM mfa_backup_code WHERE app_user_id = ?', [user.id]);
  const codes = generateBackupCodes();
  for (const code of codes) {
    await db.query('INSERT INTO mfa_backup_code (app_user_id, code_hash) VALUES (?, ?)', [user.id, await hashCode(code)]);
  }
  await writeAudit(req, 'update', 'app_user.mfa_backup_codes', user.id, null, { regenerated: true });
  res.json({ data: { backupCodes: codes } });
}));

// ---- Email one-time codes ----

router.post('/email-otp/start', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const code = generateEmailOtp();
  req.session.pendingEmailOtpEnroll = { hash: await hashCode(code), expires: Date.now() + 10 * 60 * 1000 };
  await notify.securityOtp(user.email, code);
  res.json({ ok: true, sentTo: user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2') });
}));

router.post('/email-otp/confirm', asyncHandler(async (req, res) => {
  const parsed = emailOtpConfirmSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Enter the 6-digit code we emailed you');
  const pending = req.session.pendingEmailOtpEnroll;
  if (!pending || pending.expires < Date.now()) throw badRequest('That code expired — request a new one');
  if (!await verifyCode(parsed.data.code, pending.hash)) throw badRequest('Incorrect code');

  const user = await currentUser(req);
  delete req.session.pendingEmailOtpEnroll;
  await db.query('UPDATE app_user SET email_otp_enabled = 1, mfa_enrolled_at = COALESCE(mfa_enrolled_at, NOW()) WHERE id = ?', [user.id]);
  await writeAudit(req, 'update', 'app_user.mfa', user.id, { email_otp_enabled: false }, { email_otp_enabled: true });
  notify.mfaEnrolled(user.email, 'email').catch(() => {});
  res.json({ ok: true });
}));

router.post('/email-otp/disable', asyncHandler(async (req, res) => {
  const parsed = passwordConfirmSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Enter your password to confirm');
  const user = await currentUser(req);
  if (!await verifyPassword(parsed.data.password, user.password_hash)) throw badRequest('Incorrect password');

  await db.query('UPDATE app_user SET email_otp_enabled = 0 WHERE id = ?', [user.id]);
  await writeAudit(req, 'update', 'app_user.mfa', user.id, { email_otp_enabled: true }, { email_otp_enabled: false });
  notify.mfaDisabled(user.email, 'email').catch(() => {});
  res.json({ ok: true });
}));

module.exports = router;
