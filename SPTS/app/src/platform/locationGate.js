// Shared by routes/auth.routes.js and routes/checkin.routes.js: "enforce location confirmation
// before they start collecting — every time after login" (the explicit ask). A shift left open
// from a previous session does not exempt a new login from re-proving where the person is: this
// is deliberately keyed off `loggedInAt` (stamped on the session at sign-in — see auth.routes.js),
// not just the recheck-interval clock, so logging back in always re-asks even inside the window.
const db = require('../platform/db');

async function getOpenCheckIn(employeeNo) {
  const rows = await db.query(
    `SELECT ci.*, z.name AS zone_name, z.radius_m AS zone_radius_m, z.center_lat, z.center_lng
     FROM check_in ci LEFT JOIN zone z ON z.id = ci.zone_id
     WHERE ci.employee_no = ? AND ci.status = 'open' ORDER BY ci.id DESC LIMIT 1`,
    [employeeNo]
  );
  return rows[0] || null;
}

async function getPolicy() {
  const rows = await db.query('SELECT * FROM policy WHERE id = 1');
  return rows[0] || { default_radius_m: 150, accuracy_ceiling_m: 50, recheck_hours: 4, offline_behavior: 'Allow — confirm at next sync', shift_start_time: null, shift_end_time: null };
}

// True when the person must (re)confirm their location before doing anything else: no confirmed
// open shift at all, the shift predates this login, or the recheck interval has elapsed.
function needsConfirmation(open, policy, loggedInAtMs) {
  if (!open || open.status !== 'open' || open.decision !== 'confirmed') return true;
  const lastVerified = new Date(open.reconfirmed_at || open.shift_started_at).getTime();
  if (loggedInAtMs && lastVerified < loggedInAtMs) return true;
  const hoursSince = (Date.now() - lastVerified) / 3600000;
  return hoursSince > (policy.recheck_hours || 4);
}

// The forced gate is scoped to people actually doing field collection — "before they start
// collecting" (the explicit ask) — not to every desk-based console user. An HR administrator or
// executive with no field zone assignment can still open myshift voluntarily (architecture doc §6
// wants org-wide geofencing eventually — office/depot handsets confirm zone state too), it just
// never blocks them out of the rest of the app the way it does for a field collector.
async function hasFieldZone(employeeNo) {
  const rows = await db.query(
    `SELECT 1 FROM zone_assignment za JOIN zone z ON z.id = za.zone_id
     WHERE za.employee_no = ? AND z.active = 1 AND z.kind = 'field' LIMIT 1`,
    [employeeNo]
  );
  return rows.length > 0;
}

async function gateFor(employeeNo, loggedInAtMs) {
  const [open, policy, isFieldCollector] = await Promise.all([getOpenCheckIn(employeeNo), getPolicy(), hasFieldZone(employeeNo)]);
  const needsLocationConfirm = isFieldCollector && needsConfirmation(open, policy, loggedInAtMs);
  return { open, policy, isFieldCollector, needsLocationConfirm };
}

module.exports = { getOpenCheckIn, getPolicy, needsConfirmation, hasFieldZone, gateFor };
