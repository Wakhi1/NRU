// No password hashing here — SPTS holds no local credential to hash or verify. Login is fully
// delegated to the HRIS (see routes/auth.routes.js and platform/hris.js's verifyLogin). This file
// is purely about SESSION and ROLE checks once someone is already signed in.
const db = require('./db');
const { unauthorized, forbidden } = require('./errors');

// Role is read straight off the synced HRIS role name — no local role table, no elevation, no
// derivation. A person with no HRIS role (or no HRIS login at all) gets no roles, which in
// practice never happens for anyone who made it past login — see auth.routes.js.
async function getEffectiveRoleKeys(employeeNo) {
  const rows = await db.query('SELECT role_name FROM employee_cache WHERE employee_no = ?', [employeeNo]);
  return rows[0]?.role_name ? [rows[0].role_name] : [];
}

function requireAuth(req, res, next) {
  if (!req.session.user) return next(unauthorized());
  next();
}

function requireScreen(screenKey) {
  const { ROLES } = require('./scope');
  return (req, res, next) => {
    if (!req.session.user) return next(unauthorized());
    const roles = req.session.user.roleKeys || [];
    const allowed = roles.some((k) => (ROLES[k]?.screens || []).includes(screenKey));
    if (!allowed) return next(forbidden(`Your role does not include the "${screenKey}" screen`));
    next();
  };
}

function requirePermission(permKey) {
  const { ROLES } = require('./scope');
  return (req, res, next) => {
    if (!req.session.user) return next(unauthorized());
    const roles = req.session.user.roleKeys || [];
    const allowed = roles.some((k) => (ROLES[k]?.permissions || []).includes(permKey));
    if (!allowed) return next(forbidden(`Your role does not grant "${permKey}"`));
    next();
  };
}

module.exports = { getEffectiveRoleKeys, requireAuth, requireScreen, requirePermission };
