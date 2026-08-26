// Nightly (and on-demand) HRIS reconciliation — architecture doc §2.2/§3.6. Pulls the employee
// roster and org hierarchy from the HRIS integration API and refreshes the local employee_cache
// projection, including `role_name` — copied VERBATIM from the HRIS's own role.name (no
// derivation, no job-title heuristics, no local role table). Also mirrors any profile photo into
// a local cache since the HRIS's own photo URL is bearer-token-gated and can't be hot-linked from
// a browser <img> tag, and mirrors the org-unit hierarchy for display (org_unit_cache).
const fs = require('fs');
const path = require('path');
const db = require('./db');
const hris = require('./hris');
const logger = require('./logger');

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

    await cachePhoto(emp.employee_no, emp.photo_url, existing[0]?.photo_path).catch((err) =>
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

  logger.info(`HRIS reconciliation complete: ${employees.length} employees, ${orgUnits.length} org units`);
  return { employees: employees.length, orgUnits: orgUnits.length };
}

module.exports = { reconcile };
