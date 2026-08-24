const { z } = require('zod');

const enrollmentSchema = z.object({
  benefit_plan_id: z.number().int(),
  employee_no: z.string().max(20).optional().nullable(),
});

const planSchema = z.object({
  name: z.string().min(2).max(100),
  kind: z.string().max(60).optional().nullable(),
  cost_per_person: z.number().nonnegative().optional(),
  note: z.string().max(255).optional().nullable(),
});

module.exports = { enrollmentSchema, planSchema };
