-- SPTS — Smart Phone Tracking & Data Collection Monitoring
-- Standalone database. This system never owns employee identity — see src/platform/hris.js and
-- docs/INTEGRATION.md on the HRIS side. `employee_cache` is a read-only projection refreshed from
-- the HRIS integration API (nightly + on-demand "Sync now"), not a second system of record.

-- Widened to match the HRIS integration API's expanded /employees field set (photo, phone,
-- gender, grade, duty station, line manager) — see src/platform/hris.js and src/platform/reconcile.js.
-- `photo_path` is a LOCAL cached copy (public/img/people/<employee_no>.<ext>), downloaded
-- server-to-server through the HRIS's bearer-token photo endpoint at reconcile time, since the
-- HRIS's own photo URL requires the SAME API key SPTS holds — a browser <img> tag pointed straight
-- at the HRIS can't authenticate, so SPTS mirrors the bytes locally instead of hot-linking them.
-- `role_name` is copied VERBATIM from the HRIS's own `role.name` (via the integration API's
-- /employees.role_name field) — never derived, guessed from a job title, or stored anywhere else.
-- This is the explicit "role assignment data is already in HRIS... all this data should come with
-- integrations" decision: there is no SPTS-specific role table, no elevation, no per-employee role
-- override. An employee's SPTS permissions are a pure function of this one synced string (see
-- platform/scope.js) — NULL if they have no HRIS login at all (which also means they cannot sign
-- in to SPTS in the first place; see routes/auth.routes.js).
--
-- What SPTS DOES own is *work* assignment — which geofence zone a person is checked in against,
-- for which kind of work (see `zone_assignment` below) — a deliberately separate concept from
-- role/permission. "Assigned to Manzini CBD for field enumeration" is a location+task fact, not a
-- system-access grant, and mixing the two was the mistake an earlier version of this schema made
-- (a `field_collector` "role" that was really just "has a field zone assignment").
CREATE TABLE IF NOT EXISTS employee_cache (
  employee_no       VARCHAR(20) PRIMARY KEY,
  full_legal_name   VARCHAR(150) NOT NULL,
  preferred_name    VARCHAR(80),
  email             VARCHAR(150),
  phone             VARCHAR(40),
  gender            VARCHAR(20),
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
  position_title    VARCHAR(150),
  department        VARCHAR(150),
  contract_type     VARCHAR(30),
  grade             VARCHAR(10),
  duty_station      VARCHAR(100),
  reports_to_employee_no VARCHAR(20) NULL,
  role_name         VARCHAR(60) NULL,
  start_date        DATE NULL,
  photo_path        VARCHAR(255) NULL,
  hris_updated_at   DATETIME NULL,
  synced_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- NOTE: there is deliberately no local `credential`/`mfa_backup_code` table, no `role_assignment`
-- table, and no `elevation` table. Sign-in, lockout, MFA, AND role are all fully delegated to /
-- sourced from the HRIS's integration API — see platform/hris.js and platform/scope.js. An
-- employee with no HRIS login cannot sign in to SPTS at all, and there is no local way to grant
-- someone a role SPTS invented on its own — both intended consequences of one shared identity
-- across the ecosystem, not gaps to fill in with a local fallback.

-- Permission matrix, made persistent and admin-editable — `role_key` here is one of the HRIS's OWN
-- role names (e.g. "System administrator", "Head of Department"), never an SPTS-invented one.
-- Presence of a row is the grant; scope.js loads this into its in-memory ROLES[key].permissions at
-- boot and after every edit, so every existing hasPermission()/requirePermission() call site keeps
-- working unchanged, synchronous, with no per-request DB round-trip.
CREATE TABLE IF NOT EXISTS role_permission (
  role_key       VARCHAR(60) NOT NULL,
  permission_key VARCHAR(60) NOT NULL,
  PRIMARY KEY (role_key, permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Read-only mirror of the HRIS's org-unit hierarchy (architecture doc ownership table:
-- "Organisational unit membership" is HRIS-owned) — refreshed every reconciliation alongside
-- employee_cache. SPTS never creates/edits/deletes a department here; it only displays what HRIS
-- already has, same "system never owns employee/org identity" boundary as employee_cache itself.
CREATE TABLE IF NOT EXISTS org_unit_cache (
  id                INT PRIMARY KEY,
  kind              VARCHAR(30),
  name              VARCHAR(150) NOT NULL,
  parent_id         INT NULL,
  cost_centre       VARCHAR(30),
  duty_station      VARCHAR(100),
  lead_employee_no  VARCHAR(20) NULL,
  current_headcount INT NOT NULL DEFAULT 0,
  synced_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Handset registry (architecture doc §4.2 Device & Fleet) — distinct from the HRIS's own
-- `devices:read` (VoIP extension info); this is the tracked physical handset.
CREATE TABLE IF NOT EXISTS device (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  asset_tag          VARCHAR(30) NOT NULL UNIQUE,
  imei               VARCHAR(20) UNIQUE,
  serial             VARCHAR(60),
  hw_model           VARCHAR(80),
  os_version         VARCHAR(40),
  kind               ENUM('field','office','vehicle') NOT NULL DEFAULT 'field',
  status             ENUM('online','idle','offline') NOT NULL DEFAULT 'offline',
  battery_pct        INT NULL,
  signal_bars        INT NULL,
  assigned_employee_no VARCHAR(20) NULL,
  last_seen_at       DATETIME NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_device_employee FOREIGN KEY (assigned_employee_no) REFERENCES employee_cache(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Geofence zones (architecture doc §6) — circle geometry (center + radius) is sufficient without
-- PostGIS at this scale; ST_DWithin-equivalent is a haversine distance check in src/platform/geofence.js.
CREATE TABLE IF NOT EXISTS zone (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(20) NOT NULL UNIQUE,
  name           VARCHAR(120) NOT NULL,
  kind           ENUM('field','office','depot') NOT NULL DEFAULT 'field',
  center_lat     DECIMAL(10,7) NOT NULL,
  center_lng     DECIMAL(10,7) NOT NULL,
  radius_m       INT NOT NULL DEFAULT 150,
  rule_type      ENUM('exit_alert','dwell_alert','entry_log','checkin_required') NOT NULL DEFAULT 'checkin_required',
  dwell_minutes  INT NULL,
  team_label     VARCHAR(120),
  active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- THE job/location assignment: which zone (and/or which device) a person is bound to for the
-- check-in gate — "assigned to a certain location for certain work," an SPTS-owned operational
-- fact, deliberately separate from role/permission (which comes from the HRIS, see employee_cache
-- above). Any employee can hold one of these regardless of their HRIS role.
CREATE TABLE IF NOT EXISTS zone_assignment (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  zone_id       INT NOT NULL,
  employee_no   VARCHAR(20) NULL,
  device_id     INT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_zoneassign_zone FOREIGN KEY (zone_id) REFERENCES zone(id) ON DELETE CASCADE,
  CONSTRAINT fk_zoneassign_employee FOREIGN KEY (employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_zoneassign_device FOREIGN KEY (device_id) REFERENCES device(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The enforced check-in gate (architecture doc §5). One row per shift attempt/session. On
-- confirmation this also calls the HRIS's own timesheet clock-in (src/platform/hris.js) so the
-- HRIS stays the system of record for hours worked; `hris_timer_id` links back to that record.
CREATE TABLE IF NOT EXISTS check_in (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  employee_no            VARCHAR(20) NOT NULL,
  device_id              INT NULL,
  zone_id                INT NULL,
  lat                    DECIMAL(10,7) NOT NULL,
  lng                    DECIMAL(10,7) NOT NULL,
  accuracy_m             INT NULL,
  distance_m             INT NULL,
  decision               ENUM('confirmed','outside','stale','blocked') NOT NULL,
  status                 ENUM('open','closed') NOT NULL DEFAULT 'open',
  hris_timer_id          INT NULL,
  override_by_employee_no VARCHAR(20) NULL,
  override_reason        VARCHAR(255) NULL,
  -- Photographic proof (architecture doc §7) taken in-app at the moment of check-in — the
  -- selfie IS the login, same as the GPS fix. `reconfirmed_at` backs the recheck-interval gate
  -- (policy.recheck_hours, doc §5): the most recent time this shift's position was re-verified,
  -- starting as the check-in moment itself and advanced by POST /checkin/:id/reconfirm.
  photo_path             VARCHAR(255) NULL,
  photo_taken_at         DATETIME NULL,
  reconfirmed_at         DATETIME NULL,
  shift_started_at       DATETIME NOT NULL,
  shift_ended_at         DATETIME NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_checkin_employee FOREIGN KEY (employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_checkin_device FOREIGN KEY (device_id) REFERENCES device(id) ON DELETE SET NULL,
  CONSTRAINT fk_checkin_zone FOREIGN KEY (zone_id) REFERENCES zone(id) ON DELETE SET NULL,
  CONSTRAINT fk_checkin_override_by FOREIGN KEY (override_by_employee_no) REFERENCES employee_cache(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Idempotent for databases migrated before these columns existed — migrate.js swallows the
-- "duplicate column" error (1060) the same way it already swallows "duplicate key" (1061).
ALTER TABLE check_in ADD COLUMN photo_path VARCHAR(255) NULL;
ALTER TABLE check_in ADD COLUMN photo_taken_at DATETIME NULL;
ALTER TABLE check_in ADD COLUMN reconfirmed_at DATETIME NULL;

-- A check-in that failed the gate and is waiting on a supervisor override (architecture doc §5.6).
CREATE TABLE IF NOT EXISTS override_request (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  check_in_id           INT NOT NULL,
  employee_no           VARCHAR(20) NOT NULL,
  reason                VARCHAR(255),
  status                ENUM('pending','granted','denied') NOT NULL DEFAULT 'pending',
  decided_by_employee_no VARCHAR(20) NULL,
  decided_at            DATETIME NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_override_checkin FOREIGN KEY (check_in_id) REFERENCES check_in(id) ON DELETE CASCADE,
  CONSTRAINT fk_override_employee FOREIGN KEY (employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_override_decider FOREIGN KEY (decided_by_employee_no) REFERENCES employee_cache(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Location fixes for the duration of an open shift — the polyline/point track rendered on the
-- Leaflet history map. Partition-by-day is future work; fine unpartitioned at demo scale.
CREATE TABLE IF NOT EXISTS location_fix (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  check_in_id  INT NOT NULL,
  employee_no  VARCHAR(20) NOT NULL,
  lat          DECIMAL(10,7) NOT NULL,
  lng          DECIMAL(10,7) NOT NULL,
  accuracy_m   INT NULL,
  captured_at  DATETIME NOT NULL,
  CONSTRAINT fk_fix_checkin FOREIGN KEY (check_in_id) REFERENCES check_in(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_fix_checkin_time ON location_fix(check_in_id, captured_at);

-- Zone entry/exit/dwell transitions (architecture doc §6 — stored as events, not recomputed).
CREATE TABLE IF NOT EXISTS geofence_event (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  zone_id      INT NOT NULL,
  employee_no  VARCHAR(20) NOT NULL,
  device_id    INT NULL,
  event        ENUM('entered','exited','dwell_exceeded') NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gfevent_zone FOREIGN KEY (zone_id) REFERENCES zone(id) ON DELETE CASCADE,
  CONSTRAINT fk_gfevent_employee FOREIGN KEY (employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alert (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  severity     ENUM('low','med','high') NOT NULL DEFAULT 'low',
  employee_no  VARCHAR(20) NULL,
  device_id    INT NULL,
  zone_id      INT NULL,
  kind         VARCHAR(120) NOT NULL,
  note         VARCHAR(255),
  resolved     TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_alert_employee FOREIGN KEY (employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_alert_device FOREIGN KEY (device_id) REFERENCES device(id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_zone FOREIGN KEY (zone_id) REFERENCES zone(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Check-in/geofence policy (architecture doc §5 — "policy values are configuration, not code").
-- Singleton row, id always 1. shift_start/shift_end are the "rule setting to control flow and
-- movement of enumerators" — architecture doc §10: "Tracking is bounded by shift hours. Outside
-- them the foreground service stops and no fixes are recorded." A check-in attempt outside this
-- window is refused with `decision: 'blocked'` (see checkin.routes.js) before geofence math even
-- runs — shift hours are a hard gate, zones are the spatial gate.
CREATE TABLE IF NOT EXISTS policy (
  id                 INT PRIMARY KEY DEFAULT 1,
  default_radius_m   INT NOT NULL DEFAULT 150,
  accuracy_ceiling_m INT NOT NULL DEFAULT 50,
  recheck_hours      INT NOT NULL DEFAULT 4,
  offline_behavior   VARCHAR(120) NOT NULL DEFAULT 'Allow — confirm at next sync',
  shift_start_time   TIME NULL,
  shift_end_time     TIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Org branding — same shape as the HRIS's own app_setting/branding pattern, standalone here since
-- SPTS keeps its own database. Singleton settings keyed by name, not a fixed-column row, so a
-- future setting doesn't need a migration.
CREATE TABLE IF NOT EXISTS app_setting (
  setting_key   VARCHAR(60) PRIMARY KEY,
  setting_value VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every privileged action (architecture doc §10 — override granted, policy changed, zone deleted).
CREATE TABLE IF NOT EXISTS audit_event (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  actor_employee_no VARCHAR(20) NULL,
  action        VARCHAR(40) NOT NULL,
  entity_type   VARCHAR(40) NOT NULL,
  entity_id     VARCHAR(40),
  before_json   TEXT NULL,
  after_json    TEXT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_audit_created ON audit_event(created_at);

-- Voice over IP (architecture doc §8) — "voice is carried on the same data bundle as the forms,
-- no separate airtime line." One extension per person, auto-provisioned the first time they open
-- the app (see routes/voip.routes.js); de-provisioning follows employee_cache the same way every
-- other per-person row here does (ON DELETE CASCADE — an exited employee's extension goes with
-- them at the next reconciliation). Presence is derived from `last_seen_at`, a heartbeat every
-- app page posts every ~20s (doc: "presence comes from device state already known to the tracking
-- system") — there is no separate "set my status" control anywhere.
CREATE TABLE IF NOT EXISTS voip_extension (
  employee_no   VARCHAR(20) PRIMARY KEY,
  extension     VARCHAR(10) NOT NULL UNIQUE,
  last_seen_at  DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_voipext_employee FOREIGN KEY (employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per call attempt. `direction` is always 'on_net' for now — handset-to-handset over the
-- data bundle, the whole point of §8. Off-net (public number) breakout needs a SIP trunk provider,
-- which is a real-world procurement decision, not something this build can wire up on its own; the
-- column is here so that work slots in later without a schema change.
CREATE TABLE IF NOT EXISTS call_detail_record (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  caller_employee_no    VARCHAR(20) NOT NULL,
  callee_employee_no    VARCHAR(20) NOT NULL,
  direction             ENUM('on_net','off_net') NOT NULL DEFAULT 'on_net',
  status                ENUM('ringing','answered','missed','declined','ended') NOT NULL DEFAULT 'ringing',
  started_at            DATETIME NOT NULL,
  answered_at           DATETIME NULL,
  ended_at              DATETIME NULL,
  duration_s            INT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cdr_caller FOREIGN KEY (caller_employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_cdr_callee FOREIGN KEY (callee_employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_cdr_caller ON call_detail_record(caller_employee_no, created_at);
CREATE INDEX idx_cdr_callee ON call_detail_record(callee_employee_no, created_at);

-- WebRTC signaling mailbox — SDP offer/answer and ICE candidates exchanged by short-poll (same
-- polling pattern myshift.js already uses for override requests), not a websocket server. Once
-- both sides have exchanged an offer/answer and enough candidates, audio flows peer-to-peer over
-- the data connection directly; this table only carries the handshake, never the voice itself.
CREATE TABLE IF NOT EXISTS voip_signal (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  call_id           INT NOT NULL,
  from_employee_no  VARCHAR(20) NOT NULL,
  to_employee_no    VARCHAR(20) NOT NULL,
  kind              ENUM('offer','answer','ice','hangup') NOT NULL,
  payload           TEXT NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_signal_call FOREIGN KEY (call_id) REFERENCES call_detail_record(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_signal_poll ON voip_signal(call_id, to_employee_no, id);
