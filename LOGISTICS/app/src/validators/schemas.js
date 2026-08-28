const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const mfaVerifySchema = z.object({
  code: z.string().min(4).max(12),
  method: z.enum(['totp', 'email', 'backup']),
});

const vehicleSchema = z.object({
  reg_no: z.string().min(2).max(20),
  model: z.string().min(2).max(120),
  vehicle_type: z.enum(['pickup', '4x4', 'truck', 'bus', 'van', 'sedan', 'other']),
  category: z.enum(['work', 'executive']).optional(),
  department: z.string().max(150).nullable().optional(),
  assigned_driver_employee_no: z.string().max(20).nullable().optional(),
  status: z.enum(['Available', 'On trip', 'Workshop', 'Grounded']).optional(),
  odometer_km: z.coerce.number().int().min(0).optional(),
  fuel_pct: z.coerce.number().int().min(0).max(100).optional(),
  efficiency_l100km: z.coerce.number().min(0).nullable().optional(),
  target_l100km: z.coerce.number().min(0).nullable().optional(),
  tank_capacity_l: z.coerce.number().int().min(1).optional(),
  next_service_note: z.string().max(120).nullable().optional(),
  next_service_date: z.string().nullable().optional(),
});

const tripRequestSchema = z.object({
  origin: z.string().min(1).max(150),
  destination: z.string().min(1).max(150),
  vehicle_id: z.coerce.number().int().nullable().optional(),
  driver_employee_no: z.string().max(20).nullable().optional(),
  distance_km: z.coerce.number().min(0),
  purpose: z.string().max(255).nullable().optional(),
});

const tripDecisionSchema = z.object({
  action: z.enum(['authorise', 'reject', 'close']),
  cost: z.coerce.number().min(0).nullable().optional(),
});

const fuelTransactionSchema = z.object({
  vehicle_id: z.coerce.number().int(),
  driver_employee_no: z.string().max(20).nullable().optional(),
  station: z.string().min(1).max(120),
  litres: z.coerce.number().positive(),
  rate: z.coerce.number().positive(),
  odometer_km: z.coerce.number().int().min(0),
});

const fuelDecisionSchema = z.object({
  action: z.enum(['verify', 'reject']),
});

const workOrderSchema = z.object({
  vehicle_id: z.coerce.number().int(),
  title: z.string().min(2).max(200),
  priority: z.enum(['Routine', 'High', 'Critical']),
  cost: z.coerce.number().min(0),
  workshop_name: z.string().max(150).nullable().optional(),
  due_note: z.string().max(60).nullable().optional(),
  due_date: z.string().nullable().optional(),
});

const driverProfileSchema = z.object({
  licence_no: z.string().max(30).nullable().optional(),
  licence_expiry: z.string().nullable().optional(),
  safety_score: z.coerce.number().int().min(0).max(100).optional(),
  note: z.string().max(255).nullable().optional(),
});

// role_key is one of the HRIS's own role names ("System administrator", "Head of Department", …)
// — validated against the live ROLES object at the route level (platform/scope.js), not a fixed
// enum here, since the set of real HRIS roles can grow without an FLMS code change.
const permissionToggleSchema = z.object({
  role_key: z.string().min(1).max(60),
  permission_key: z.string().min(1).max(60),
  granted: z.coerce.boolean(),
});

const fuelPolicySchema = z.object({
  block_offhours: z.coerce.boolean(),
  require_odo_photo: z.coerce.boolean(),
  geofence_stations: z.coerce.boolean(),
  autoflag_overfill: z.coerce.boolean(),
  push_to_accounting: z.coerce.boolean(),
  variance_threshold_pct: z.coerce.number().int().min(0).max(100),
  idle_threshold_min: z.coerce.number().int().min(0).max(1440),
  price_ceiling: z.coerce.number().min(0),
});

// VoIP (ported from SPTS's own §8 implementation) — `payload` is an opaque SDP blob or ICE
// candidate, never validated server-side beyond "it parses as JSON" (handled by express.json()
// before this ever runs).
const voipCallSchema = z.object({
  to_employee_no: z.string().min(1).max(20),
});

const voipSignalSchema = z.object({
  kind: z.enum(['offer', 'answer', 'ice', 'hangup']),
  payload: z.any(),
});

module.exports = {
  loginSchema, mfaVerifySchema, vehicleSchema, tripRequestSchema, tripDecisionSchema,
  fuelTransactionSchema, fuelDecisionSchema,
  workOrderSchema, driverProfileSchema, permissionToggleSchema, fuelPolicySchema,
  voipCallSchema, voipSignalSchema,
};
