const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const mfaVerifySchema = z.object({
  code: z.string().min(4).max(12),
  method: z.enum(['totp', 'email', 'backup']),
});

const zoneSchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(2).max(120),
  kind: z.enum(['field', 'office', 'depot']),
  center_lat: z.coerce.number().min(-90).max(90),
  center_lng: z.coerce.number().min(-180).max(180),
  radius_m: z.coerce.number().int().min(10).max(50000),
  rule_type: z.enum(['exit_alert', 'dwell_alert', 'entry_log', 'checkin_required']),
  dwell_minutes: z.coerce.number().int().min(1).max(1440).nullable().optional(),
  team_label: z.string().max(120).nullable().optional(),
  active: z.coerce.boolean().optional(),
});

const zoneAssignSchema = z.object({
  employee_no: z.string().min(1).nullable().optional(),
  device_id: z.coerce.number().int().nullable().optional(),
});

const deviceSchema = z.object({
  asset_tag: z.string().min(2).max(30),
  imei: z.string().max(20).nullable().optional(),
  serial: z.string().max(60).nullable().optional(),
  hw_model: z.string().max(80).nullable().optional(),
  os_version: z.string().max(40).nullable().optional(),
  kind: z.enum(['field', 'office', 'vehicle']),
  assigned_employee_no: z.string().max(20).nullable().optional(),
});

const checkinSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  accuracy_m: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  device_id: z.coerce.number().int().nullable().optional(),
});

const fixSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  accuracy_m: z.coerce.number().int().min(0).max(100000).nullable().optional(),
});

const overrideDecisionSchema = z.object({
  decision: z.enum(['granted', 'denied']),
});

// role_key is one of the HRIS's own role names ("System administrator", "Head of Department", …)
// — validated against the live ROLES object at the route level (platform/scope.js), not a fixed
// enum here, since the set of real HRIS roles can grow without an SPTS code change.
const permissionToggleSchema = z.object({
  role_key: z.string().min(1).max(60),
  permission_key: z.string().min(1).max(60),
  granted: z.coerce.boolean(),
});

// shift_start/end_time are the "rule setting to control flow and movement of enumerators" —
// architecture doc §10: tracking/check-in is bounded to shift hours. Either both are set (a
// window) or both null (no time-of-day restriction, only geofencing applies).
const policySchema = z.object({
  default_radius_m: z.coerce.number().int().min(10).max(50000),
  accuracy_ceiling_m: z.coerce.number().int().min(1).max(100000),
  recheck_hours: z.coerce.number().int().min(1).max(48),
  offline_behavior: z.string().max(120),
  shift_start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  shift_end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

// VoIP (architecture doc §8) — `payload` is an opaque SDP blob or ICE candidate, never validated
// server-side beyond "it parses as JSON" (handled by express.json() before this ever runs).
const voipCallSchema = z.object({
  to_employee_no: z.string().min(1).max(20),
});

const voipSignalSchema = z.object({
  kind: z.enum(['offer', 'answer', 'ice', 'hangup']),
  payload: z.any(),
});

module.exports = {
  loginSchema, zoneSchema, zoneAssignSchema, deviceSchema, checkinSchema, fixSchema,
  overrideDecisionSchema, policySchema, permissionToggleSchema,
  mfaVerifySchema, voipCallSchema, voipSignalSchema,
};
