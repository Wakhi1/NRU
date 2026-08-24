const { z } = require('zod');

const totpConfirmSchema = z.object({
  code: z.string().min(6).max(6),
});

const emailOtpConfirmSchema = z.object({
  code: z.string().min(6).max(6),
});

const passwordConfirmSchema = z.object({
  password: z.string().min(1),
});

module.exports = { totpConfirmSchema, emailOtpConfirmSchema, passwordConfirmSchema };
