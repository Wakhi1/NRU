// The only file that talks to the HRIS. Everything else in FLMS reads employee identity out of
// the local employee_cache projection (kept fresh by reconcile.js), never straight from here — same
// "the system never owns employee records" boundary SPTS holds, see the HRIS's own
// docs/INTEGRATION.md for the API this wraps and its own suggested access for a "Fleet / logistics"
// consumer (Employees:R, Timesheets:R, Leave:R, Certifications:R, Org:R — Identity:C and MFA:R+C
// added on top so login can be delegated the same way SPTS's is).
const BASE = process.env.HRIS_API_BASE;
const KEY = process.env.HRIS_API_KEY;
const logger = require('./logger');
// Uses the runtime's native `fetch` where available (Node 18+), falling back to the `node-fetch`
// package on an older Node — some production hosts in this ecosystem run a Node version that
// predates the global fetch API entirely, so this can't be assumed present.
const fetch = global.fetch || require('node-fetch');

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

// Fleet-specific reads — dispatch needs to know someone isn't on leave and their driving/safety
// certification hasn't lapsed before assigning them a trip (docs/INTEGRATION.md's own worked
// example for this exact consumer).
const listLeave = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return call(`/leave${qs ? `?${qs}` : ''}`);
};
const getEmployeeLeave = (employeeNo, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return call(`/employees/${employeeNo}/leave${qs ? `?${qs}` : ''}`);
};
const listCertifications = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return call(`/certifications${qs ? `?${qs}` : ''}`);
};
const getEmployeeCertifications = (employeeNo) => call(`/employees/${employeeNo}/certifications`);

// Downloads a profile photo's raw bytes (not JSON — bypasses the call() helper's json parsing).
// Returns null if the employee has none or the HRIS 404s, rather than throwing — a missing photo
// is a normal, expected state, not an integration failure.
async function fetchEmployeePhoto(employeeNo) {
  if (!KEY) return null;
  const res = await fetch(`${BASE}/employees/${employeeNo}/photo`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[contentType] || '.jpg';
  return { buffer: buf, ext };
}

// Pushes one of FLMS's own privileged actions into the HRIS's central audit trail (scope
// `audit:create` — write-only) so cross-system "who did what, when" stays answerable from one
// place. Fire-and-forget: a slow/unreachable HRIS must never block or fail an FLMS action just
// because the cross-system audit copy didn't land — FLMS's own local audit_event (platform/audit.js)
// is always the primary, authoritative record.
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

// Login delegation — FLMS holds no local password_hash anywhere, this call to the HRIS IS the
// login check. Same account, same lockout counters, no matter which app's sign-in form is used.
// Never throws on bad credentials — {valid:false} is a normal outcome, not an integration failure;
// only a genuine network/HRIS-down problem throws.
const verifyLogin = (email, password) => call('/auth/verify-login', { method: 'POST', body: { email, password } });

// Ecosystem MFA — HRIS is the single authority. FLMS holds no local TOTP secret or email-OTP state
// for anyone. The raw TOTP secret never crosses this API in either direction, only yes/no answers.
// Returns null (rather than throwing) when the employee has no HRIS login at all (404) — that's a
// normal case for someone who's never been issued a system account, and means they simply cannot
// sign in to FLMS (or anything else in the ecosystem) yet, not that this call failed.
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
  listEmployees, listOrgUnits, listLeave, getEmployeeLeave, listCertifications, getEmployeeCertifications,
  fetchEmployeePhoto, writeAuditEvent, getMfaStatus, sendMfaEmailCode, verifyMfaCode, verifyLogin,
};
