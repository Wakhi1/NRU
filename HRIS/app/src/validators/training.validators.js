const { z } = require('zod');

const courseSchema = z.object({
  name: z.string().min(2).max(150),
  provider: z.string().max(150).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  is_certification: z.boolean().default(false),
  validity_months: z.number().int().optional().nullable(),
});

const enrollmentSchema = z.object({
  employee_no: z.string().max(20).optional().nullable(),
  course_id: z.number().int(),
});

const enrollmentStatusSchema = z.object({
  status: z.enum(['enrolled', 'in_progress', 'completed', 'failed']),
  completed_at: z.string().optional().nullable(),
});

const certificationSchema = z.object({
  employee_no: z.string().max(20).optional().nullable(),
  name: z.string().min(2).max(150),
  issued_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  issuing_body: z.string().max(150).optional().nullable(),
});

module.exports = { courseSchema, enrollmentSchema, enrollmentStatusSchema, certificationSchema };
