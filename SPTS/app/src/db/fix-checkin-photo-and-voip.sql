-- SPTS — schema update: check-in photo proof, login/recheck reconfirmation, and VoIP.
-- Safe to run once against an existing database that was already migrated from an earlier
-- schema.sql. Uses "IF NOT EXISTS" (MySQL 8.0.29+ / MariaDB 10.0.2+) so it's also safe to re-run.
-- If your server is on an older MySQL that rejects "ADD COLUMN IF NOT EXISTS", drop that clause
-- from the three ALTER TABLE lines below and just run them once.

-- 1. Photographic proof + reconfirmation timestamp on check_in (architecture doc §7, §5 recheck).
ALTER TABLE check_in ADD COLUMN IF NOT EXISTS photo_path VARCHAR(255) NULL;
ALTER TABLE check_in ADD COLUMN IF NOT EXISTS photo_taken_at DATETIME NULL;
ALTER TABLE check_in ADD COLUMN IF NOT EXISTS reconfirmed_at DATETIME NULL;

-- 2. VoIP (architecture doc §8) — one extension per person, call records, WebRTC signaling mailbox.
CREATE TABLE IF NOT EXISTS voip_extension (
  employee_no   VARCHAR(20) PRIMARY KEY,
  extension     VARCHAR(10) NOT NULL UNIQUE,
  last_seen_at  DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_voipext_employee FOREIGN KEY (employee_no) REFERENCES employee_cache(employee_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

-- 3. REQUIRED if role_permission was already seeded before this change: grant every existing role
-- the new `voice.call` permission. seed.js's seedPermissions() only ever inserts the default matrix
-- once (skipped when role_permission already has rows), so a database seeded before VoIP was added
-- never got this grant — every /api/v1/voip/* call 403s until these rows exist.
INSERT IGNORE INTO role_permission (role_key, permission_key) VALUES
  ('System administrator', 'voice.call'),
  ('HR administrator', 'voice.call'),
  ('Head of Department', 'voice.call'),
  ('System Analyst', 'voice.call'),
  ('Data & CRM officer', 'voice.call'),
  ('Employee', 'voice.call'),
  ('Partner (external)', 'voice.call');

-- 4. Optional cleanup: `elevation` was dead code — no route or platform file ever read or wrote
-- it, and it directly contradicted this schema's own documented "no elevation table" decision.
-- Only run this line if you'd already applied the old schema.sql (so the table exists) and want
-- it gone; skip it if the table was never created on this server.
-- DROP TABLE IF EXISTS elevation;
