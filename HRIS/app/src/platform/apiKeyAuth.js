// Authentication for the machine-to-machine integration API (src/routes/integration.routes.js).
// Deliberately separate from the session-based requireAuth/requireScope in ./auth.js and
// ./scope.js — those model an interactive human user with a role and per-module data_scope;
// this models an external SYSTEM with a flat list of scope strings (e.g. 'employees:read'). Do
// not try to merge the two.
const db = require('./db');
const { unauthorized, forbidden, asyncHandler } = require('./errors');
const { verifyApiKey, parseScopes, PREFIX, PREFIX_STORE_LEN } = require('./apiKey');

const apiKeyAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) throw unauthorized('Missing API key — send it as "Authorization: Bearer <key>"');
  const plaintext = match[1].trim();
  if (!plaintext.startsWith(PREFIX)) throw unauthorized('Invalid API key');

  const random = plaintext.slice(PREFIX.length);
  const prefix = PREFIX + random.slice(0, PREFIX_STORE_LEN);
  const candidates = await db.query('SELECT * FROM api_key WHERE key_prefix = ?', [prefix]);

  let matched = null;
  for (const row of candidates) {
    if (await verifyApiKey(plaintext, row.key_hash)) { matched = row; break; }
  }
  if (!matched) throw unauthorized('Invalid API key');
  if (!matched.is_active) throw unauthorized('This API key has been revoked');
  if (matched.expires_at && new Date(matched.expires_at) <= new Date()) throw unauthorized('This API key has expired');

  db.query('UPDATE api_key SET last_used_at = NOW() WHERE id = ?', [matched.id]).catch(() => {});
  req.apiKey = { id: matched.id, name: matched.name, scopes: parseScopes(matched.scopes) };
  next();
});

function requireApiScope(scope) {
  return (req, res, next) => {
    if (!req.apiKey) return next(unauthorized());
    if (!req.apiKey.scopes.includes(scope)) return next(forbidden(`This API key does not have the "${scope}" scope`));
    next();
  };
}

module.exports = { apiKeyAuth, requireApiScope };
