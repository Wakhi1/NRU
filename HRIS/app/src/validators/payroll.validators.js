const { z } = require('zod');

const paylineItemSchema = z.object({
  kind: z.enum(['allowance', 'deduction']),
  label: z.string().min(1).max(100),
  amount: z.number().nonnegative(),
});

const paylineUpdateSchema = z.object({
  basic: z.number().optional(),
  allowances: z.number().optional(),
  overtime: z.number().optional(),
  deductions: z.number().optional(),
  bank_account: z.string().max(60).optional().nullable(),
  tax_number: z.string().max(60).optional().nullable(),
  // Optional itemized breakdown — when present, replaces this payline's payline_item rows and
  // its allowances/deductions totals are recomputed as the sum of the matching-kind items
  // (overriding any allowances/deductions also sent in the same request). See payroll.routes.js.
  items: z.array(paylineItemSchema).optional(),
});

const payrollRunCreateSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM'),
});

// Bulk pay adjustment applied across many paylines in one run at once (a percentage increment,
// a COLA, or a bonus) rather than hand-editing each employee's payline. `mode` only matters for
// 'cola' (increment_percent is always a percentage of basic; bonus is always a flat amount) and
// `label`/`department_org_unit_id`/`employee_nos` are conditionally required — refined below
// rather than accepted loosely, so a malformed combination 400s instead of doing something
// silently wrong (e.g. a 'cola' with no label, or a 'department' target with no department id).
const bulkAdjustSchema = z.object({
  type: z.enum(['increment_percent', 'cola', 'bonus']),
  value: z.number(),
  mode: z.enum(['percent', 'flat']).optional(),
  label: z.string().min(1).max(100).optional(),
  target: z.enum(['all', 'department', 'selected']),
  department_org_unit_id: z.number().optional(),
  employee_nos: z.array(z.string()).optional(),
}).superRefine((d, ctx) => {
  if (d.type === 'cola') {
    if (!d.mode) ctx.addIssue({ code: 'custom', path: ['mode'], message: 'mode is required for a COLA adjustment' });
    if (!d.label) ctx.addIssue({ code: 'custom', path: ['label'], message: 'label is required for a COLA adjustment' });
  }
  if (d.type === 'bonus' && !d.label) {
    ctx.addIssue({ code: 'custom', path: ['label'], message: 'label is required for a bonus' });
  }
  if (d.type === 'increment_percent' && d.value <= -100) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percentage would reduce basic pay to zero or below' });
  }
  if (d.target === 'department' && !d.department_org_unit_id) {
    ctx.addIssue({ code: 'custom', path: ['department_org_unit_id'], message: 'department_org_unit_id is required for the "department" target' });
  }
  if (d.target === 'selected' && (!d.employee_nos || !d.employee_nos.length)) {
    ctx.addIssue({ code: 'custom', path: ['employee_nos'], message: 'employee_nos is required for the "selected" target' });
  }
});

module.exports = { paylineUpdateSchema, payrollRunCreateSchema, bulkAdjustSchema };
