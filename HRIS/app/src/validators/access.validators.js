const { z } = require('zod');

const permissionUpdateSchema = z.object({
  can_create: z.boolean(),
  can_read: z.boolean(),
  can_update: z.boolean(),
  can_delete: z.boolean(),
  data_scope: z.enum(['self', 'team', 'department', 'organisation', 'programme']),
});

const overrideSchema = z.object({
  employee_no: z.string().min(3).max(20),
  module: z.string().min(2).max(30),
  crud: z.string().max(10),
  reason: z.string().min(3).max(255),
  expires_at: z.string().optional().nullable(),
});

const roleSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(255).optional().nullable(),
});

const userCreateSchema = z.object({
  employee_no: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role_id: z.number().int(),
});

const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  role_id: z.number().int().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

const passwordResetSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// "Migrate to user accounts" bulk action on the People records page — each row just needs which
// person and which role; the temp password is generated server-side (see auth.js's
// generateTempPassword), not supplied by the client.
const bulkUserCreateSchema = z.object({
  accounts: z.array(z.object({
    employee_no: z.string().min(3).max(20),
    role_id: z.number().int(),
  })).min(1).max(200),
});

module.exports = { permissionUpdateSchema, overrideSchema, roleSchema, userCreateSchema, userUpdateSchema, passwordResetSchema, bulkUserCreateSchema };
