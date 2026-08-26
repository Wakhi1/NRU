// The only file that talks to the HRIS. Everything else in SPTS reads employee identity out of
// the local employee_cache projection (kept fresh by reconcile.js), never straight from here — see
// architecture doc §2 ("the system never owns employee records") and the HRIS's own
// docs/INTEGRATION.md for the API this wraps.
const BASE = process.env.HRIS_API_BASE;
const KEY = process.env.HRIS_API_KEY;
const logger = require('./logger');

async function call(path, { method = 'GET', body } = {}) {
  if (!KEY) throw new Error('HRIS_API_KEY is not configured — issue one from the HRIS Integrations page');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.error || `HRIS integration call failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return payload.data;
}

const listEmployees = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return call(`/employees${qs ? `?${qs}` : ''}`);
};

const listOrgUnits = () => call('/org-units');

const clockIn = (employeeNo, { source = 'mobile_gps', device, geo } = {}) =>
  call(`/employees/${employeeNo}/clock-in`, { method: 'POST', body: { source, device, geo } });

const clockOut = (employeeNo) => call(`/employees/${employeeNo}/clock-out`, { method: 'POST' });

// Downloads a profile photo's raw bytes (not JSON — bypasses the call() helper's json parsing).
// Returns null if the employee has none or the HRIS 404s, rather than throwing — a missing photo
// is a normal, expected state (architecture doc §2.3: fall back to an initials monogram), not an
// integration failure.
async function fetchEmployeePhoto(employeeNo) {
  if (!KEY) return null;
  const res = await fetch(`${BASE}/employees/${employeeNo}/photo`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[contentType] || '.jpg';
  return { buffer: buf, ext };
}

// Pushes one of SPTS's own privileged actions into the HRIS's central audit trail (scope
// `audit:create` — write-only, see docs/INTEGRATION.md on the HRIS side) so cross-system "who did
// what, when" stays answerable from one place. Fire-and-forget by design: a slow/unreachable HRIS
// must never block or fail an SPTS action just because the cross-system audit copy didn't land —
// SPTS's own local audit_event (platform/audit.js) is always the primary, authoritative record.
async function writeAuditEvent({ action, entityType, entityId, actorEmployeeNo, note }) {
  try {
    await call('/audit-events', {
      method: 'POST',
      body: { action, entity_type: entityType, entity_id: entityId != null ? String(entityId) : null, actor_employee_no: actorEmployeeNo || null, note: note || null },
    });
  } catch (err) {
    logger.warn('HRIS audit-event push failed (non-fatal)', { action, entityType, error: err.message });
  }
}

// Login delegation — the explicit "SPTS should not use users within its own database to do any
// actions" decision: there is no local password_hash anywhere in SPTS, this call to the HRIS IS
// the login check. Same account, same lockout counters, no matter which app's sign-in form is
// used. Never throws on bad credentials — {valid:false} is a normal outcome, not an integration
// failure; only a genuine network/HRIS-down problem throws.
const verifyLogin = (email, password) => call('/auth/verify-login', { method: 'POST', body: { email, password } });

// Ecosystem MFA — HRIS is the single authority, and now the ONLY authority: SPTS holds no local
// TOTP secret or email-OTP state for anyone. The raw TOTP secret never crosses this API in either
// direction, only yes/no answers. Returns null (rather than throwing) when the employee has no
// HRIS login at all (404) — that's a normal case for someone who's never been issued a system
// account, and means they simply cannot sign in to SPTS (or anything else in the ecosystem) yet,
// not that this call failed.
async function getMfaStatus(employeeNo) {
  try {
    return await call(`/employees/${employeeNo}/mfa-status`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

const sendMfaEmailCode = (employeeNo) => call(`/employees/${employeeNo}/mfa/send-email-code`, { method: 'POST' });

const verifyMfaCode = (employeeNo, code, method) =>
  call(`/employees/${employeeNo}/mfa/verify`, { method: 'POST', body: { code, method } });

module.exports = {
  listEmployees, listOrgUnits, clockIn, clockOut, fetchEmployeePhoto, writeAuditEvent,
  getMfaStatus, sendMfaEmailCode, verifyMfaCode, verifyLogin,
};
