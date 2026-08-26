-- NRU HRIS — full schema (MySQL 8 / XAMPP compatible)
-- All tables use InnoDB + utf8mb4. Safe to re-run: every statement is CREATE TABLE IF NOT EXISTS.

SET NAMES utf8mb4;

-- ============================= Access & identity =============================

-- is_super_admin bypasses the permission matrix entirely (see platform/scope.js) — a true
-- superuser role that always has full CRUD/organisation-scope/all-field-classes access on every
-- module, immune to someone accidentally narrowing the matrix. Only 'System administrator' is
-- seeded with this set; there is no UI to grant it to an arbitrary role (deliberately — it's not
-- a normal permission to hand out).
CREATE TABLE IF NOT EXISTS role (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(60) NOT NULL UNIQUE,
  description    VARCHAR(255),
  is_super_admin TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS person (
  employee_no             VARCHAR(20) PRIMARY KEY,
  full_legal_name         VARCHAR(150) NOT NULL,
  preferred_name          VARCHAR(80),
  national_id             VARCHAR(255), -- AES-GCM ciphertext (base64) — see platform/crypto.js
  date_of_birth           DATE,
  gender                  VARCHAR(20),
  nationality             VARCHAR(60),
  marital_status          VARCHAR(30),
  languages               VARCHAR(150),
  email                   VARCHAR(150),
  phone                   VARCHAR(40),
  address                 VARCHAR(255),
  next_of_kin_name        VARCHAR(150),
  next_of_kin_relationship VARCHAR(60),
  next_of_kin_phone       VARCHAR(255), -- AES-GCM ciphertext (base64)
  photo_url               VARCHAR(255),
  status                  ENUM('active','on_leave','suspended','exited') NOT NULL DEFAULT 'active',
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_user (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  employee_no       VARCHAR(20) NOT NULL UNIQUE,
  email             VARCHAR(150) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  role_id           INT NOT NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at     DATETIME NULL,
  failed_attempts   INT NOT NULL DEFAULT 0,
  locked_until      DATETIME NULL,
  totp_secret       VARCHAR(255) NULL, -- AES-GCM ciphertext (base64)
  totp_enabled      TINYINT(1) NOT NULL DEFAULT 0,
  email_otp_enabled TINYINT(1) NOT NULL DEFAULT 0,
  mfa_enrolled_at   DATETIME NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES role(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One-time recovery codes for when a device with the authenticator app is lost. Generated in
-- a batch whenever TOTP is (re)enabled; each code is single-use (marked via used_at).
CREATE TABLE IF NOT EXISTS mfa_backup_code (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  app_user_id INT NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  used_at     DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_backup_user FOREIGN KEY (app_user_id) REFERENCES app_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_backup_user ON mfa_backup_code(app_user_id, used_at);

-- Email-OTP challenges issued THROUGH THE INTEGRATION API (POST /integration/employees/:no/mfa/send-email-code)
-- on behalf of another system in the ecosystem (e.g. SPTS) — deliberately separate from the
-- browser-login pendingMfa object in auth.routes.js, which lives only in an HRIS session and
-- isn't reachable by a server-to-server caller. This is HRIS acting as the ecosystem's MFA
-- authority: the code is generated and emailed by HRIS, but a DIFFERENT system verifies its own
-- login attempt against it via POST /integration/employees/:no/mfa/verify, without HRIS ever
-- handing over the raw TOTP secret or a long-lived credential.
CREATE TABLE IF NOT EXISTS mfa_challenge (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  employee_no  VARCHAR(20) NOT NULL,
  code_hash    VARCHAR(255) NOT NULL,
  consumed_at  DATETIME NULL,
  expires_at   DATETIME NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mfachallenge_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_mfachallenge_employee ON mfa_challenge(employee_no, consumed_at);

CREATE TABLE IF NOT EXISTS permission (
  role_id     INT NOT NULL,
  module      VARCHAR(30) NOT NULL,
  can_create  TINYINT(1) NOT NULL DEFAULT 0,
  can_read    TINYINT(1) NOT NULL DEFAULT 0,
  can_update  TINYINT(1) NOT NULL DEFAULT 0,
  can_delete  TINYINT(1) NOT NULL DEFAULT 0,
  data_scope  ENUM('self','team','department','organisation','programme') NOT NULL DEFAULT 'self',
  field_classes VARCHAR(120) NOT NULL DEFAULT 'public',
  PRIMARY KEY (role_id, module),
  CONSTRAINT fk_perm_role FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permission_override (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  employee_no            VARCHAR(20) NOT NULL,
  module                 VARCHAR(30) NOT NULL,
  crud                   VARCHAR(10) NOT NULL,
  reason                 VARCHAR(255) NOT NULL,
  expires_at             DATETIME NULL,
  granted_by_employee_no VARCHAR(20) NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_override_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_override_grantor FOREIGN KEY (granted_by_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= Org structure =============================

CREATE TABLE IF NOT EXISTS org_unit (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  kind           ENUM('department','committee','board','group','project_team') NOT NULL,
  name           VARCHAR(150) NOT NULL,
  lead_employee_no VARCHAR(20) NULL,
  parent_id      INT NULL,
  cost_centre    VARCHAR(30),
  duty_station   VARCHAR(100),
  note           VARCHAR(255),
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orgunit_lead FOREIGN KEY (lead_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL,
  CONSTRAINT fk_orgunit_parent FOREIGN KEY (parent_id) REFERENCES org_unit(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS membership (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  employee_no  VARCHAR(20) NOT NULL,
  org_unit_id  INT NOT NULL,
  role_in_unit VARCHAR(100),
  from_date    DATE NOT NULL,
  to_date      DATE NULL,
  CONSTRAINT fk_membership_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_membership_unit FOREIGN KEY (org_unit_id) REFERENCES org_unit(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employment (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  employee_no              VARCHAR(20) NOT NULL,
  position_title           VARCHAR(150) NOT NULL,
  department_org_unit_id   INT NULL,
  duty_station             VARCHAR(100),
  grade                    VARCHAR(10),
  contract_type            ENUM('permanent','fixed_term','consultant','intern') NOT NULL DEFAULT 'permanent',
  start_date               DATE NOT NULL,
  end_date                 DATE NULL,
  reports_to_employee_no   VARCHAR(20) NULL,
  cost_centre              VARCHAR(30),
  basic_salary             DECIMAL(12,2) NULL, -- current base pay; payroll-scope-gated, see people.routes.js
  is_current               TINYINT(1) NOT NULL DEFAULT 1,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_employment_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_employment_dept FOREIGN KEY (department_org_unit_id) REFERENCES org_unit(id) ON DELETE SET NULL,
  CONSTRAINT fk_employment_manager FOREIGN KEY (reports_to_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reporting_line (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  employee_no          VARCHAR(20) NOT NULL,
  manager_employee_no  VARCHAR(20) NOT NULL,
  from_date            DATE NOT NULL,
  to_date              DATE NULL,
  CONSTRAINT fk_rline_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_rline_manager FOREIGN KEY (manager_employee_no) REFERENCES person(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= Work time =============================

CREATE TABLE IF NOT EXISTS shift_pattern (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(100) NOT NULL,
  pattern          VARCHAR(150) NOT NULL,
  contracted_hours DECIMAL(5,2) NOT NULL DEFAULT 40,
  break_rule       VARCHAR(100),
  grace_minutes    INT NOT NULL DEFAULT 10,
  overtime_rule    VARCHAR(150),
  rounding_rule    VARCHAR(100),
  auto_clock_out   TINYINT(1) NOT NULL DEFAULT 0,
  capture_source   ENUM('terminal','mobile_gps','web','vehicle_log') NOT NULL DEFAULT 'web'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS work_timer (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_no       VARCHAR(20) NOT NULL,
  shift_pattern_id  INT NULL,
  clock_in          DATETIME NOT NULL,
  clock_out         DATETIME NULL,
  source            ENUM('terminal','mobile_gps','web','vehicle_log') NOT NULL DEFAULT 'web',
  device            VARCHAR(100),
  geo               VARCHAR(100),
  correction_of     BIGINT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_timer_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_timer_shift FOREIGN KEY (shift_pattern_id) REFERENCES shift_pattern(id) ON DELETE SET NULL,
  CONSTRAINT fk_timer_correction FOREIGN KEY (correction_of) REFERENCES work_timer(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= Leave =============================

CREATE TABLE IF NOT EXISTS leave_type (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  name                     VARCHAR(60) NOT NULL UNIQUE,
  annual_entitlement_days  DECIMAL(5,2) NOT NULL DEFAULT 0,
  paid                     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leave_balance (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  employee_no    VARCHAR(20) NOT NULL,
  leave_type_id  INT NOT NULL,
  year           INT NOT NULL,
  entitled_days  DECIMAL(5,2) NOT NULL DEFAULT 0,
  used_days      DECIMAL(5,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_balance (employee_no, leave_type_id, year),
  CONSTRAINT fk_balance_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_balance_type FOREIGN KEY (leave_type_id) REFERENCES leave_type(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leave_request (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  employee_no            VARCHAR(20) NOT NULL,
  leave_type_id          INT NOT NULL,
  start_date             DATE NOT NULL,
  end_date               DATE NOT NULL,
  days                   DECIMAL(5,2) NOT NULL,
  reason                 VARCHAR(255),
  stage                  ENUM('manager','hr','completed') NOT NULL DEFAULT 'manager',
  status                 ENUM('pending','approved','declined','cancelled') NOT NULL DEFAULT 'pending',
  decided_by_employee_no VARCHAR(20) NULL,
  decided_at             DATETIME NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_leavereq_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_leavereq_type FOREIGN KEY (leave_type_id) REFERENCES leave_type(id),
  CONSTRAINT fk_leavereq_decider FOREIGN KEY (decided_by_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= Benefits =============================

CREATE TABLE IF NOT EXISTS benefit_plan (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  kind            VARCHAR(60),
  cost_per_person DECIMAL(10,2) NOT NULL DEFAULT 0,
  note            VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS benefit_enrollment (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  employee_no     VARCHAR(20) NOT NULL,
  benefit_plan_id INT NOT NULL,
  enrolled_at     DATE NOT NULL,
  status          ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  CONSTRAINT fk_enroll_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_enroll_plan FOREIGN KEY (benefit_plan_id) REFERENCES benefit_plan(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= Payroll =============================

CREATE TABLE IF NOT EXISTS payroll_run (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  period                VARCHAR(20) NOT NULL UNIQUE,
  status                ENUM('draft','inputs_locked','in_review','approved_finance','approved_ed','paid','closed') NOT NULL DEFAULT 'draft',
  cutoff_date           DATE,
  created_by_employee_no VARCHAR(20) NULL,
  approved_finance_by   VARCHAR(20) NULL,
  approved_finance_at   DATETIME NULL,
  approved_ed_by        VARCHAR(20) NULL,
  approved_ed_at        DATETIME NULL,
  paid_at               DATETIME NULL,
  paid_via              ENUM('manual','accounting_integration') NOT NULL DEFAULT 'manual',
  payment_reference     VARCHAR(100) NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_run_creator FOREIGN KEY (created_by_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL,
  CONSTRAINT fk_run_finance FOREIGN KEY (approved_finance_by) REFERENCES person(employee_no) ON DELETE SET NULL,
  CONSTRAINT fk_run_ed FOREIGN KEY (approved_ed_by) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payline (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  payroll_run_id INT NOT NULL,
  employee_no    VARCHAR(20) NOT NULL,
  basic          DECIMAL(12,2) NOT NULL DEFAULT 0,
  allowances     DECIMAL(12,2) NOT NULL DEFAULT 0,
  overtime       DECIMAL(12,2) NOT NULL DEFAULT 0,
  deductions     DECIMAL(12,2) NOT NULL DEFAULT 0,
  net            DECIMAL(12,2) NOT NULL DEFAULT 0,
  bank_account   VARCHAR(255), -- AES-GCM ciphertext (base64)
  tax_number     VARCHAR(255), -- AES-GCM ciphertext (base64)
  CONSTRAINT fk_payline_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_run(id) ON DELETE CASCADE,
  CONSTRAINT fk_payline_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Itemized allowance/deduction lines for a payline — optional, additive detail on top of the
-- payline's own `allowances`/`deductions` totals (which stay the source of truth every existing
-- consumer — dashboard charts, reports, the integration API — already reads; when items exist for
-- a payline those two totals are kept in sync as the SUM of their respective items, computed
-- server-side on save, never hand-typed out of step). A payline with no items falls back to the
-- old flat-total behaviour untouched, so historical/seeded paylines render exactly as before.
CREATE TABLE IF NOT EXISTS payline_item (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  payline_id INT NOT NULL,
  kind       ENUM('allowance','deduction') NOT NULL,
  label      VARCHAR(100) NOT NULL,
  amount     DECIMAL(12,2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_plitem_payline FOREIGN KEY (payline_id) REFERENCES payline(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= Recruitment =============================

CREATE TABLE IF NOT EXISTS job_requisition (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  title                  VARCHAR(150) NOT NULL,
  department_org_unit_id INT NULL,
  grade                  VARCHAR(10),
  status                 ENUM('open','on_hold','closed') NOT NULL DEFAULT 'open',
  opened_by_employee_no  VARCHAR(20) NULL,
  opened_at              DATE NOT NULL,
  headcount              INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_req_dept FOREIGN KEY (department_org_unit_id) REFERENCES org_unit(id) ON DELETE SET NULL,
  CONSTRAINT fk_req_opener FOREIGN KEY (opened_by_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS candidate (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  full_name   VARCHAR(150) NOT NULL,
  email       VARCHAR(150),
  phone       VARCHAR(40),
  resume_url  VARCHAR(255),
  source      VARCHAR(80)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS application (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  requisition_id INT NOT NULL,
  candidate_id   INT NOT NULL,
  stage          ENUM('applied','screening','interview','offer','hired','rejected') NOT NULL DEFAULT 'applied',
  applied_at     DATE NOT NULL,
  CONSTRAINT fk_app_req FOREIGN KEY (requisition_id) REFERENCES job_requisition(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_candidate FOREIGN KEY (candidate_id) REFERENCES candidate(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS interview (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  application_id            INT NOT NULL,
  interviewer_employee_no   VARCHAR(20) NULL,
  scheduled_at              DATETIME NOT NULL,
  outcome                   ENUM('pending','pass','fail') NOT NULL DEFAULT 'pending',
  notes                     VARCHAR(500),
  CONSTRAINT fk_interview_app FOREIGN KEY (application_id) REFERENCES application(id) ON DELETE CASCADE,
  CONSTRAINT fk_interview_person FOREIGN KEY (interviewer_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= Performance & succession =============================

CREATE TABLE IF NOT EXISTS review_cycle (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  period     VARCHAR(20) NOT NULL,
  status     ENUM('open','closed') NOT NULL DEFAULT 'open',
  start_date DATE,
  end_date   DATE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS performance_review (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id                INT NOT NULL,
  employee_no             VARCHAR(20) NOT NULL,
  reviewer_employee_no    VARCHAR(20) NULL,
  self_rating             DECIMAL(3,1) NULL,
  manager_rating          DECIMAL(3,1) NULL,
  status                  ENUM('not_started','self_submitted','manager_submitted','completed') NOT NULL DEFAULT 'not_started',
  comments                VARCHAR(1000),
  CONSTRAINT fk_perf_cycle FOREIGN KEY (cycle_id) REFERENCES review_cycle(id) ON DELETE CASCADE,
  CONSTRAINT fk_perf_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_perf_reviewer FOREIGN KEY (reviewer_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS succession_plan (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  position_title         VARCHAR(150) NOT NULL,
  org_unit_id            INT NULL,
  incumbent_employee_no  VARCHAR(20) NULL,
  risk                   ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  note                   VARCHAR(255),
  CONSTRAINT fk_succession_unit FOREIGN KEY (org_unit_id) REFERENCES org_unit(id) ON DELETE SET NULL,
  CONSTRAINT fk_succession_incumbent FOREIGN KEY (incumbent_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS successor_candidate (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  succession_plan_id INT NOT NULL,
  employee_no        VARCHAR(20) NOT NULL,
  readiness          ENUM('ready_now','ready_1_2yr','ready_3_5yr') NOT NULL DEFAULT 'ready_1_2yr',
  CONSTRAINT fk_successor_plan FOREIGN KEY (succession_plan_id) REFERENCES succession_plan(id) ON DELETE CASCADE,
  CONSTRAINT fk_successor_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= Training =============================

CREATE TABLE IF NOT EXISTS training_course (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(150) NOT NULL,
  provider         VARCHAR(150),
  category         VARCHAR(80),
  is_certification TINYINT(1) NOT NULL DEFAULT 0,
  validity_months  INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS training_enrollment (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  employee_no  VARCHAR(20) NOT NULL,
  course_id    INT NOT NULL,
  status       ENUM('enrolled','in_progress','completed','failed') NOT NULL DEFAULT 'enrolled',
  completed_at DATE NULL,
  CONSTRAINT fk_train_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_train_course FOREIGN KEY (course_id) REFERENCES training_course(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS certification (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  employee_no   VARCHAR(20) NOT NULL,
  name          VARCHAR(150) NOT NULL,
  issued_at     DATE,
  expires_at    DATE NULL,
  issuing_body  VARCHAR(150),
  CONSTRAINT fk_cert_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= CRM & external data intake =============================

CREATE TABLE IF NOT EXISTS partner_org (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  type          VARCHAR(80),
  contact_name  VARCHAR(150),
  contact_phone VARCHAR(40),
  agreement     VARCHAR(150),
  status        ENUM('active','renewal_due','inactive') NOT NULL DEFAULT 'active',
  since_year    INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS programme (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(150) NOT NULL,
  lead_employee_no    VARCHAR(20) NULL,
  status              VARCHAR(40) NOT NULL DEFAULT 'Active',
  start_date          DATE,
  end_date            DATE NULL,
  CONSTRAINT fk_programme_lead FOREIGN KEY (lead_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS programme_partner (
  programme_id   INT NOT NULL,
  partner_org_id INT NOT NULL,
  PRIMARY KEY (programme_id, partner_org_id),
  CONSTRAINT fk_pp_programme FOREIGN KEY (programme_id) REFERENCES programme(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_partner FOREIGN KEY (partner_org_id) REFERENCES partner_org(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS indicator_record (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  programme_id             INT NOT NULL,
  partner_org_id           INT NULL,
  indicator_name           VARCHAR(150) NOT NULL,
  period                   VARCHAR(20) NOT NULL,
  value                    DECIMAL(14,2) NOT NULL DEFAULT 0,
  source_feed              VARCHAR(100),
  collected_by_employee_no VARCHAR(20) NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_indicator_programme FOREIGN KEY (programme_id) REFERENCES programme(id) ON DELETE CASCADE,
  CONSTRAINT fk_indicator_partner FOREIGN KEY (partner_org_id) REFERENCES partner_org(id) ON DELETE SET NULL,
  CONSTRAINT fk_indicator_collector FOREIGN KEY (collected_by_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feed (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  source_name     VARCHAR(150) NOT NULL,
  transport       ENUM('api_pull','sftp','csv_upload','webhook_push') NOT NULL DEFAULT 'csv_upload',
  cadence         VARCHAR(60),
  field_map       JSON,
  owner_employee_no VARCHAR(20) NULL,
  status          ENUM('healthy','degraded','failed') NOT NULL DEFAULT 'healthy',
  last_run_at     DATETIME NULL,
  CONSTRAINT fk_feed_owner FOREIGN KEY (owner_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feed_record (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  feed_id                  INT NOT NULL,
  raw_payload              JSON,
  status                   ENUM('staged','quarantined','published') NOT NULL DEFAULT 'staged',
  reason                   VARCHAR(255) NULL,
  resolved_by_employee_no  VARCHAR(20) NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feedrecord_feed FOREIGN KEY (feed_id) REFERENCES feed(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedrecord_resolver FOREIGN KEY (resolved_by_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= VoIP (directory + simulated CDR) =============================

-- Extension record doubles as the "SIP configuration" and "call routing" panel the Settings-level
-- VoIP admin UI edits — this is still a simulated PBX (see voip.routes.js header comment), so these
-- columns are configuration data only, never sent to a real SIP registrar.
CREATE TABLE IF NOT EXISTS voip_extension (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  employee_no            VARCHAR(20) NOT NULL UNIQUE,
  extension              VARCHAR(20) NOT NULL UNIQUE,
  status                 ENUM('active','inactive','forwarded') NOT NULL DEFAULT 'active',
  sip_username           VARCHAR(60),
  sip_domain             VARCHAR(120) DEFAULT 'sip.nru.local',
  voicemail_pin          VARCHAR(10),
  device_assigned        VARCHAR(120),
  department_org_unit_id INT NULL,
  emergency_number       VARCHAR(40),
  forward_on_busy_to     VARCHAR(20),
  out_of_office_enabled  TINYINT(1) NOT NULL DEFAULT 0,
  out_of_office_target   VARCHAR(20),
  hunt_group             VARCHAR(60),
  CONSTRAINT fk_ext_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_ext_department FOREIGN KEY (department_org_unit_id) REFERENCES org_unit(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS call_record (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  caller_employee_no  VARCHAR(20) NOT NULL,
  callee_employee_no  VARCHAR(20) NULL,
  callee_number       VARCHAR(40) NULL,
  started_at          DATETIME NOT NULL,
  duration_seconds    INT NOT NULL DEFAULT 0,
  direction           ENUM('outbound','inbound') NOT NULL DEFAULT 'outbound',
  outcome             ENUM('completed','missed','declined','voicemail') NOT NULL DEFAULT 'completed',
  CONSTRAINT fk_call_caller FOREIGN KEY (caller_employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_call_callee FOREIGN KEY (callee_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================= Asset & interest declarations =============================
-- Integrity/compliance feature: staff declare personal assets, financial interests, gifts and
-- outside employment. Employees own their draft/submitted rows (data_scope 'self'); HR and
-- System administrator review organisation-wide.

CREATE TABLE IF NOT EXISTS asset_declaration (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  employee_no             VARCHAR(20) NOT NULL,
  category                ENUM('property','vehicle','financial_interest','gift','outside_employment','other') NOT NULL,
  description             VARCHAR(500) NOT NULL,
  estimated_value         DECIMAL(14,2) NULL,
  currency                VARCHAR(10) NOT NULL DEFAULT 'SZL',
  acquired_at             DATE NULL,
  declared_at             DATE NOT NULL,
  status                  ENUM('draft','submitted','reviewed','flagged') NOT NULL DEFAULT 'draft',
  reviewed_by_employee_no VARCHAR(20) NULL,
  reviewed_at             DATETIME NULL,
  review_note             VARCHAR(500) NULL,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_asset_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE,
  CONSTRAINT fk_asset_reviewer FOREIGN KEY (reviewed_by_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_asset_person ON asset_declaration(employee_no, status);

-- ============================= Notifications, settings, audit =============================

CREATE TABLE IF NOT EXISTS notification_setting (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  event_key   VARCHAR(60) NOT NULL UNIQUE,
  description VARCHAR(255),
  channel     VARCHAR(30) NOT NULL DEFAULT 'email',
  is_enabled  TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_log (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_key       VARCHAR(60) NOT NULL,
  recipient_email VARCHAR(150),
  subject         VARCHAR(255),
  status          ENUM('sent','failed','skipped') NOT NULL DEFAULT 'sent',
  error           VARCHAR(500) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_setting (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  setting_key   VARCHAR(60) NOT NULL UNIQUE,
  setting_value VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_event (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_employee_no  VARCHAR(20) NULL,
  action             VARCHAR(60) NOT NULL,
  entity_type        VARCHAR(60) NOT NULL,
  entity_id          VARCHAR(60),
  before_json        JSON NULL,
  after_json         JSON NULL,
  at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip                 VARCHAR(60),
  consumer           VARCHAR(60) NOT NULL DEFAULT 'web'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A saved report is either a single report type (report_ids has one entry) or a combined
-- multi-section report (report_ids has several) — filters_json is keyed by report id so each
-- section can carry its own filter set even inside a combined save.
CREATE TABLE IF NOT EXISTS saved_report (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(150) NOT NULL,
  report_ids_json    JSON NOT NULL,
  filters_json        JSON NOT NULL,
  created_by_employee_no VARCHAR(20) NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-user, server-side dashboard personalization (which KPI cards / quick actions show, in
-- what order) — replaces an earlier admin-only, browser-localStorage-only version so every
-- role can personalize their own view and it follows them across devices/browsers.
CREATE TABLE IF NOT EXISTS user_preference (
  employee_no    VARCHAR(20) NOT NULL PRIMARY KEY,
  dashboard_json JSON NULL,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pref_person FOREIGN KEY (employee_no) REFERENCES person(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Machine-to-machine credentials for other internal systems (smartphone tracking, accounting,
-- fleet/logistics) to pull read-only HR data over the integration API — see docs/INTEGRATION.md.
-- Only key_hash (bcrypt) is stored; the plaintext key is shown once at creation time, same
-- pattern as an MFA backup code.
CREATE TABLE IF NOT EXISTS api_key (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  name                   VARCHAR(100) NOT NULL,
  key_prefix             VARCHAR(12) NOT NULL,
  key_hash               VARCHAR(255) NOT NULL,
  scopes                 VARCHAR(255) NOT NULL,
  is_active              TINYINT(1) NOT NULL DEFAULT 1,
  created_by_employee_no VARCHAR(20) NULL,
  last_used_at           DATETIME NULL,
  expires_at             DATETIME NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_apikey_creator FOREIGN KEY (created_by_employee_no) REFERENCES person(employee_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_employment_person ON employment(employee_no);
CREATE INDEX idx_timer_person ON work_timer(employee_no, clock_in);
CREATE INDEX idx_leavereq_person ON leave_request(employee_no, status);
CREATE INDEX idx_payline_run ON payline(payroll_run_id);
CREATE INDEX idx_audit_entity ON audit_event(entity_type, entity_id);
CREATE INDEX idx_audit_at ON audit_event(at);
CREATE INDEX idx_audit_actor ON audit_event(actor_employee_no, at);
CREATE INDEX idx_membership_unit ON membership(org_unit_id);
