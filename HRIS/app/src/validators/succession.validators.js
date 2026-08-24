const { z } = require('zod');

const planSchema = z.object({
  position_title: z.string().min(2).max(150),
  org_unit_id: z.number().int().optional().nullable(),
  incumbent_employee_no: z.string().max(20).optional().nullable(),
  risk: z.enum(['low', 'medium', 'high']),
  note: z.string().max(255).optional().nullable(),
});

const successorSchema = z.object({
  employee_no: z.string().min(3).max(20),
  readiness: z.enum(['ready_now', 'ready_1_2yr', 'ready_3_5yr']),
});

module.exports = { planSchema, successorSchema };
