const { z } = require('zod');

const personSchema = z.object({
  employee_no: z.string().min(3).max(20).optional(),
  full_legal_name: z.string().min(2).max(150),
  preferred_name: z.string().max(80).optional().nullable(),
  national_id: z.string().max(60).optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().max(20).optional().nullable(),
  nationality: z.string().max(60).optional().nullable(),
  marital_status: z.string().max(30).optional().nullable(),
  languages: z.string().max(150).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  next_of_kin_name: z.string().max(150).optional().nullable(),
  next_of_kin_relationship: z.string().max(60).optional().nullable(),
  next_of_kin_phone: z.string().max(40).optional().nullable(),
  status: z.enum(['active', 'on_leave', 'suspended', 'exited']).optional(),
});

const employmentSchema = z.object({
  position_title: z.string().min(2).max(150),
  department_org_unit_id: z.number().int().nullable().optional(),
  duty_station: z.string().max(100).optional().nullable(),
  grade: z.string().max(10).optional().nullable(),
  contract_type: z.enum(['permanent', 'fixed_term', 'consultant', 'intern']),
  start_date: z.string(),
  reports_to_employee_no: z.string().max(20).optional().nullable(),
  cost_centre: z.string().max(30).optional().nullable(),
  basic_salary: z.number().nonnegative().optional().nullable(),
});

module.exports = { personSchema, employmentSchema };
