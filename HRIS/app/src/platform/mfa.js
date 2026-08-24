// TOTP (authenticator app) + email OTP second-factor helpers, and account lockout tracking.
// TOTP secrets are stored as base32 (otplib default) directly on app_user — acceptable for
// this reference-scale app; a production deployment would encrypt this column at rest.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const env = require('../config/env');

const ISSUER = 'NRU HRIS';

function generateTotpSecret() {
  return authenticator.generateSecret();
}

function totpUri(email, secret) {
  return authenticator.keyuri(email, ISSUER, secret);
}

async function totpQrCodeDataUrl(email, secret) {
  return QRCode.toDataURL(totpUri(email, secret));
}

function verifyTotp(token, secret) {
  if (!token || !secret) return false;
  try {
    return authenticator.check(String(token).trim(), secret);
  } catch (err) {
    return false;
  }
}

// Six-digit numeric email OTP — generated fresh per challenge, hashed before storing
// (session, never the DB), expires quickly since it's only meant to be read from an inbox
// within the same login attempt.
function generateEmailOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function hashCode(code) {
  return bcrypt.hash(code, 10);
}

async function verifyCode(code, hash) {
  if (!code || !hash) return false;
  return bcrypt.compare(String(code).trim(), hash);
}

// Backup codes: 8 codes of the form XXXX-XXXX (base32-ish, unambiguous alphabet), returned
// in plaintext exactly once at generation time — only the bcrypt hash is ever persisted.
const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L to avoid transcription errors
function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    let code = '';
    for (let j = 0; j < 8; j++) {
      if (j === 4) code += '-';
      code += BACKUP_ALPHABET[crypto.randomInt(0, BACKUP_ALPHABET.length)];
    }
    codes.push(code);
  }
  return codes;
}

const LOCKOUT_DEFAULT_ATTEMPTS = 5;
const LOCKOUT_DEFAULT_WINDOW_MIN = 15;

module.exports = {
  generateTotpSecret, totpUri, totpQrCodeDataUrl, verifyTotp,
  generateEmailOtp, hashCode, verifyCode,
  generateBackupCodes,
  LOCKOUT_DEFAULT_ATTEMPTS, LOCKOUT_DEFAULT_WINDOW_MIN,
};
