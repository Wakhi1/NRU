const { z } = require('zod');

const orgUnitSchema = z.object({
  kind: z.enum(['department', 'committee', 'board', 'group', 'project_team']),
  name: z.string().min(2).max(150),
  lead_employee_no: z.string().max(20).optional().nullable(),
  parent_id: z.number().int().optional().nullable(),
  cost_centre: z.string().max(30).optional().nullable(),
  duty_station: z.string().max(100).optional().nullable(),
  note: z.string().max(255).optional().nullable(),
});

const membershipSchema = z.object({
  employee_no: z.string().min(3).max(20),
  role_in_unit: z.string().max(100).optional().nullable(),
  from_date: z.string(),
});

module.exports = { orgUnitSchema, membershipSchema };
