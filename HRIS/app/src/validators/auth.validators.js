const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const mfaVerifySchema = z.object({
  code: z.string().min(4).max(12),
  method: z.enum(['totp', 'email', 'backup']),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
});

module.exports = { loginSchema, mfaVerifySchema, changePasswordSchema };
