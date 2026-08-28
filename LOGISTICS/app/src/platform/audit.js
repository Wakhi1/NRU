const db = require('./db');
const hris = require('./hris');

// Every privileged FLMS action is written here (local, authoritative) AND mirrored into the
// HRIS's own central audit trail via its audit:create integration scope (fire-and-forget — see
// hris.writeAuditEvent's own comment on why a slow/unreachable HRIS must never block this).
async function writeAudit(req, action, entityType, entityId, before, after) {
  const actor = (req.session && req.session.user && req.session.user.employeeNo) || null;
  await db.query(
    `INSERT INTO audit_event (actor_employee_no, action, entity_type, entity_id, before_json, after_json)
     VALUES (?,?,?,?,?,?)`,
    [actor, action, entityType, String(entityId != null ? entityId : ''),
      before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]
  );
  const note = after ? JSON.stringify(after) : (before ? JSON.stringify(before) : null);
  hris.writeAuditEvent({ action, entityType, entityId, actorEmployeeNo: actor, note });
}

module.exports = { writeAudit };
