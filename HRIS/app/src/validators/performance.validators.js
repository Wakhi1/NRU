const { z } = require('zod');

const cycleSchema = z.object({
  name: z.string().min(2).max(100),
  period: z.string().min(2).max(20),
  status: z.enum(['open', 'closed']).optional(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
});

const reviewCreateSchema = z.object({
  cycle_id: z.number().int(),
  employee_no: z.string().min(3).max(20),
  reviewer_employee_no: z.string().max(20).optional().nullable(),
});

const selfRatingSchema = z.object({
  self_rating: z.number().min(0).max(5),
});

const managerRatingSchema = z.object({
  manager_rating: z.number().min(0).max(5),
  comments: z.string().max(1000).optional().nullable(),
  status: z.enum(['manager_submitted', 'completed']),
});

module.exports = { cycleSchema, reviewCreateSchema, selfRatingSchema, managerRatingSchema };
