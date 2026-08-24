// API keys for machine-to-machine integration (smartphone tracking, accounting, fleet/logistics
// systems pulling employee/timesheet data — see docs/INTEGRATION.md). Same hashing discipline as
// user passwords (bcrypt, see hashPassword/verifyPassword in ./auth.js): the plaintext key is
// shown to the admin exactly once at creation time and is never recoverable afterwards, only
// re-derivable-and-compared via bcrypt on each request.
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const KEY_BYTES = 24; // -> 32 base64url chars of entropy
const PREFIX = 'hris_'; // kept short: api_key.key_prefix is VARCHAR(12), so PREFIX + PREFIX_STORE_LEN must fit in 12
const PREFIX_STORE_LEN = 7; // chars of the random part kept in plaintext for fast DB lookup (5 + 7 = 12)

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateApiKey() {
  const random = base64url(crypto.randomBytes(KEY_BYTES));
  const plaintext = PREFIX + random;
  const prefix = PREFIX + random.slice(0, PREFIX_STORE_LEN);
  const hash = await bcrypt.hash(plaintext, 10);
  return { plaintext, prefix, hash };
}

function verifyApiKey(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

function parseScopes(scopesCsv) {
  return String(scopesCsv || '').split(',').map((s) => s.trim()).filter(Boolean);
}

module.exports = { generateApiKey, verifyApiKey, parseScopes, PREFIX, PREFIX_STORE_LEN };
