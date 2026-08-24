const { z } = require('zod');

const leaveRequestSchema = z.object({
  employee_no: z.string().max(20).optional().nullable(),
  leave_type_id: z.number().int(),
  start_date: z.string(),
  end_date: z.string(),
  days: z.number().positive(),
  reason: z.string().max(255).optional().nullable(),
});

const decideSchema = z.object({
  status: z.enum(['approved', 'declined']),
});

const leaveTypeSchema = z.object({
  name: z.string().min(2).max(60),
  annual_entitlement_days: z.number().nonnegative().optional(),
  paid: z.boolean().optional(),
});

module.exports = { leaveRequestSchema, decideSchema, leaveTypeSchema };
