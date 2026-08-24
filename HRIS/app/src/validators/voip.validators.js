const { z } = require('zod');

const callSchema = z.object({
  callee_employee_no: z.string().max(20).optional().nullable(),
  callee_number: z.string().max(40).optional().nullable(),
});

// Full provisioning payload — admin-only (allocate/reassign/release, SIP + routing config).
const extensionProvisionSchema = z.object({
  employee_no: z.string().min(3).max(20),
  extension: z.string().min(2).max(20),
  status: z.enum(['active', 'inactive', 'forwarded']).optional(),
  sip_username: z.string().max(60).optional().nullable(),
  sip_domain: z.string().max(120).optional().nullable(),
  voicemail_pin: z.string().max(10).optional().nullable(),
  device_assigned: z.string().max(120).optional().nullable(),
  department_org_unit_id: z.number().int().optional().nullable(),
  emergency_number: z.string().max(40).optional().nullable(),
  forward_on_busy_to: z.string().max(20).optional().nullable(),
  out_of_office_enabled: z.boolean().optional(),
  out_of_office_target: z.string().max(20).optional().nullable(),
  hunt_group: z.string().max(60).optional().nullable(),
});

// Self-service payload — an owner may only touch their own call-handling preferences,
// never the provisioning fields (extension number, SIP credentials, device, department, hunt group).
const extensionSelfSchema = z.object({
  status: z.enum(['active', 'inactive', 'forwarded']).optional(),
  forward_on_busy_to: z.string().max(20).optional().nullable(),
  out_of_office_enabled: z.boolean().optional(),
  out_of_office_target: z.string().max(20).optional().nullable(),
});

module.exports = { callSchema, extensionProvisionSchema, extensionSelfSchema };
