const { z } = require('zod');

const requisitionSchema = z.object({
  title: z.string().min(2).max(150),
  department_org_unit_id: z.number().int().optional().nullable(),
  grade: z.string().max(10).optional().nullable(),
  headcount: z.number().int().min(1).default(1),
  status: z.enum(['open', 'on_hold', 'closed']).optional(),
});

const candidateSchema = z.object({
  full_name: z.string().min(2).max(150),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
});

const stageSchema = z.object({
  stage: z.enum(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']),
});

const interviewSchema = z.object({
  interviewer_employee_no: z.string().max(20).optional().nullable(),
  scheduled_at: z.string(),
  notes: z.string().max(500).optional().nullable(),
});

module.exports = { requisitionSchema, candidateSchema, stageSchema, interviewSchema };
