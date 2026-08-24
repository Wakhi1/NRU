const { z } = require('zod');

const partnerSchema = z.object({
  name: z.string().min(2).max(150),
  type: z.string().max(80).optional().nullable(),
  contact_name: z.string().max(150).optional().nullable(),
  contact_phone: z.string().max(40).optional().nullable(),
  agreement: z.string().max(150).optional().nullable(),
  status: z.enum(['active', 'renewal_due', 'inactive']).optional(),
  since_year: z.number().int().optional().nullable(),
});

const programmeSchema = z.object({
  name: z.string().min(2).max(150),
  lead_employee_no: z.string().max(20).optional().nullable(),
  status: z.string().max(40).optional(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
});

const indicatorSchema = z.object({
  indicator_name: z.string().min(2).max(150),
  period: z.string().min(2).max(20),
  value: z.number(),
  partner_org_id: z.number().int().optional().nullable(),
  source_feed: z.string().max(100).optional().nullable(),
});

module.exports = { partnerSchema, programmeSchema, indicatorSchema };
