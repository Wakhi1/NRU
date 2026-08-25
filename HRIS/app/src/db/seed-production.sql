-- ============================================================
-- NRU HRIS — clean production seed (SQL, for phpMyAdmin)
-- Run this AFTER importing schema.sql into an EMPTY database.
-- Seeds: all 6 roles + full permission matrix (RBAC needs these
-- regardless of headcount), plus exactly two real accounts —
-- System administrator and HR administrator. No demo data.
--
-- BEFORE RUNNING: edit the two INSERT INTO person / app_user blocks
-- near the bottom — replace the placeholder names/emails with the
-- real people. Both accounts get the password below; change it on
-- first login via Settings > Security.
--
-- Seed password for both accounts: Passw0rd!
-- ============================================================

SET NAMES utf8mb4;

-- ---------- roles ----------
INSERT INTO role (name, description, is_super_admin) VALUES ('HR administrator', 'Full read/write across HR modules for the whole organisation.', 0);
INSERT INTO role (name, description, is_super_admin) VALUES ('Head of Department', 'Manages their department: team-scoped read/write, approves for direct reports.', 0);
INSERT INTO role (name, description, is_super_admin) VALUES ('Data & CRM officer', 'Owns external data intake and partner/programme records.', 0);
INSERT INTO role (name, description, is_super_admin) VALUES ('Employee', 'Self-service access plus read on shared structures.', 0);
INSERT INTO role (name, description, is_super_admin) VALUES ('System administrator', 'Full technical administration, including access control.', 1);
INSERT INTO role (name, description, is_super_admin) VALUES ('Partner (external)', 'External partner with narrow, programme-scoped read access.', 0);

-- ---------- permission matrix (6 roles x 16 modules = 96 rows) ----------
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'people', 1, 1, 1, 1, 'organisation', 'public,internal,restricted,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'org', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'worktime', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'attendance', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'leave', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'benefits', 1, 1, 1, 1, 'organisation', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'payroll', 1, 1, 1, 1, 'organisation', 'restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'recruitment', 1, 1, 1, 1, 'organisation', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'performance', 1, 1, 1, 1, 'organisation', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'succession', 1, 1, 1, 1, 'organisation', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'training', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'intake', 1, 1, 1, 1, 'organisation', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'crm', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'reports', 0, 1, 0, 0, 'organisation', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'voip', 1, 1, 1, 1, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'HR administrator'), 'assets', 1, 1, 1, 1, 'organisation', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'people', 0, 1, 1, 0, 'department', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'org', 0, 1, 0, 0, 'department', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'worktime', 0, 1, 1, 0, 'department', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'attendance', 1, 1, 1, 0, 'department', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'leave', 1, 1, 1, 0, 'department', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'benefits', 0, 1, 0, 0, 'department', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'payroll', 0, 1, 0, 0, 'department', 'restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'recruitment', 1, 1, 1, 0, 'department', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'performance', 1, 1, 1, 0, 'department', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'succession', 0, 1, 1, 0, 'department', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'training', 0, 1, 1, 0, 'department', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'intake', 0, 0, 0, 0, 'self', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'crm', 0, 0, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'reports', 0, 1, 0, 0, 'department', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'voip', 1, 1, 1, 1, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Head of Department'), 'assets', 1, 1, 1, 0, 'self', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'people', 0, 1, 0, 0, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'org', 0, 1, 0, 0, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'worktime', 0, 0, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'attendance', 1, 1, 1, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'leave', 0, 1, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'benefits', 0, 0, 0, 0, 'self', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'payroll', 0, 0, 0, 0, 'self', 'restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'recruitment', 0, 0, 0, 0, 'self', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'performance', 0, 0, 0, 0, 'self', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'succession', 0, 0, 0, 0, 'self', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'training', 0, 0, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'intake', 1, 1, 1, 1, 'organisation', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'crm', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'reports', 0, 1, 0, 0, 'organisation', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'voip', 1, 1, 1, 1, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Data & CRM officer'), 'assets', 1, 1, 1, 0, 'self', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'people', 0, 1, 1, 0, 'self', 'public,internal,restricted,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'org', 0, 1, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'worktime', 0, 1, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'attendance', 1, 1, 1, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'leave', 1, 1, 1, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'benefits', 0, 1, 1, 0, 'self', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'payroll', 0, 1, 0, 0, 'self', 'restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'recruitment', 0, 0, 0, 0, 'self', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'performance', 0, 1, 1, 0, 'self', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'succession', 0, 0, 0, 0, 'self', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'training', 0, 1, 1, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'intake', 0, 0, 0, 0, 'self', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'crm', 0, 0, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'reports', 0, 0, 0, 0, 'self', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'voip', 1, 1, 1, 1, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Employee'), 'assets', 1, 1, 1, 0, 'self', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'people', 1, 1, 1, 1, 'organisation', 'public,internal,restricted,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'org', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'worktime', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'attendance', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'leave', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'benefits', 1, 1, 1, 1, 'organisation', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'payroll', 1, 1, 1, 1, 'organisation', 'restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'recruitment', 1, 1, 1, 1, 'organisation', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'performance', 1, 1, 1, 1, 'organisation', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'succession', 1, 1, 1, 1, 'organisation', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'training', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'intake', 1, 1, 1, 1, 'organisation', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'crm', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'reports', 1, 1, 1, 1, 'organisation', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'voip', 1, 1, 1, 1, 'organisation', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'System administrator'), 'assets', 1, 1, 1, 1, 'organisation', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'people', 0, 0, 0, 0, 'self', 'public,internal,restricted,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'org', 0, 0, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'worktime', 0, 0, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'attendance', 0, 0, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'leave', 0, 0, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'benefits', 0, 0, 0, 0, 'self', 'internal,restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'payroll', 0, 0, 0, 0, 'self', 'restricted');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'recruitment', 0, 0, 0, 0, 'self', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'performance', 0, 0, 0, 0, 'self', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'succession', 0, 0, 0, 0, 'self', 'internal,sensitive');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'training', 0, 0, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'intake', 0, 0, 0, 0, 'self', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'crm', 0, 1, 0, 0, 'programme', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'reports', 0, 0, 0, 0, 'self', 'internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'voip', 0, 0, 0, 0, 'self', 'public,internal');
INSERT INTO permission (role_id, module, can_create, can_read, can_update, can_delete, data_scope, field_classes) VALUES ((SELECT id FROM role WHERE name = 'Partner (external)'), 'assets', 0, 0, 0, 0, 'self', 'internal,restricted');

-- ---------- the two admin accounts — EDIT before running ----------
-- Employee numbers must be unique. Change 'ADM-0001'/'ADM-0002', names, and emails.
INSERT INTO person (employee_no, full_legal_name, preferred_name, email, status) VALUES ('ADM-0001', 'System Administrator', 'System', 'sysadmin@yourorg.org', 'active');
INSERT INTO person (employee_no, full_legal_name, preferred_name, email, status) VALUES ('ADM-0002', 'HR Administrator', 'HR', 'hradmin@yourorg.org', 'active');

INSERT INTO employment (employee_no, position_title, start_date, is_current) VALUES ('ADM-0001', 'System Administrator', CURDATE(), 1);
INSERT INTO employment (employee_no, position_title, start_date, is_current) VALUES ('ADM-0002', 'HR Administrator', CURDATE(), 1);

-- password_hash below is bcrypt("Passw0rd!", 10) — change the password from the app after first login.
INSERT INTO app_user (employee_no, email, password_hash, role_id, is_active) VALUES ('ADM-0001', 'sysadmin@yourorg.org', '$2b$10$jWyYbLJhm2dV0eVewSmDC.kHN0Y1l1OUmkK/tBycsErg1KEbMYFWa', (SELECT id FROM role WHERE name = 'System administrator'), 1);
INSERT INTO app_user (employee_no, email, password_hash, role_id, is_active) VALUES ('ADM-0002', 'hradmin@yourorg.org', '$2b$10$jWyYbLJhm2dV0eVewSmDC.kHN0Y1l1OUmkK/tBycsErg1KEbMYFWa', (SELECT id FROM role WHERE name = 'HR administrator'), 1);

-- ---------- notification event catalog (not org-specific — needed for Settings > Notifications) ----------
INSERT INTO notification_setting (event_key, description, channel, is_enabled) VALUES ('leave_submitted', 'Leave request submitted', 'email', 1);
INSERT INTO notification_setting (event_key, description, channel, is_enabled) VALUES ('leave_decided', 'Leave approved or declined', 'email', 1);
INSERT INTO notification_setting (event_key, description, channel, is_enabled) VALUES ('timesheet_missing', 'Timesheet not submitted (Friday 15:00 digest)', 'email', 1);
INSERT INTO notification_setting (event_key, description, channel, is_enabled) VALUES ('payslip_released', 'Payslip released', 'email', 1);
INSERT INTO notification_setting (event_key, description, channel, is_enabled) VALUES ('payroll_awaiting_approval', 'Payroll run awaiting approval', 'email', 1);
INSERT INTO notification_setting (event_key, description, channel, is_enabled) VALUES ('certification_expiring', 'Certification expiring in 90 days (weekly digest)', 'email', 1);

-- ---------- baseline app settings ----------
INSERT INTO app_setting (setting_key, setting_value) VALUES ('payroll_cutoff_day', '25');
INSERT INTO app_setting (setting_key, setting_value) VALUES ('leave_cycle', 'calendar_year');
INSERT INTO app_setting (setting_key, setting_value) VALUES ('session_lifetime_hours', '8');
INSERT INTO app_setting (setting_key, setting_value) VALUES ('reauth_modules', 'payroll,people,access');
INSERT INTO app_setting (setting_key, setting_value) VALUES ('lockout_attempts', '5');
INSERT INTO app_setting (setting_key, setting_value) VALUES ('lockout_window_minutes', '15');

-- Done. Log in with sysadmin@yourorg.org or hradmin@yourorg.org, password Passw0rd!,
-- then immediately: change both passwords (Settings > Security), set your real
-- organisation name and logo (Settings > Branding), and add departments/employees
-- through the app itself.
