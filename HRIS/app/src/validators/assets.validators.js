const { z } = require('zod');

const CATEGORIES = ['property', 'vehicle', 'financial_interest', 'gift', 'outside_employment', 'other'];

const declarationSchema = z.object({
  employee_no: z.string().min(3).max(20).optional().nullable(),
  category: z.enum(CATEGORIES),
  description: z.string().min(3).max(500),
  estimated_value: z.number().nonnegative().optional().nullable(),
  currency: z.string().max(10).optional(),
  acquired_at: z.string().optional().nullable(),
  declared_at: z.string(),
});

const reviewSchema = z.object({
  status: z.enum(['reviewed', 'flagged']),
  review_note: z.string().max(500).optional().nullable(),
});

module.exports = { CATEGORIES, declarationSchema, reviewSchema };
