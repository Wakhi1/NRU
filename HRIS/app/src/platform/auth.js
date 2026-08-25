const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('./db');
const { unauthorized, forbidden, asyncHandler } = require('./errors');

const hashPassword = (plain) => bcrypt.hash(plain, 10);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Temporary password for admin-provisioned accounts (bulk "migrate to user accounts" from People
// records) — shown once in the response, never persisted in plaintext. Same unambiguous-alphabet
// approach as mfa.js's backup codes, just longer and without dashes since it's a real password
// meant to be typed at a login form, not read aloud.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function generateTempPassword(length = 12) {
  let out = '';
  for (let i = 0; i < length; i++) out += TEMP_PASSWORD_ALPHABET[crypto.randomInt(0, TEMP_PASSWORD_ALPHABET.length)];
  return out;
}

// Re-checks is_active/locked_until against the DB on every request (not just at login) so an
// admin's manual lock or suspend takes effect immediately on an already-open session, instead
// of only blocking the next login attempt. Single indexed lookup (employee_no is UNIQUE).
const requireAuth = asyncHandler(async (req, res, next) => {
  if (!req.session || !req.session.user) return next(unauthorized());
  const rows = await db.query('SELECT is_active, locked_until FROM app_user WHERE employee_no = ?', [req.session.user.employeeNo]);
  const row = rows[0];
  const stillLocked = row && row.locked_until && new Date(row.locked_until) > new Date();
  if (!row || !row.is_active || stillLocked) {
    return req.session.destroy(() => next(unauthorized('Your account has been suspended or locked — contact an administrator.')));
  }
  next();
});

// Access control administration (roles, the permission matrix, overrides) is deliberately
// gated on role identity rather than the permission matrix itself — otherwise a role could
// edit its own way into wider access. Only these two roles may administer it.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) return next(unauthorized());
    if (!roles.includes(req.session.user.role)) return next(forbidden('This action requires ' + roles.join(' or ')));
    next();
  };
}

module.exports = { hashPassword, verifyPassword, requireAuth, requireRole, generateTempPassword };
