-- FLMS — Fleet & Logistics Management System
-- Standalone database. This system never owns employee identity — see src/platform/hris.js and
-- docs/INTEGRATION.md on the HRIS side. `employee_cache` is a read-only projection refreshed from
-- the HRIS integration API (nightly + on-demand "Sync now"), not a second system of record. This
-- table's shape and the reasoning behind every column is identical to SPTS's own employee_cache —
-- both systems are independent consumers of the same HRIS integration API.
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

-- NOTE: there is deliberately no local `credential` table and no `role_assignment` table. Sign-in,
-- lockout, MFA, AND role are all fully delegated to / sourced from the HRIS's integration API — see
-- platform/hris.js and platform/scope.js. An employee with no HRIS login cannot sign in to FLMS at
-- all, and there is no local way to grant someone a role FLMS invented on its own.

-- Permission matrix, made persistent and admin-editable — `role_key` here is one of the HRIS's OWN
-- role names, never an FLMS-invented one. Presence of a row is the grant; scope.js loads this into
-- its in-memory ROLES[key].permissions at boot and after every edit.
CREATE TABLE IF NOT EXISTS role_permission (
  role_key       VARCHAR(60) NOT NULL,
  permission_key VARCHAR(60) NOT NULL,
  PRIMARY KEY (role_key, permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Read-only mirror of the HRIS's org-unit hierarchy — refreshed every reconciliation alongside
-- employee_cache. FLMS never creates/edits/deletes a department here; it only displays what HRIS
-- already has, and uses it as the cost-centre picklist when registering a vehicle.
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

-- THE fleet register — every organisation-owned vehicle. `assigned_driver_employee_no` is the
-- vehicle's usual/default driver (shown on the register); a specific trip can still record a
-- different `driver_employee_no` on the `trip` row itself for a one-off reassignment.
-- `current_lat`/`current_lng`/`heading_deg`/`speed_kmh`/`last_ping_at` back the Live tracking
-- screen — a lightweight simulated telemetry feed (src/platform/telemetry.js, ticked by
-- node-cron in server.js) standing in for a real GPS/OBD vehicle-tracking unit, exactly the same
-- "documented as simulated, not faked as real hardware" pattern SPTS uses for its own VoIP module.
CREATE TABLE IF NOT EXISTS vehicle (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  reg_no                    VARCHAR(20) NOT NULL UNIQUE,
  model                     VARCHAR(120) NOT NULL,
  vehicle_type              ENUM('pickup','4x4','truck','bus','van','sedan','other') NOT NULL DEFAULT 'pickup',
  -- Separates the operational pool (dispatched for field work, tracked live) from executive
  -- vehicles (assigned to leadership, deliberately excluded from the Live tracking screen — see
  -- tracking.routes.js — since day-to-day surveillance of an executive's movements isn't the
  -- purpose of that screen the way it is for the operational fleet).
  category                  ENUM('work','executive') NOT NULL DEFAULT 'work',
  department                VARCHAR(150) NULL,
  assigned_driver_employee_no VARCHAR(20) NULL,
  status                    ENUM('Available','On trip','Workshop','Grounded') NOT NULL DEFAULT 'Available',
  odometer_km               INT NOT NULL DEFAULT 0,
  fuel_pct                  INT NOT NULL DEFAULT 100,
  efficiency_l100km         DECIMAL(6,2) NULL,
  target_l100km             DECIMAL(6,2) NULL,
  tank_capacity_l           INT NOT NULL DEFAULT 80,
  next_service_note         VARCHAR(120) NULL,
  next_service_date         DATE NULL,
  current_lat               DECIMAL(10,7) NULL,
  current_lng               DECIMAL(10,7) NULL,
  heading_deg               INT NULL DEFAULT 0,
  speed_kmh                 INT NOT NULL DEFAULT 0,
  last_ping_at              DATETIME NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicle_driver FOREIGN KEY (assigned_driver_employee_no) REFERENCES employee_cache(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_vehicle_status ON vehicle(status);
-- Idempotent for databases migrated before this column existed — migrate.js swallows the
-- "duplicate column" error (1060) the same way it already does for check_in in SPTS.
ALTER TABLE vehicle ADD COLUMN category ENUM('work','executive') NOT NULL DEFAULT 'work';

-- Driver-specific data that is genuinely FLMS's own to keep (licence number/expiry, an internal
-- safety score, coaching notes) — deliberately layered on TOP of employee_cache rather than
-- duplicating anything HRIS already owns (name, contact, department all still come from
-- employee_cache; only licence/safety facts live here). Any employee can gain a driver_profile row
-- regardless of their HRIS role, the same way SPTS's zone_assignment is a work fact kept separate
-- from role/permission.
CREATE TABLE IF NOT EXISTS driver_profile (
  employee_no    VARCHAR(20) PRIMARY KEY,
  licence_no     VARCHAR(30) NULL,
  licence_expiry DATE NULL,
  safety_score   INT NOT NULL DEFAULT 100,
  note           VARCHAR(255) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_driverprofile_employee FOREIGN KEY (employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Trip authorisation workflow — `requested_by_employee_no` is whoever submitted the request
-- (self-service, `trip.own.submit`, granted to every role); `driver_employee_no` is who actually
-- drives it, which may differ from the requester. Pending -> In progress (authorised, fuel card
-- unlocked) -> Completed (closed, cost posted) or Rejected.
CREATE TABLE IF NOT EXISTS trip (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  trip_code                 VARCHAR(20) NOT NULL UNIQUE,
  origin                    VARCHAR(150) NOT NULL,
  destination               VARCHAR(150) NOT NULL,
  vehicle_id                INT NULL,
  driver_employee_no        VARCHAR(20) NULL,
  requested_by_employee_no  VARCHAR(20) NOT NULL,
  distance_km               DECIMAL(8,1) NOT NULL DEFAULT 0,
  purpose                   VARCHAR(255) NULL,
  status                    ENUM('Pending','In progress','Completed','Rejected') NOT NULL DEFAULT 'Pending',
  cost                      DECIMAL(10,2) NULL,
  requested_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  authorised_by_employee_no VARCHAR(20) NULL,
  authorised_at             DATETIME NULL,
  closed_at                 DATETIME NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_trip_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(id) ON DELETE SET NULL,
  CONSTRAINT fk_trip_driver FOREIGN KEY (driver_employee_no) REFERENCES employee_cache(employee_no) ON DELETE SET NULL,
  CONSTRAINT fk_trip_requester FOREIGN KEY (requested_by_employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_trip_authoriser FOREIGN KEY (authorised_by_employee_no) REFERENCES employee_cache(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_trip_status ON trip(status);
CREATE INDEX idx_trip_requester ON trip(requested_by_employee_no);

-- Fuel transactions — `flag` starts Pending (or Exception if it fails an automatic sanity check at
-- capture time — litres exceeding tank capacity, implausible fill interval), a fleet officer then
-- Verifies (posts to the GL) or rejects it (see fuel.routes.js). The fuel-card feature that used to
-- sit between vehicle and transaction was removed (product decision) — transactions attach directly
-- to a vehicle and driver now.
CREATE TABLE IF NOT EXISTS fuel_transaction (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id              INT NOT NULL,
  driver_employee_no      VARCHAR(20) NULL,
  station                 VARCHAR(120) NOT NULL,
  litres                  DECIMAL(8,2) NOT NULL,
  rate                    DECIMAL(6,2) NOT NULL,
  odometer_km             INT NOT NULL,
  flag                    ENUM('Pending','Verified','Exception') NOT NULL DEFAULT 'Pending',
  verified_by_employee_no VARCHAR(20) NULL,
  verified_at             DATETIME NULL,
  transacted_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fuel_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(id) ON DELETE CASCADE,
  CONSTRAINT fk_fuel_driver FOREIGN KEY (driver_employee_no) REFERENCES employee_cache(employee_no) ON DELETE SET NULL,
  CONSTRAINT fk_fuel_verifier FOREIGN KEY (verified_by_employee_no) REFERENCES employee_cache(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_fuel_flag ON fuel_transaction(flag);
CREATE INDEX idx_fuel_vehicle ON fuel_transaction(vehicle_id, transacted_at);

-- Workshop board — `stage` 0=Scheduled, 1=In workshop, 2=Completed, advanced one step at a time
-- (see maintenance.routes.js); a vehicle with an open (stage < 2) Critical/High work order is
-- unavailable for dispatch.
CREATE TABLE IF NOT EXISTS work_order (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  wo_code                   VARCHAR(20) NOT NULL UNIQUE,
  vehicle_id                INT NOT NULL,
  title                     VARCHAR(200) NOT NULL,
  priority                  ENUM('Routine','High','Critical') NOT NULL DEFAULT 'Routine',
  stage                     TINYINT NOT NULL DEFAULT 0,
  cost                      DECIMAL(10,2) NOT NULL DEFAULT 0,
  workshop_name             VARCHAR(150) NULL,
  due_note                  VARCHAR(60) NULL,
  due_date                  DATE NULL,
  authorised_by_employee_no VARCHAR(20) NULL,
  opened_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at                 DATETIME NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wo_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(id) ON DELETE CASCADE,
  CONSTRAINT fk_wo_authoriser FOREIGN KEY (authorised_by_employee_no) REFERENCES employee_cache(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_wo_stage ON work_order(stage);

-- Fuel/dispatch policy (configuration, not code) — singleton row, id always 1. Edited from Settings
-- (admin.roles-gated), mirrors SPTS's own `policy` table pattern.
CREATE TABLE IF NOT EXISTS fuel_policy (
  id                      INT PRIMARY KEY DEFAULT 1,
  block_offhours          TINYINT(1) NOT NULL DEFAULT 1,
  require_odo_photo       TINYINT(1) NOT NULL DEFAULT 1,
  geofence_stations       TINYINT(1) NOT NULL DEFAULT 0,
  autoflag_overfill       TINYINT(1) NOT NULL DEFAULT 1,
  push_to_accounting      TINYINT(1) NOT NULL DEFAULT 1,
  variance_threshold_pct  INT NOT NULL DEFAULT 12,
  idle_threshold_min      INT NOT NULL DEFAULT 15,
  price_ceiling           DECIMAL(6,2) NOT NULL DEFAULT 22.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Org branding — same shape/reasoning as SPTS's own app_setting/branding pattern, standalone here
-- since FLMS keeps its own database.
CREATE TABLE IF NOT EXISTS app_setting (
  setting_key   VARCHAR(60) PRIMARY KEY,
  setting_value VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every privileged action (vehicle registered, trip authorised, card blocked, policy changed).
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

-- Voice over IP (floating quick-dial button, ported from SPTS's own §8 implementation verbatim) —
-- "voice is carried on the same data bundle as everything else," on-net handset/browser-to-browser
-- calling over WebRTC, signaled by short polling (see voip.routes.js), not a websocket server. One
-- extension per person, auto-provisioned the first time they place or receive a call. Presence is
-- derived from `last_seen_at`, a heartbeat every page posts every ~20s.
CREATE TABLE IF NOT EXISTS voip_extension (
  employee_no   VARCHAR(20) PRIMARY KEY,
  extension     VARCHAR(10) NOT NULL UNIQUE,
  last_seen_at  DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_voipext_employee FOREIGN KEY (employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per call attempt. `direction` is always 'on_net' for now — handset-to-handset over the
-- data bundle; off-net (public number) breakout needs a real SIP trunk provider, a procurement
-- decision outside what this codebase wires up on its own — the column is here so that work slots
-- in later without a schema change.
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

-- WebRTC signaling mailbox — SDP offer/answer and ICE candidates exchanged by short-poll. Once both
-- sides have exchanged an offer/answer and enough candidates, audio flows peer-to-peer over the data
-- connection directly; this table only carries the handshake, never the voice itself.
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
