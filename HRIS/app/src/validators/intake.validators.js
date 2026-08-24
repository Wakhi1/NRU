const { z } = require('zod');

const feedSchema = z.object({
  source_name: z.string().min(2).max(150),
  transport: z.enum(['api_pull', 'sftp', 'csv_upload', 'webhook_push']),
  cadence: z.string().max(60).optional().nullable(),
  owner_employee_no: z.string().max(20).optional().nullable(),
  status: z.enum(['healthy', 'degraded', 'failed']).optional(),
  field_map: z.record(z.string(), z.string()).optional().nullable(),
});

const resolveSchema = z.object({
  status: z.enum(['published', 'quarantined']),
  reason: z.string().max(255).optional().nullable(),
});

module.exports = { feedSchema, resolveSchema };
