// Field-level encryption at rest — AES-256-GCM for the handful of columns that are genuinely
// sensitive on their own (national ID, next-of-kin phone, bank account/tax number, TOTP secret).
// Not applied blanket-wide: the database itself sits behind the app, and most fields don't need
// this on top of the existing scope/masking model — these are the ones where a raw DB dump (a
// stolen backup, a misconfigured replica) would otherwise hand over something immediately
// sensitive in plaintext. TLS (see server.js) covers everything else "at rest" cares about less
// than "in transit" — this module is specifically the at-rest half.
const crypto = require('crypto');
const env = require('../config/env');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey = null;
function getKey() {
  if (cachedKey) return cachedKey;
  const raw = env.encryptionKey;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is not set — required for field-level encryption at rest. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256) — got ${buf.length}. Provide 64 hex chars or a base64 string encoding 32 bytes.`);
  }
  cachedKey = buf;
  return cachedKey;
}

// Returns null for empty input so "no value" stays "no value" rather than becoming an encrypted
// empty string — keeps NULL-vs-blank semantics identical to the unencrypted column.
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

// Tolerant of legacy/unmigrated plaintext: if the stored value doesn't parse as our
// iv+tag+ciphertext format (too short, bad base64, auth-tag mismatch), it's returned unchanged
// rather than the request failing — a corrupt/foreign value should surface, not vanish.
function decrypt(stored) {
  if (stored === null || stored === undefined || stored === '') return stored;
  try {
    const buf = Buffer.from(stored, 'base64');
    if (buf.length <= IV_LEN + TAG_LEN) return stored;
    const iv = buf.subarray(0, IV_LEN);
    const authTag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (e) {
    return stored;
  }
}

// Binary counterparts of encrypt()/decrypt() above, for files rather than DB text columns — same
// algorithm/key, same iv+tag+ciphertext layout, but operating on raw Buffers with no utf8/base64
// coercion (which would bloat an image ~33% and risks corrupting binary data). Used by
// platform/fileServe.js and the upload routes that write into uploads/ and public/img.
function encryptBuffer(buf) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(buf), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

// Tolerant like decrypt() above: a buffer that doesn't parse as our format (too short, or the
// GCM auth tag doesn't verify) is returned unchanged — a not-yet-migrated legacy plaintext file,
// or a bundled asset that was never encrypted in the first place (e.g. the default org logo
// shipped in the repo), degrades to "serve as-is" rather than the request failing. GCM's auth tag
// makes this safe: real plaintext will essentially never happen to verify as valid ciphertext.
function decryptBufferTolerant(buf) {
  if (!buf || buf.length <= IV_LEN + TAG_LEN) return buf;
  try {
    const iv = buf.subarray(0, IV_LEN);
    const authTag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (e) {
    return buf;
  }
}

module.exports = { encrypt, decrypt, encryptBuffer, decryptBufferTolerant };
