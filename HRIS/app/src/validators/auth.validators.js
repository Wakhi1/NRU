const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const mfaVerifySchema = z.object({
  code: z.string().min(4).max(12),
  method: z.enum(['totp', 'email', 'backup']),
});

module.exports = { loginSchema, mfaVerifySchema };
