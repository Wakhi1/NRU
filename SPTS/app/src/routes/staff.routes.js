// "All employee devices" — architecture doc §6: geofencing covers office/depot/vehicle staff too,
// not just field teams. Org-wide for System administrator/HR administrator; a Head of Department
// only sees their own department (data-scope, not just a permission check) and never live
// coordinates — presence only, matching §3.3's explicit denial of location.* to that role.
const express = require('express');
const db = require('../platform/db');
const { requireAuth } = require('../platform/auth');
const { asyncHandler, forbidden } = require('../platform/errors');
const { hasPermission } = require('../platform/scope');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const roleKeys = req.session.user.roleKeys;
  const orgWide = hasPermission(roleKeys, 'staff.view.org');
  const deptScoped = hasPermission(roleKeys, 'staff.view.dept');
  if (!orgWide && !deptScoped) throw forbidden('Your role does not include staff coverage');

  const params = [];
  let deptClause = '1=1';
  if (!orgWide && deptScoped) {
    const me = await db.query('SELECT department FROM employee_cache WHERE employee_no = ?', [req.session.user.employeeNo]);
    deptClause = 'e.department = ?';
    params.push(me[0]?.department || '__none__');
  }

  const rows = await db.query(
    `SELECT e.employee_no, e.full_legal_name, e.department, e.position_title, e.status, e.photo_path,
            e.phone, e.grade, e.duty_station,
            d.id AS device_id, d.asset_tag, d.hw_model, d.kind AS device_kind, d.status AS device_status, d.battery_pct,
            z.name AS zone_name, z.kind AS zone_kind,
            ci.decision AS last_decision, ci.status AS shift_status, ci.shift_started_at
     FROM employee_cache e
     LEFT JOIN device d ON d.assigned_employee_no = e.employee_no
     LEFT JOIN zone_assignment za ON za.employee_no = e.employee_no
     LEFT JOIN zone z ON z.id = za.zone_id
     LEFT JOIN check_in ci ON ci.id = (
       SELECT id FROM check_in WHERE employee_no = e.employee_no ORDER BY id DESC LIMIT 1
     )
     WHERE e.status = 'active' AND ${deptClause}
     ORDER BY e.department, e.full_legal_name`,
    params
  );
  res.json({ data: rows, scope: orgWide ? 'organisation' : 'department' });
}));

module.exports = router;
