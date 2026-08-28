// Nightly (and on-demand) HRIS reconciliation — mirrors SPTS's own reconcile.js exactly. Pulls the
// employee roster and org hierarchy from the HRIS integration API and refreshes the local
// employee_cache projection, including `role_name` — copied VERBATIM from the HRIS's own role.name
// (no derivation, no job-title heuristics, no local role table). Also mirrors any profile photo
// since the HRIS's own photo URL is bearer-token-gated and can't be hot-linked from a browser <img>
// tag, and mirrors the org-unit hierarchy for display (org_unit_cache).
const fs = require('fs');
const path = require('path');
const db = require('./db');
const hris = require('./hris');
const logger = require('./logger');
const { loadPermissionsFromDb, discoverRoles } = require('./scope');

const PHOTO_DIR = path.join(__dirname, '..', '..', 'public', 'img', 'people');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

async function cachePhoto(employeeNo, hrisPhotoUrl, currentPhotoPath) {
  if (!hrisPhotoUrl) {
    if (currentPhotoPath) {
      fs.unlink(path.join(PHOTO_DIR, path.basename(currentPhotoPath)), () => {});
      await db.query('UPDATE employee_cache SET photo_path = NULL WHERE employee_no = ?', [employeeNo]);
    }
    return;
  }
  const photo = await hris.fetchEmployeePhoto(employeeNo).catch(() => null);
  if (!photo) return; // 404/no file on the HRIS side — leave whatever we had, don't churn on a transient failure
  const filename = `${employeeNo}${photo.ext}`;
  fs.writeFileSync(path.join(PHOTO_DIR, filename), photo.buffer);
  await db.query('UPDATE employee_cache SET photo_path = ? WHERE employee_no = ?', [`/img/people/${filename}`, employeeNo]);
}

async function reconcile() {
  const [employees, orgUnits] = await Promise.all([hris.listEmployees(), hris.listOrgUnits()]);

  for (const emp of employees) {
    const existing = await db.query('SELECT photo_path FROM employee_cache WHERE employee_no = ?', [emp.employee_no]);
    await db.query(
      `INSERT INTO employee_cache (employee_no, full_legal_name, preferred_name, email, phone, gender, status,
         position_title, department, contract_type, grade, duty_station, reports_to_employee_no, role_name,
         start_date, hris_updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE full_legal_name=VALUES(full_legal_name), preferred_name=VALUES(preferred_name),
         email=VALUES(email), phone=VALUES(phone), gender=VALUES(gender), status=VALUES(status),
         position_title=VALUES(position_title), department=VALUES(department), contract_type=VALUES(contract_type),
         grade=VALUES(grade), duty_station=VALUES(duty_station), reports_to_employee_no=VALUES(reports_to_employee_no),
         role_name=VALUES(role_name), start_date=VALUES(start_date), hris_updated_at=VALUES(hris_updated_at)`,
      [emp.employee_no, emp.full_legal_name, emp.preferred_name || null, emp.email, emp.phone || null, emp.gender || null,
        emp.status, emp.position_title, emp.department, emp.contract_type, emp.grade || null, emp.duty_station || null,
        emp.reports_to_employee_no || null, emp.role_name || null, emp.start_date || null, emp.updated_at || null]
    );

    await cachePhoto(emp.employee_no, emp.photo_url, existing[0] ? existing[0].photo_path : null).catch((err) =>
      logger.warn(`photo cache failed for ${emp.employee_no}`, err.message));
  }

  for (const unit of orgUnits) {
    await db.query(
      `INSERT INTO org_unit_cache (id, kind, name, parent_id, cost_centre, duty_station, lead_employee_no, current_headcount)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE kind=VALUES(kind), name=VALUES(name), parent_id=VALUES(parent_id), cost_centre=VALUES(cost_centre),
         duty_station=VALUES(duty_station), lead_employee_no=VALUES(lead_employee_no), current_headcount=VALUES(current_headcount)`,
      [unit.id, unit.kind, unit.name, unit.parent_id || null, unit.cost_centre || null, unit.duty_station || null,
        unit.lead_employee_no || null, unit.current_headcount || 0]
    );
  }

  // Re-derives ROLES (screens + permissions) from role_permission every time this runs — including
  // discovering any role_name that just appeared on a synced employee for the first time (a role
  // created or renamed in the HRIS since this app last reconciled). This is what makes "reconcile
  // from HRIS now" actually reflect a brand-new or changed role immediately, not just at next
  // server restart. `employee_cache` above is already up to date by this point, so discoverRoles()
  // sees the real, current set of role_names.
  const newRoles = await discoverRoles();
  await loadPermissionsFromDb();

  logger.info(`HRIS reconciliation complete: ${employees.length} employees, ${orgUnits.length} org units`);
  return { employees: employees.length, orgUnits: orgUnits.length, newRoles };
}

// Dispatch-time checks (docs/INTEGRATION.md's own worked example for this consumer) — called live
// against the HRIS rather than cached in bulk, since "is this person currently on leave" and "has
// this certification lapsed" are time-sensitive facts best answered at the moment of authorising a
// trip, not from a nightly snapshot. Both fail open (return false / empty) on an HRIS error so a
// slow/unreachable HRIS never blocks trip authorisation outright — the transport officer still sees
// the underlying error surfaced separately if the call itself failed.
async function isOnLeaveToday(employeeNo) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const rows = await hris.getEmployeeLeave(employeeNo, { status: 'approved', from: today, to: today });
    return rows.length > 0;
  } catch (err) {
    logger.warn('HRIS leave check failed (non-fatal)', err.message);
    return false;
  }
}

async function expiringCertifications(employeeNo, withinDays = 30) {
  try {
    const rows = await hris.getEmployeeCertifications(employeeNo);
    const cutoff = new Date(Date.now() + withinDays * 86400000);
    return rows.filter((c) => c.expires_at && new Date(c.expires_at) <= cutoff);
  } catch (err) {
    logger.warn('HRIS certification check failed (non-fatal)', err.message);
    return [];
  }
}

module.exports = { reconcile, isOnLeaveToday, expiringCertifications };
