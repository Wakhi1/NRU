const { z } = require('zod');

// Single source of truth for the integration API's CRUD matrix — both the backend scope
// vocabulary (API_SCOPES, flattened from this) and the admin UI's matrix widget (fetched via
// GET /integration/keys/matrix-schema) are derived from this one list, so a cell can never drift
// out of sync between what the UI offers and what the server actually accepts. A cell is only
// `true` here if a real, working endpoint backs it — there is deliberately no create/update/delete
// for employees/org/leave/certifications/devices (HRIS stays the system of record for that data;
// an external system amends attendance by adding a new timesheet row, never by deleting history)
// and no delete anywhere on this API at all.
const INTEGRATION_CATEGORIES = [
  {
    key: 'employees', label: 'Employee details',
    crud: { create: false, read: true, update: false, delete: false },
    hint: 'Name, email, department, position, contract, status',
  },
  {
    key: 'timesheets', label: 'Timesheets',
    crud: { create: true, read: true, update: true, delete: false },
    hint: 'Read = clock in/out history. Create = clock an employee in (e.g. from a smartphone tracking app). Update = clock them out.',
  },
  {
    key: 'org', label: 'Org structure',
    crud: { create: false, read: true, update: false, delete: false },
    hint: 'Departments, cost centres, duty stations',
  },
  {
    key: 'leave', label: 'Leave',
    crud: { create: false, read: true, update: false, delete: false },
    hint: 'Leave windows and status — no reason text',
  },
  {
    key: 'payroll', label: 'Payroll',
    crud: { create: false, read: true, update: true, delete: false },
    hint: 'Read = run totals and gross/net per employee — never bank/tax details. Update = confirm a run has actually been disbursed (accounting systems only).',
  },
  {
    key: 'certifications', label: 'Certifications',
    crud: { create: false, read: true, update: false, delete: false },
    hint: 'Licence/certification names and expiry dates',
  },
  {
    key: 'devices', label: 'Device assignments',
    crud: { create: false, read: true, update: false, delete: false },
    hint: 'Extension/device assigned to each employee — no credentials',
  },
];

const API_SCOPES = INTEGRATION_CATEGORIES.flatMap((cat) =>
  Object.entries(cat.crud).filter(([, allowed]) => allowed).map(([action]) => `${cat.key}:${action}`)
);

const scopesSchema = z.array(z.enum(API_SCOPES)).min(1, 'Select at least one scope');

const apiKeyCreateSchema = z.object({
  name: z.string().min(2).max(100),
  scopes: scopesSchema,
  expires_at: z.string().optional().nullable(),
});

const apiKeyScopesUpdateSchema = z.object({
  scopes: scopesSchema,
});

module.exports = { INTEGRATION_CATEGORIES, API_SCOPES, apiKeyCreateSchema, apiKeyScopesUpdateSchema, scopesSchema };
