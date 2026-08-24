const { z } = require('zod');

const shiftPatternSchema = z.object({
  name: z.string().min(2).max(100),
  pattern: z.string().min(2).max(150),
  contracted_hours: z.number().positive().max(80),
  break_rule: z.string().max(100).optional().nullable(),
  grace_minutes: z.number().int().min(0).max(120),
  overtime_rule: z.string().max(150).optional().nullable(),
  rounding_rule: z.string().max(100).optional().nullable(),
  auto_clock_out: z.boolean().optional(),
  capture_source: z.enum(['terminal', 'mobile_gps', 'web', 'vehicle_log']),
});

module.exports = { shiftPatternSchema };
