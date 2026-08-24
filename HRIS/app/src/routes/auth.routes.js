const express = require('express');
const db = require('../platform/db');
const { verifyPassword, requireAuth } = require('../platform/auth');
const { badRequest, unauthorized, forbidden, asyncHandler } = require('../platform/errors');
const { resolveAllScopes } = require('../platform/scope');
const { writeAudit } = require('../platform/audit');
const { notify } = require('../platform/mailer');
const { verifyTotp, generateEmailOtp, hashCode, verifyCode, LOCKOUT_DEFAULT_ATTEMPTS, LOCKOUT_DEFAULT_WINDOW_MIN } = require('../platform/mfa');
const { loginSchema, mfaVerifySchema } = require('../validators/auth.validators');
const enc = require('../platform/crypto');

const router = express.Router();

async function lockoutSettings() {
  const rows = await db.query(`SELECT setting_key, setting_value FROM app_setting WHERE setting_key IN ('lockout_attempts', 'lockout_window_minutes')`);
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    attempts: parseInt(map.lockout_attempts, 10) || LOCKOUT_DEFAULT_ATTEMPTS,
    windowMinutes: parseInt(map.lockout_window_minutes, 10) || LOCKOUT_DEFAULT_WINDOW_MIN,
  };
}

function sessionUserFromRow(user) {
  return {
    employeeNo: user.employee_no, name: user.full_legal_name, role: user.role_name, roleId: user.role_id,
    // Never changes mid-session (no UI grants/revokes this — only a direct DB edit can), so unlike
    // photoUrl there's no need to refresh it on every /auth/me call.
    isSuperAdmin: !!user.is_super_admin,
  };
}

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Invalid email or password', parsed.error.flatten());
  const { email, password } = parsed.data;

  const rows = await db.query(
    `SELECT u.id, u.employee_no, u.email, u.password_hash, u.is_active, u.role_id, u.failed_attempts, u.locked_until,
            u.totp_enabled, u.totp_secret, u.email_otp_enabled, r.name AS role_name, r.is_super_admin, p.full_legal_name
     FROM app_user u
     JOIN role r ON r.id = u.role_id
     JOIN person p ON p.employee_no = u.employee_no
     WHERE u.email = ?`,
    [email]
  );
  const user = rows[0];
  if (user) user.totp_secret = enc.decrypt(user.totp_secret);
  if (!user || !user.is_active) {
    req.log.warn('login_failed', { email, reason: 'no_such_active_user' });
    throw unauthorized('Invalid email or password');
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    req.log.warn('login_blocked_locked', { email, minutesLeft });
    throw forbidden(`Too many failed attempts. Try again in ${minutesLeft} minute(s).`);
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    const { attempts, windowMinutes } = await lockoutSettings();
    const nextFailed = user.failed_attempts + 1;
    if (nextFailed >= attempts) {
      await db.query('UPDATE app_user SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?', [windowMinutes, user.id]);
      req.log.warn('login_failed_lockout_triggered', { email, attempts: nextFailed });
      await writeAudit(req, 'login_lockout', 'app_user', user.employee_no, null, { attempts: nextFailed });
    } else {
      await db.query('UPDATE app_user SET failed_attempts = ? WHERE id = ?', [nextFailed, user.id]);
      req.log.warn('login_failed', { email, reason: 'bad_password', attempt: nextFailed });
    }
    throw unauthorized('Invalid email or password');
  }

  await db.query('UPDATE app_user SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);

  const methods = [];
  if (user.totp_enabled) methods.push('totp');
  if (user.email_otp_enabled) methods.push('email');

  if (methods.length) {
    req.session.pendingMfa = {
      userId: user.id,
      email: user.email,
      totpSecret: user.totp_secret,
      methods,
      sessionUser: sessionUserFromRow(user),
      attempts: 0,
    };
    req.log.info('login_mfa_challenge', { email, methods });
    return res.json({ ok: true, mfaRequired: true, methods });
  }

  req.session.user = sessionUserFromRow(user);
  await db.query('UPDATE app_user SET last_login_at = NOW() WHERE id = ?', [user.id]);
  await writeAudit(req, 'login', 'app_user', user.employee_no, null, { role: user.role_name });
  res.json({ ok: true, user: req.session.user });
}));

// Sends (or resends) the email OTP for a login already past the password step. Cooldown
// prevents mailbox spam from repeated clicks; the code itself is never exposed to the client.
router.post('/login/send-email-code', asyncHandler(async (req, res) => {
  const pending = req.session.pendingMfa;
  if (!pending) throw unauthorized('No sign-in in progress');
  if (!pending.methods.includes('email')) throw badRequest('Email code is not enabled for this account');

  if (pending.emailCodeSentAt && Date.now() - pending.emailCodeSentAt < 30000) {
    throw badRequest('Please wait a few seconds before requesting another code');
  }

  const code = generateEmailOtp();
  pending.emailCodeHash = await hashCode(code);
  pending.emailCodeExpires = Date.now() + 10 * 60 * 1000;
  pending.emailCodeSentAt = Date.now();

  await notify.securityOtp(pending.email, code);
  res.json({ ok: true, sentTo: pending.email.replace(/^(.{2}).*(@.*)$/, '$1***$2') });
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
  if (method === 'totp' && pending.methods.includes('totp')) {
    valid = verifyTotp(code, pending.totpSecret);
  } else if (method === 'email' && pending.methods.includes('email')) {
    valid = pending.emailCodeHash && pending.emailCodeExpires > Date.now() && await verifyCode(code, pending.emailCodeHash);
  } else if (method === 'backup') {
    const backupRows = await db.query('SELECT id, code_hash FROM mfa_backup_code WHERE app_user_id = ? AND used_at IS NULL', [pending.userId]);
    for (const row of backupRows) {
      if (await verifyCode(code.trim().toUpperCase(), row.code_hash)) {
        await db.query('UPDATE mfa_backup_code SET used_at = NOW() WHERE id = ?', [row.id]);
        valid = true;
        break;
      }
    }
  }

  if (!valid) {
    pending.attempts += 1;
    req.log.warn('login_mfa_failed', { email: pending.email, method, attempt: pending.attempts });
    await writeAudit(req, 'login_mfa_failed', 'app_user', pending.sessionUser.employeeNo, null, { method });
    throw unauthorized('Incorrect code');
  }

  const sessionUser = pending.sessionUser;
  const userId = pending.userId;
  delete req.session.pendingMfa;
  req.session.user = sessionUser;
  await db.query('UPDATE app_user SET last_login_at = NOW() WHERE id = ?', [userId]);
  await writeAudit(req, 'login', 'app_user', sessionUser.employeeNo, null, { role: sessionUser.role, mfa: method });
  res.json({ ok: true, user: sessionUser });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const employeeNo = req.session.user ? req.session.user.employeeNo : null;
  req.session.destroy(() => {
    res.clearCookie('nru_hris_sid');
    if (employeeNo) req.log.info('logout', { employeeNo });
    res.json({ ok: true });
  });
}));

// requireAuth here (this router is mounted without it, since /login must work pre-session) is
// what makes a manual lock/suspend take effect immediately — shell.js calls this on every page
// load, so it's the first place a killed session is actually observed by the client.
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  if (!req.session.user) throw unauthorized();
  const scope = await resolveAllScopes(req.session.user);
  // photo_url is read fresh from person on every call (rather than cached on the session at
  // login) so a self-service photo upload shows up in the header immediately, not after re-login.
  const rows = await db.query('SELECT photo_url FROM person WHERE employee_no = ?', [req.session.user.employeeNo]);
  const user = { ...req.session.user, photoUrl: rows[0] ? rows[0].photo_url : null };
  res.json({ user, scope });
}));

module.exports = router;
