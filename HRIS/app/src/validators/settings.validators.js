const { z } = require('zod');

const notificationToggleSchema = z.object({
  is_enabled: z.boolean(),
});

const appSettingsSchema = z.object({
  settings: z.record(z.string(), z.string()),
});

module.exports = { notificationToggleSchema, appSettingsSchema };
