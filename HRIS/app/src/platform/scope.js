// Resolves a logged-in user's effective per-module permission (role scope ∩ overrides,
// deny always wins), enforces it as an Express pre-handler, filters queries by data_scope,
// and masks person-record fields by sensitivity class. See Implementation documentation §4.
const db = require('./db');
const { forbidden, unauthorized, asyncHandler } = require('./errors');

const MODULES = [
  'people', 'org', 'worktime', 'attendance', 'leave', 'benefits', 'payroll',
  'recruitment', 'performance', 'succession', 'training', 'intake', 'crm', 'reports', 'voip', 'assets',
];

const FIELD_CLASS_MAP = {
  public: ['employee_no', 'full_legal_name', 'preferred_name', 'photo_url', 'status'],
  internal: ['email', 'phone', 'address', 'gender', 'nationality', 'languages', 'marital_status', 'date_of_birth'],
  restricted: ['national_id'],
  sensitive: ['next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone'],
};

async function resolveScope(user, moduleName) {
  // Superuser bypass — a role flagged is_super_admin (only 'System administrator' is seeded with
  // this, granted directly in the database, no UI to hand it out) always has full access to every
  // module, at the widest data scope, with every field-sensitivity class granted. Skips the
  // permission/override queries entirely rather than merely overriding their result, since a
  // superuser must never be limited by the matrix even if it's misconfigured.
  if (user.isSuperAdmin) {
    return {
      module: moduleName,
      actions: { create: true, read: true, update: true, delete: true },
      dataScope: 'organisation',
      fieldClasses: Object.keys(FIELD_CLASS_MAP),
    };
  }

  const rows = await db.query('SELECT * FROM permission WHERE role_id = ? AND module = ?', [user.roleId, moduleName]);
  const base = rows[0] || { can_create: 0, can_read: 0, can_update: 0, can_delete: 0, data_scope: 'self', field_classes: 'public' };

  let actions = {
    create: !!base.can_create,
    read: !!base.can_read,
    update: !!base.can_update,
    delete: !!base.can_delete,
  };
  const dataScope = base.data_scope;
  const fieldClasses = (base.field_classes || 'public').split(',');

  const overrides = await db.query(
    'SELECT crud FROM permission_override WHERE employee_no = ? AND module = ? AND (expires_at IS NULL OR expires_at > NOW())',
    [user.employeeNo, moduleName]
  );
  let denyAll = false;
  let latestGrant = null;
  for (const o of overrides) {
    if (o.crud === '-') denyAll = true;
    else latestGrant = o.crud;
  }
  if (latestGrant) {
    actions = {
      create: latestGrant.includes('C'),
      read: latestGrant.includes('R'),
      update: latestGrant.includes('U'),
      delete: latestGrant.includes('D'),
    };
  }
  if (denyAll) actions = { create: false, read: false, update: false, delete: false };

  return { module: moduleName, actions, dataScope, fieldClasses };
}

function requireScope(moduleName, action) {
  return asyncHandler(async (req, res, next) => {
    if (!req.session || !req.session.user) throw unauthorized();
    const scope = await resolveScope(req.session.user, moduleName);
    if (!scope.actions[action]) throw forbidden(`No ${action} access to "${moduleName}"`);
    req.scope = scope;
    next();
  });
}

// SQL fragment that narrows a query to what this data_scope permits.
// `column` is the employee_no-typed column on the target table (default 'employee_no').
async function scopeFilterSql(scope, user, column = 'employee_no') {
  switch (scope.dataScope) {
    case 'organisation':
      return { clause: '1=1', params: [] };
    case 'team':
      return {
        clause: `${column} IN (SELECT employee_no FROM employment WHERE reports_to_employee_no = ? AND is_current = 1 UNION SELECT ?)`,
        params: [user.employeeNo, user.employeeNo],
      };
    case 'department':
      return {
        clause: `${column} IN (SELECT employee_no FROM employment WHERE department_org_unit_id = (SELECT department_org_unit_id FROM employment WHERE employee_no = ? AND is_current = 1) AND is_current = 1)`,
        params: [user.employeeNo],
      };
    case 'programme':
      return { clause: '1=1', params: [] }; // programme membership filtering is applied by the crm route itself
    case 'self':
    default:
      return { clause: `${column} = ?`, params: [user.employeeNo] };
  }
}

function maskPerson(person, grantedClasses) {
  const allowed = new Set(['employee_no']);
  for (const cls of grantedClasses) (FIELD_CLASS_MAP[cls] || []).forEach((f) => allowed.add(f));
  const out = {};
  for (const [k, v] of Object.entries(person)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

function scopeMeta(scope) {
  const crud = ['create', 'read', 'update', 'delete'].filter((a) => scope.actions[a]).map((a) => a[0].toUpperCase()).join('') || '-';
  return { module: scope.module, crud, data_scope: scope.dataScope, fields: scope.fieldClasses, as_of: new Date().toISOString() };
}

async function resolveAllScopes(user) {
  const out = {};
  for (const mod of MODULES) {
    const scope = await resolveScope(user, mod);
    out[mod] = { ...scope.actions, dataScope: scope.dataScope, fields: scope.fieldClasses };
  }
  return out;
}

module.exports = { MODULES, resolveScope, resolveAllScopes, requireScope, scopeFilterSql, maskPerson, scopeMeta, FIELD_CLASS_MAP };
