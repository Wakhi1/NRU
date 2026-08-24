const db = require('./db');
const { logger } = require('./logger');

// `options.consumer` lets a non-session caller (the API-key integration routes — there's no
// human actor, req.session is absent) identify which external system made the call, instead of
// every such write silently defaulting to 'web'. actor stays null in that case; the consumer
// column is what attributes the row.
async function writeAudit(req, action, entityType, entityId, before, after, options = {}) {
  const actor = req.session && req.session.user ? req.session.user.employeeNo : null;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const consumer = options.consumer || 'web';
  await db.query(
    `INSERT INTO audit_event (actor_employee_no, action, entity_type, entity_id, before_json, after_json, ip, consumer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [actor, action, entityType, String(entityId), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, ip, consumer]
  );
  (req.log || logger).info('audit_event', { action, entityType, entityId, actor, consumer });
}

module.exports = { writeAudit };
