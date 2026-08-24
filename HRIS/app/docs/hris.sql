-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Aug 24, 2026 at 10:55 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `hris`
--

-- --------------------------------------------------------

--
-- Table structure for table `api_key`
--

CREATE TABLE `api_key` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `key_prefix` varchar(12) NOT NULL,
  `key_hash` varchar(255) NOT NULL,
  `scopes` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by_employee_no` varchar(20) DEFAULT NULL,
  `last_used_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `api_key`
--

INSERT INTO `api_key` (`id`, `name`, `key_prefix`, `key_hash`, `scopes`, `is_active`, `created_by_employee_no`, `last_used_at`, `expires_at`, `created_at`) VALUES
(3, 'Fleet system test', 'hris_y7mepSW', '$2b$10$DWJdodaDUDqfOrh9UdOgP.IM8vVwvtz8NnhJl75sJIRjqRjmTlWK.', 'employees:read,timesheets:read', 0, 'NRU-0002', '2026-08-24 21:35:33', NULL, '2026-08-24 19:35:25'),
(4, 'Smart Phone Tracking System', 'hris_wfvHlWr', '$2b$10$I7cRv1Byd25DWdS4F2Nxwe23asJRFWLTePh4RvxgLV5Hv42AheyEe', 'employees:read,timesheets:read', 0, 'NRU-0002', NULL, NULL, '2026-08-24 19:40:31'),
(5, 'Test Full Scope', 'hris_femEZD1', '$2b$10$0u4LauxiG1x2IsjdcXMOteS1aqKt6.47xmKZRG1rt8EWGxVlVZKHG', 'employees:read,timesheets:read,org:read,leave:read,payroll:read,certifications:read,devices:read', 0, 'NRU-0002', '2026-08-24 21:45:48', NULL, '2026-08-24 19:45:48'),
(6, 'Test Limited Scope', 'hris_L2sETgn', '$2b$10$WwgKvCEl9fgkaQt1.n0CLu69r.YDKOXwg7U9g44aOYzzJFmXLxzpe', 'employees:read', 0, 'NRU-0002', '2026-08-24 21:46:05', NULL, '2026-08-24 19:46:05'),
(7, 'Test Full Scope 2', 'hris_mJGezPZ', '$2b$10$kE2nIVG47sf9imeXZMe.quaof40vlGuepunQvQdSbd4dUzlmQS61e', 'employees:read,timesheets:read,org:read,leave:read,payroll:read,certifications:read,devices:read', 0, 'NRU-0002', '2026-08-24 21:46:20', NULL, '2026-08-24 19:46:20');

-- --------------------------------------------------------

--
-- Table structure for table `application`
--

CREATE TABLE `application` (
  `id` int(11) NOT NULL,
  `requisition_id` int(11) NOT NULL,
  `candidate_id` int(11) NOT NULL,
  `stage` enum('applied','screening','interview','offer','hired','rejected') NOT NULL DEFAULT 'applied',
  `applied_at` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `application`
--

INSERT INTO `application` (`id`, `requisition_id`, `candidate_id`, `stage`, `applied_at`) VALUES
(1, 1, 1, 'interview', '2026-08-06'),
(2, 1, 2, 'screening', '2026-08-08'),
(3, 2, 3, 'applied', '2026-08-10');

-- --------------------------------------------------------

--
-- Table structure for table `app_setting`
--

CREATE TABLE `app_setting` (
  `id` int(11) NOT NULL,
  `setting_key` varchar(60) NOT NULL,
  `setting_value` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `app_setting`
--

INSERT INTO `app_setting` (`id`, `setting_key`, `setting_value`) VALUES
(1, 'payroll_cutoff_day', '25'),
(2, 'leave_cycle', 'calendar_year'),
(3, 'session_lifetime_hours', '8'),
(4, 'reauth_modules', 'payroll,people,access'),
(5, 'lockout_attempts', '7'),
(6, 'lockout_window_minutes', '15'),
(7, 'org_favicon_url', '/img/branding-favicon-1787488736509.png'),
(16, 'employee_no_prefix', 'NRU'),
(17, 'employee_no_padding', '4'),
(18, 'org_name', 'United Nations and Religions World Organization');

-- --------------------------------------------------------

--
-- Table structure for table `app_user`
--

CREATE TABLE `app_user` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role_id` int(11) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `failed_attempts` int(11) NOT NULL DEFAULT 0,
  `locked_until` datetime DEFAULT NULL,
  `totp_secret` varchar(255) DEFAULT NULL,
  `totp_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `email_otp_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `mfa_enrolled_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `app_user`
--

INSERT INTO `app_user` (`id`, `employee_no`, `email`, `password_hash`, `role_id`, `is_active`, `last_login_at`, `created_at`, `updated_at`, `failed_attempts`, `locked_until`, `totp_secret`, `totp_enabled`, `email_otp_enabled`, `mfa_enrolled_at`) VALUES
(1, 'NRU-0001', 'sysadmin@nru.org', '$2b$10$xBgPqF.DzETZJcLKSFH2oe5jutiUzLf0TVhTBsmxJDrKgjP/lAONe', 5, 1, '2026-08-24 21:58:10', '2026-08-23 08:55:44', '2026-08-24 19:58:10', 0, NULL, NULL, 0, 0, NULL),
(2, 'NRU-0002', 'hr.admin@nru.org', '$2b$10$xBgPqF.DzETZJcLKSFH2oe5jutiUzLf0TVhTBsmxJDrKgjP/lAONe', 1, 1, '2026-08-24 22:27:16', '2026-08-23 08:55:44', '2026-08-24 20:27:16', 0, NULL, NULL, 0, 0, NULL),
(3, 'NRU-0003', 'finance.hod@nru.org', '$2b$10$xBgPqF.DzETZJcLKSFH2oe5jutiUzLf0TVhTBsmxJDrKgjP/lAONe', 2, 1, '2026-08-24 22:45:06', '2026-08-23 08:55:44', '2026-08-24 20:45:06', 0, NULL, NULL, 0, 0, NULL),
(4, 'NRU-0004', 'data.crm@nru.org', '$2b$10$xBgPqF.DzETZJcLKSFH2oe5jutiUzLf0TVhTBsmxJDrKgjP/lAONe', 3, 1, '2026-08-24 22:46:40', '2026-08-23 08:55:44', '2026-08-24 20:46:40', 0, NULL, NULL, 0, 0, NULL),
(5, 'NRU-0006', 'partner@nru.org', '$2b$10$xBgPqF.DzETZJcLKSFH2oe5jutiUzLf0TVhTBsmxJDrKgjP/lAONe', 6, 1, '2026-08-23 10:58:59', '2026-08-23 08:55:44', '2026-08-23 08:58:59', 0, NULL, NULL, 0, 0, NULL),
(6, 'NRU-0009', 'employee@nru.org', '$2b$10$ZTm01jw1F.APph63OxQp0ehfIV7ZCLO.qf6hzcHoXFWWkXy0KOaDu', 4, 1, '2026-08-24 22:45:06', '2026-08-23 08:55:44', '2026-08-24 20:45:06', 0, NULL, NULL, 0, 0, '2026-08-23 19:56:59');

-- --------------------------------------------------------

--
-- Table structure for table `asset_declaration`
--

CREATE TABLE `asset_declaration` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `category` enum('property','vehicle','financial_interest','gift','outside_employment','other') NOT NULL,
  `description` varchar(500) NOT NULL,
  `estimated_value` decimal(14,2) DEFAULT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'SZL',
  `acquired_at` date DEFAULT NULL,
  `declared_at` date NOT NULL,
  `status` enum('draft','submitted','reviewed','flagged') NOT NULL DEFAULT 'draft',
  `reviewed_by_employee_no` varchar(20) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `asset_declaration`
--

INSERT INTO `asset_declaration` (`id`, `employee_no`, `category`, `description`, `estimated_value`, `currency`, `acquired_at`, `declared_at`, `status`, `reviewed_by_employee_no`, `reviewed_at`, `review_note`, `created_at`, `updated_at`) VALUES
(1, 'NRU-0009', 'vehicle', '2019 Toyota Hilux, personal use', 185000.00, 'SZL', '2020-03-01', '2026-07-01', 'reviewed', 'NRU-0002', '2026-07-05 10:00:00', NULL, '2026-08-23 11:40:48', '2026-08-23 11:40:48'),
(2, 'NRU-0009', 'outside_employment', 'Weekend driving instructor, Manzini Driving School', NULL, 'SZL', NULL, '2026-07-01', 'submitted', NULL, NULL, NULL, '2026-08-23 11:40:48', '2026-08-23 11:40:48'),
(3, 'NRU-0004', 'financial_interest', 'Minority shareholder, family trading company', 40000.00, 'SZL', '2018-01-01', '2026-07-01', 'reviewed', 'NRU-0002', '2026-07-05 10:00:00', NULL, '2026-08-23 11:40:48', '2026-08-23 11:40:48'),
(4, 'NRU-0012', 'gift', 'Conference gift hamper from National Payroll Tax Service', 800.00, 'SZL', '2026-06-10', '2026-07-01', 'flagged', 'NRU-0002', '2026-07-05 10:00:00', 'Value appears above the routine-gift threshold — following up with declarant.', '2026-08-23 11:40:48', '2026-08-23 11:40:48'),
(5, 'NRU-0007', 'property', 'Residential plot, Ezulwini', 260000.00, 'SZL', '2015-11-20', '2026-07-01', 'reviewed', 'NRU-0002', '2026-07-05 10:00:00', NULL, '2026-08-23 11:40:48', '2026-08-23 11:40:48');

-- --------------------------------------------------------

--
-- Table structure for table `audit_event`
--

CREATE TABLE `audit_event` (
  `id` bigint(20) NOT NULL,
  `actor_employee_no` varchar(20) DEFAULT NULL,
  `action` varchar(60) NOT NULL,
  `entity_type` varchar(60) NOT NULL,
  `entity_id` varchar(60) DEFAULT NULL,
  `before_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`before_json`)),
  `after_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`after_json`)),
  `at` datetime NOT NULL DEFAULT current_timestamp(),
  `ip` varchar(60) DEFAULT NULL,
  `consumer` varchar(60) NOT NULL DEFAULT 'web'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `audit_event`
--

INSERT INTO `audit_event` (`id`, `actor_employee_no`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `at`, `ip`, `consumer`) VALUES
(1, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 10:56:07', '::1', 'web'),
(2, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 10:57:06', '::1', 'web'),
(3, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 10:57:49', '::1', 'web'),
(4, 'NRU-0009', 'create', 'leave_request', '5', NULL, '{\"leave_type_id\":1,\"start_date\":\"2026-09-10\",\"end_date\":\"2026-09-11\",\"days\":2,\"reason\":\"Test request\"}', '2026-08-23 10:57:49', '::1', 'web'),
(5, 'NRU-0009', 'create', 'work_timer', '81', NULL, '{\"clock_in\":\"now\"}', '2026-08-23 10:58:44', '::1', 'web'),
(6, 'NRU-0009', 'update', 'work_timer', '81', '{\"id\":81}', '{\"clock_out\":\"now\"}', '2026-08-23 10:58:44', '::1', 'web'),
(7, 'NRU-0002', 'update', 'leave_request', '5', '{\"id\":5,\"employee_no\":\"NRU-0009\",\"leave_type_id\":1,\"start_date\":\"2026-09-10\",\"end_date\":\"2026-09-11\",\"days\":\"2.00\",\"reason\":\"Test request\",\"stage\":\"manager\",\"status\":\"pending\",\"decided_by_employee_no\":null,\"decided_at\":null,\"created_at\":\"2026-08-23 10:57:49\"}', '{\"status\":\"approved\"}', '2026-08-23 10:58:51', '::1', 'web'),
(8, 'NRU-0002', 'advance', 'payroll_run', '2', '{\"status\":\"in_review\"}', '{\"status\":\"approved_finance\"}', '2026-08-23 10:58:51', '::1', 'web'),
(9, 'NRU-0006', 'login', 'app_user', 'NRU-0006', NULL, '{\"role\":\"Partner (external)\"}', '2026-08-23 10:58:59', '::1', 'web'),
(10, 'NRU-0003', 'login', 'app_user', 'NRU-0003', NULL, '{\"role\":\"Head of Department\"}', '2026-08-23 11:00:00', '::1', 'web'),
(11, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:03:53', '::1', 'web'),
(12, 'NRU-0002', 'create', 'call_record', '4', NULL, '{\"callee_employee_no\":\"NRU-0012\"}', '2026-08-23 11:04:17', '::1', 'web'),
(13, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:05:28', '::1', 'web'),
(14, 'NRU-0002', 'create', 'training_enrollment', '17', NULL, '{\"employee_no\":\"NRU-0002\",\"course_id\":2}', '2026-08-23 11:05:30', '::1', 'web'),
(15, 'NRU-0002', 'create', 'work_timer', '82', NULL, '{\"clock_in\":\"now\"}', '2026-08-23 11:05:31', '::1', 'web'),
(16, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:06:54', '::1', 'web'),
(17, 'NRU-0002', 'update', 'work_timer', '82', '{\"id\":82}', '{\"clock_out\":\"now\"}', '2026-08-23 11:06:56', '::1', 'web'),
(18, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:09:52', '::1', 'web'),
(19, 'NRU-0003', 'login', 'app_user', 'NRU-0003', NULL, '{\"role\":\"Head of Department\"}', '2026-08-23 11:10:06', '::1', 'web'),
(20, 'NRU-0002', 'update', 'permission', '1:crm', '{\"role_id\":1,\"module\":\"crm\",\"can_create\":0,\"can_read\":1,\"can_update\":0,\"can_delete\":0,\"data_scope\":\"organisation\",\"field_classes\":\"public,internal\"}', '{\"can_create\":false,\"can_read\":false,\"can_update\":false,\"can_delete\":false,\"data_scope\":\"organisation\"}', '2026-08-23 11:10:14', '::1', 'web'),
(21, 'NRU-0002', 'update', 'permission', '1:crm', '{\"role_id\":1,\"module\":\"crm\",\"can_create\":0,\"can_read\":0,\"can_update\":0,\"can_delete\":0,\"data_scope\":\"organisation\",\"field_classes\":\"public,internal\"}', '{\"can_create\":false,\"can_read\":true,\"can_update\":false,\"can_delete\":false,\"data_scope\":\"organisation\"}', '2026-08-23 11:10:34', '::1', 'web'),
(22, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:17:39', '::1', 'web'),
(23, 'NRU-0002', 'create', 'work_timer', '83', NULL, '{\"clock_in\":\"now\"}', '2026-08-23 11:19:26', '::1', 'web'),
(24, 'NRU-0002', 'update', 'performance_review', '14', '{\"id\":14,\"cycle_id\":2,\"employee_no\":\"NRU-0013\",\"reviewer_employee_no\":\"NRU-0002\",\"self_rating\":null,\"manager_rating\":null,\"status\":\"not_started\",\"comments\":null}', '{\"manager_rating\":2.4,\"comments\":null,\"status\":\"completed\"}', '2026-08-23 11:22:58', '::1', 'web'),
(25, 'NRU-0002', 'create', 'call_record', '5', NULL, '{\"callee_employee_no\":\"NRU-0011\"}', '2026-08-23 11:25:34', '::1', 'web'),
(26, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:31:25', '::1', 'web'),
(27, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:32:16', '::1', 'web'),
(28, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:33:16', '::1', 'web'),
(29, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:33:44', '::1', 'web'),
(30, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:34:47', '::1', 'web'),
(31, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:35:23', '::1', 'web'),
(32, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:37:04', '::1', 'web'),
(33, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 11:43:51', '::ffff:127.0.0.1', 'web'),
(34, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:33:47', '::1', 'web'),
(35, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:33:56', '::1', 'web'),
(36, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:41:19', '::1', 'web'),
(37, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 13:41:21', '::1', 'web'),
(38, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:42:28', '::1', 'web'),
(39, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 13:42:30', '::1', 'web'),
(40, 'NRU-0009', 'update', 'person', 'NRU-0009', '{\"employee_no\":\"NRU-0009\",\"full_legal_name\":\"Andile Ngwenya\",\"preferred_name\":\"Andile\",\"national_id\":null,\"date_of_birth\":\"1995-04-16\",\"gender\":\"Male\",\"nationality\":\"Liswati\",\"marital_status\":\"Married\",\"languages\":\"siSwati, English\",\"email\":\"employee@nru.org\",\"phone\":\"+268 241009\",\"address\":\"Plot 109, Mbabane\",\"next_of_kin_name\":\"Next of Kin Andile\",\"next_of_kin_relationship\":\"Spouse\",\"next_of_kin_phone\":\"+268 762009\",\"photo_url\":null,\"status\":\"active\",\"created_at\":\"2026-08-23 10:55:44\",\"updated_at\":\"2026-08-23 10:55:44\"}', '{\"full_legal_name\":\"Hacked Own Name\"}', '2026-08-23 13:42:31', '::1', 'web'),
(41, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 13:43:12', '::1', 'web'),
(42, 'NRU-0009', 'update', 'person', 'NRU-0009', '{\"employee_no\":\"NRU-0009\",\"full_legal_name\":\"Hacked Own Name\",\"preferred_name\":\"Andile\",\"national_id\":null,\"date_of_birth\":\"1995-04-16\",\"gender\":\"Male\",\"nationality\":\"Liswati\",\"marital_status\":\"Married\",\"languages\":\"siSwati, English\",\"email\":\"employee@nru.org\",\"phone\":\"+268 241009\",\"address\":\"Plot 109, Mbabane\",\"next_of_kin_name\":\"Next of Kin Andile\",\"next_of_kin_relationship\":\"Spouse\",\"next_of_kin_phone\":\"+268 762009\",\"photo_url\":null,\"status\":\"active\",\"created_at\":\"2026-08-23 10:55:44\",\"updated_at\":\"2026-08-23 13:42:31\"}', '{\"gender\":\"Test\"}', '2026-08-23 13:43:12', '::1', 'web'),
(43, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 13:43:46', '::1', 'web'),
(44, 'NRU-0009', 'update', 'person', 'NRU-0009', '{\"employee_no\":\"NRU-0009\",\"full_legal_name\":\"Hacked Own Name\",\"preferred_name\":\"Andile\",\"national_id\":null,\"date_of_birth\":\"1995-04-16\",\"gender\":\"Test\",\"nationality\":\"Liswati\",\"marital_status\":\"Married\",\"languages\":\"siSwati, English\",\"email\":\"employee@nru.org\",\"phone\":\"+268 241009\",\"address\":\"Plot 109, Mbabane\",\"next_of_kin_name\":\"Next of Kin Andile\",\"next_of_kin_relationship\":\"Spouse\",\"next_of_kin_phone\":\"+268 762009\",\"photo_url\":null,\"status\":\"active\",\"created_at\":\"2026-08-23 10:55:44\",\"updated_at\":\"2026-08-23 13:43:12\"}', '{\"phone\":\"+268 7999 0000\"}', '2026-08-23 13:43:46', '::1', 'web'),
(45, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:43:58', '::1', 'web'),
(46, 'NRU-0002', 'update', 'person', 'NRU-0009', '{\"employee_no\":\"NRU-0009\",\"full_legal_name\":\"Hacked Own Name\",\"preferred_name\":\"Andile\",\"national_id\":null,\"date_of_birth\":\"1995-04-16\",\"gender\":\"Test\",\"nationality\":\"Liswati\",\"marital_status\":\"Married\",\"languages\":\"siSwati, English\",\"email\":\"employee@nru.org\",\"phone\":\"+268 7999 0000\",\"address\":\"Plot 109, Mbabane\",\"next_of_kin_name\":\"Next of Kin Andile\",\"next_of_kin_relationship\":\"Spouse\",\"next_of_kin_phone\":\"+268 762009\",\"photo_url\":null,\"status\":\"active\",\"created_at\":\"2026-08-23 10:55:44\",\"updated_at\":\"2026-08-23 13:43:46\"}', '{\"full_legal_name\":\"Andile Ngwenya\",\"gender\":\"Male\",\"phone\":\"+268 241009\"}', '2026-08-23 13:43:58', '::1', 'web'),
(47, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:44:10', '::1', 'web'),
(48, 'NRU-0002', 'update', 'person', 'NRU-0009', '{\"photo_url\":null}', '{\"photo_url\":\"/uploads/NRU-0009-1787485451096.png\"}', '2026-08-23 13:44:11', '::1', 'web'),
(49, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 13:44:11', '::1', 'web'),
(50, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:44:54', '::1', 'web'),
(51, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:48:28', '::1', 'web'),
(52, 'NRU-0002', 'create', 'payroll_run', '3', NULL, '{\"period\":\"2099-01\"}', '2026-08-23 13:48:28', '::1', 'web'),
(53, 'NRU-0002', 'create', 'payline', '3', NULL, '{\"added\":16}', '2026-08-23 13:48:50', '::1', 'web'),
(54, 'NRU-0002', 'delete', 'payroll_run', '3', '{\"id\":3,\"period\":\"2099-01\",\"status\":\"draft\",\"cutoff_date\":null,\"created_by_employee_no\":\"NRU-0002\",\"approved_finance_by\":null,\"approved_finance_at\":null,\"approved_ed_by\":null,\"approved_ed_at\":null,\"paid_at\":null,\"created_at\":\"2026-08-23 13:48:28\"}', NULL, '2026-08-23 13:48:50', '::1', 'web'),
(55, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:53:03', '::1', 'web'),
(56, 'NRU-0002', 'create', 'benefit_plan', '5', NULL, '{\"name\":\"Test Plan\",\"kind\":\"Test\",\"cost_per_person\":10}', '2026-08-23 13:53:04', '::1', 'web'),
(57, 'NRU-0002', 'update', 'benefit_plan', '5', '{\"id\":5,\"name\":\"Test Plan\",\"kind\":\"Test\",\"cost_per_person\":\"10.00\",\"note\":null}', '{\"cost_per_person\":20}', '2026-08-23 13:53:04', '::1', 'web'),
(58, 'NRU-0002', 'delete', 'benefit_plan', '5', '{\"id\":5,\"name\":\"Test Plan\",\"kind\":\"Test\",\"cost_per_person\":\"20.00\",\"note\":null}', NULL, '2026-08-23 13:53:04', '::1', 'web'),
(59, 'NRU-0002', 'update', 'person', 'NRU-0015', '{\"photo_url\":null}', '{\"photo_url\":\"/uploads/NRU-0015-1787485991182.png\"}', '2026-08-23 13:53:11', '::1', 'web'),
(60, 'NRU-0002', 'create', 'training_course', '5', NULL, '{\"name\":\"Test Course\",\"provider\":\"X\",\"category\":\"Y\",\"is_certification\":false}', '2026-08-23 13:53:17', '::1', 'web'),
(61, 'NRU-0002', 'update', 'training_course', '5', '{\"id\":5,\"name\":\"Test Course\",\"provider\":\"X\",\"category\":\"Y\",\"is_certification\":0,\"validity_months\":null}', '{\"provider\":\"Updated Provider\"}', '2026-08-23 13:53:17', '::1', 'web'),
(62, 'NRU-0002', 'delete', 'training_course', '5', '{\"id\":5,\"name\":\"Test Course\",\"provider\":\"Updated Provider\",\"category\":\"Y\",\"is_certification\":0,\"validity_months\":null}', NULL, '2026-08-23 13:53:17', '::1', 'web'),
(63, 'NRU-0002', 'create', 'succession_plan', '3', NULL, '{\"position_title\":\"Test Position\",\"risk\":\"low\"}', '2026-08-23 13:53:18', '::1', 'web'),
(64, 'NRU-0002', 'create', 'successor_candidate', '3', NULL, '{\"employee_no\":\"NRU-0012\",\"readiness\":\"ready_now\"}', '2026-08-23 13:53:19', '::1', 'web'),
(65, 'NRU-0002', 'delete', 'successor_candidate', '3', '{\"id\":3,\"succession_plan_id\":3,\"employee_no\":\"NRU-0012\",\"readiness\":\"ready_now\"}', NULL, '2026-08-23 13:53:19', '::1', 'web'),
(66, 'NRU-0002', 'delete', 'succession_plan', '3', '{\"id\":3,\"position_title\":\"Test Position\",\"org_unit_id\":null,\"incumbent_employee_no\":null,\"risk\":\"low\",\"note\":null}', NULL, '2026-08-23 13:53:19', '::1', 'web'),
(67, 'NRU-0002', 'create', 'leave_type', '7', NULL, '{\"name\":\"Test Leave\",\"annual_entitlement_days\":5,\"paid\":true}', '2026-08-23 13:53:19', '::1', 'web'),
(68, 'NRU-0002', 'update', 'leave_type', '7', '{\"id\":7,\"name\":\"Test Leave\",\"annual_entitlement_days\":\"5.00\",\"paid\":1}', '{\"annual_entitlement_days\":7}', '2026-08-23 13:53:19', '::1', 'web'),
(69, 'NRU-0002', 'delete', 'leave_type', '7', '{\"id\":7,\"name\":\"Test Leave\",\"annual_entitlement_days\":\"7.00\",\"paid\":1}', NULL, '2026-08-23 13:53:19', '::1', 'web'),
(70, 'NRU-0002', 'create', 'training_course', '6', NULL, '{\"name\":\"Test Course 2\",\"is_certification\":false}', '2026-08-23 13:53:30', '::1', 'web'),
(71, 'NRU-0002', 'delete', 'training_course', '6', '{\"id\":6,\"name\":\"Test Course 2\",\"provider\":null,\"category\":null,\"is_certification\":0,\"validity_months\":null}', NULL, '2026-08-23 13:53:30', '::1', 'web'),
(72, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:53:53', '::1', 'web'),
(73, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:57:18', '::1', 'web'),
(74, 'NRU-0002', 'create', 'org_unit', '11', NULL, '{\"kind\":\"department\",\"name\":\"Test Delete Unit\",\"lead_employee_no\":null}', '2026-08-23 13:57:19', '::1', 'web'),
(75, 'NRU-0002', 'delete', 'org_unit', '11', '{\"id\":11,\"kind\":\"department\",\"name\":\"Test Delete Unit\",\"lead_employee_no\":null,\"parent_id\":null,\"cost_centre\":null,\"duty_station\":null,\"note\":null,\"created_at\":\"2026-08-23 13:57:19\",\"updated_at\":\"2026-08-23 13:57:19\"}', NULL, '2026-08-23 13:57:20', '::1', 'web'),
(76, 'NRU-0002', 'create', 'job_requisition', '3', NULL, '{\"title\":\"Test Requisition CRUD\",\"grade\":null,\"headcount\":1}', '2026-08-23 13:57:21', '::1', 'web'),
(77, 'NRU-0002', 'update', 'job_requisition', '3', '{\"id\":3,\"title\":\"Test Requisition CRUD\",\"department_org_unit_id\":null,\"grade\":null,\"status\":\"open\",\"opened_by_employee_no\":\"NRU-0002\",\"opened_at\":\"2026-08-23\",\"headcount\":1}', '{\"title\":\"Test Requisition CRUD\",\"grade\":null,\"headcount\":1,\"status\":\"on_hold\"}', '2026-08-23 13:57:23', '::1', 'web'),
(78, 'NRU-0002', 'delete', 'job_requisition', '3', '{\"id\":3,\"title\":\"Test Requisition CRUD\",\"department_org_unit_id\":null,\"grade\":null,\"status\":\"on_hold\",\"opened_by_employee_no\":\"NRU-0002\",\"opened_at\":\"2026-08-23\",\"headcount\":1}', NULL, '2026-08-23 13:57:24', '::1', 'web'),
(79, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:58:14', '::1', 'web'),
(80, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:58:29', '::1', 'web'),
(81, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:59:02', '::1', 'web'),
(82, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 13:59:03', '::1', 'web'),
(83, 'NRU-0001', 'login', 'app_user', 'NRU-0001', NULL, '{\"role\":\"System administrator\"}', '2026-08-23 13:59:33', '::1', 'web'),
(84, 'NRU-0001', 'create', 'partner_org', '4', NULL, '{\"name\":\"Test Partner CRUD\",\"type\":null,\"contact_name\":null,\"contact_phone\":null,\"agreement\":null}', '2026-08-23 13:59:34', '::1', 'web'),
(85, 'NRU-0001', 'update', 'partner_org', '4', '{\"id\":4,\"name\":\"Test Partner CRUD\",\"type\":null,\"contact_name\":null,\"contact_phone\":null,\"agreement\":null,\"status\":\"active\",\"since_year\":null}', '{\"name\":\"Test Partner CRUD\",\"type\":\"Edited Type\",\"contact_name\":null,\"contact_phone\":null,\"agreement\":null,\"status\":\"active\"}', '2026-08-23 13:59:35', '::1', 'web'),
(86, 'NRU-0001', 'delete', 'partner_org', '4', '{\"id\":4,\"name\":\"Test Partner CRUD\",\"type\":\"Edited Type\",\"contact_name\":null,\"contact_phone\":null,\"agreement\":null,\"status\":\"active\",\"since_year\":null}', NULL, '2026-08-23 13:59:35', '::1', 'web'),
(87, 'NRU-0001', 'create', 'programme', '3', NULL, '{\"name\":\"Test Programme CRUD\",\"lead_employee_no\":null,\"start_date\":null}', '2026-08-23 13:59:36', '::1', 'web'),
(88, 'NRU-0001', 'update', 'programme', '3', '{\"id\":3,\"name\":\"Test Programme CRUD\",\"lead_employee_no\":null,\"status\":\"Active\",\"start_date\":null,\"end_date\":null}', '{\"name\":\"Test Programme CRUD\",\"lead_employee_no\":\"NRU-0004\",\"start_date\":null}', '2026-08-23 13:59:37', '::1', 'web'),
(89, 'NRU-0001', 'delete', 'programme', '3', '{\"id\":3,\"name\":\"Test Programme CRUD\",\"lead_employee_no\":\"NRU-0004\",\"status\":\"Active\",\"start_date\":null,\"end_date\":null}', NULL, '2026-08-23 13:59:37', '::1', 'web'),
(90, 'NRU-0001', 'create', 'feed', '3', NULL, '{\"source_name\":\"Test Feed CRUD\",\"transport\":\"api_pull\",\"cadence\":null}', '2026-08-23 13:59:39', '::1', 'web'),
(91, 'NRU-0001', 'update', 'feed', '3', '{\"id\":3,\"source_name\":\"Test Feed CRUD\",\"transport\":\"api_pull\",\"cadence\":null,\"field_map\":null,\"owner_employee_no\":null,\"status\":\"healthy\",\"last_run_at\":null}', '{\"source_name\":\"Test Feed CRUD\",\"transport\":\"api_pull\",\"cadence\":null,\"status\":\"degraded\"}', '2026-08-23 13:59:39', '::1', 'web'),
(92, 'NRU-0001', 'delete', 'feed', '3', '{\"id\":3,\"source_name\":\"Test Feed CRUD\",\"transport\":\"api_pull\",\"cadence\":null,\"field_map\":null,\"owner_employee_no\":null,\"status\":\"degraded\",\"last_run_at\":null}', NULL, '2026-08-23 13:59:40', '::1', 'web'),
(93, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 14:00:00', '::1', 'web'),
(94, 'NRU-0002', 'create', 'review_cycle', '3', NULL, '{\"name\":\"Test Cycle CRUD\",\"period\":\"2099\",\"start_date\":null,\"end_date\":null}', '2026-08-23 14:00:01', '::1', 'web'),
(95, 'NRU-0002', 'create', 'performance_review', '21', NULL, '{\"cycle_id\":3,\"employee_no\":\"NRU-0010\",\"reviewer_employee_no\":null}', '2026-08-23 14:00:02', '::1', 'web'),
(96, 'NRU-0002', 'delete', 'review_cycle', '3', '{\"id\":3,\"name\":\"Test Cycle CRUD\",\"period\":\"2099\",\"status\":\"open\",\"start_date\":null,\"end_date\":null}', NULL, '2026-08-23 14:00:02', '::1', 'web'),
(97, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 14:00:20', '::1', 'web'),
(98, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 14:00:36', '::1', 'web'),
(99, 'NRU-0002', 'update', 'candidate', '3', '{\"id\":3,\"full_name\":\"Gcina Mamba\",\"email\":\"gcina.m@example.com\",\"phone\":\"+268 7633 4455\",\"resume_url\":null,\"source\":\"Job board\"}', '{\"full_name\":\"Gcina Mamba Verified\"}', '2026-08-23 14:00:58', '::1', 'web'),
(100, 'NRU-0002', 'update', 'candidate', '3', '{\"id\":3,\"full_name\":\"Gcina Mamba Verified\",\"email\":\"gcina.m@example.com\",\"phone\":\"+268 7633 4455\",\"resume_url\":null,\"source\":\"Job board\"}', '{\"full_name\":\"Gcina Mamba\"}', '2026-08-23 14:00:58', '::1', 'web'),
(101, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 14:01:11', '::1', 'web'),
(102, 'NRU-0001', 'login', 'app_user', 'NRU-0001', NULL, '{\"role\":\"System administrator\"}', '2026-08-23 14:03:32', '::1', 'web'),
(103, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 14:04:02', '::1', 'web'),
(104, 'NRU-0002', 'update', 'work_timer', '83', '{\"id\":83}', '{\"clock_out\":\"now\"}', '2026-08-23 14:19:20', '::1', 'web'),
(105, 'NRU-0002', 'create', 'org_unit', '12', NULL, '{\"kind\":\"department\",\"name\":\"Executive Committee\",\"lead_employee_no\":null}', '2026-08-23 14:23:15', '::1', 'web'),
(106, 'NRU-0002', 'delete', 'org_unit', '12', '{\"id\":12,\"kind\":\"department\",\"name\":\"Executive Committee\",\"lead_employee_no\":null,\"parent_id\":null,\"cost_centre\":null,\"duty_station\":null,\"note\":null,\"created_at\":\"2026-08-23 14:23:15\",\"updated_at\":\"2026-08-23 14:23:15\"}', NULL, '2026-08-23 14:23:37', '::1', 'web'),
(107, 'NRU-0002', 'create', 'org_unit', '14', NULL, '{\"kind\":\"committee\",\"name\":\"Executive Committee\",\"lead_employee_no\":null}', '2026-08-23 14:24:21', '::1', 'web'),
(108, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 14:37:48', '::1', 'web'),
(109, 'NRU-0002', 'create', 'role', '7', NULL, '{\"name\":\"Test Coordinator\",\"description\":\"Temporary role created by automated test\"}', '2026-08-23 14:37:50', '::1', 'web'),
(110, 'NRU-0002', 'create', 'app_user', '7', NULL, '{\"employee_no\":\"NRU-0007\",\"email\":\"musa.fakudze@nru.org\",\"role_id\":4}', '2026-08-23 14:37:51', '::1', 'web'),
(111, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 14:38:08', '::1', 'web'),
(112, 'NRU-0002', 'delete', 'app_user', '7', '{\"id\":7,\"employee_no\":\"NRU-0007\",\"email\":\"musa.fakudze@nru.org\",\"role_id\":4,\"is_active\":1,\"last_login_at\":null,\"created_at\":\"2026-08-23 14:37:51\",\"updated_at\":\"2026-08-23 14:37:51\"}', NULL, '2026-08-23 14:38:17', '::1', 'web'),
(113, 'NRU-0002', 'delete', 'role', '7', '{\"id\":7,\"name\":\"Test Coordinator\",\"description\":\"Temporary role created by automated test\"}', NULL, '2026-08-23 14:38:17', '::1', 'web'),
(114, 'NRU-0002', 'update', 'app_setting', 'org_favicon_url', NULL, '{\"url\":\"/img/branding-favicon-1787488706293.ico\"}', '2026-08-23 14:38:26', '::1', 'web'),
(115, 'NRU-0002', 'update', 'app_setting', 'org_favicon_url', '{\"setting_value\":\"/img/branding-favicon-1787488706293.ico\"}', '{\"url\":\"/img/branding-favicon-1787488736509.png\"}', '2026-08-23 14:38:56', '::1', 'web'),
(116, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 14:41:33', '::1', 'web'),
(117, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 14:42:01', '::1', 'web'),
(118, 'NRU-0002', 'delete', 'org_unit', '14', '{\"id\":14,\"kind\":\"committee\",\"name\":\"Executive Committee\",\"lead_employee_no\":null,\"parent_id\":null,\"cost_centre\":null,\"duty_station\":null,\"note\":null,\"created_at\":\"2026-08-23 14:24:21\",\"updated_at\":\"2026-08-23 14:24:21\"}', NULL, '2026-08-23 14:42:13', '::1', 'web'),
(119, 'NRU-0002', 'update', 'app_setting', 'bulk', NULL, '{\"payroll_cutoff_day\":\"25\",\"leave_cycle\":\"calendar_year\",\"session_lifetime_hours\":\"8\",\"reauth_modules\":\"payroll,people,access\",\"lockout_attempts\":\"7\",\"lockout_window_minutes\":\"15\"}', '2026-08-23 14:45:20', '::1', 'web'),
(120, 'NRU-0001', 'login', 'app_user', 'NRU-0001', NULL, '{\"role\":\"System administrator\"}', '2026-08-23 14:50:53', '::1', 'web'),
(121, 'NRU-0001', 'create', 'succession_plan', '4', NULL, '{\"position_title\":\"TEST Regional Lead\",\"org_unit_id\":3,\"incumbent_employee_no\":\"NRU-0009\",\"risk\":\"high\",\"note\":null}', '2026-08-23 14:50:54', '::1', 'web'),
(122, 'NRU-0001', 'create', 'feed', '4', NULL, '{\"source_name\":\"TEST Feed Source\",\"transport\":\"sftp\",\"cadence\":null,\"owner_employee_no\":\"NRU-0009\"}', '2026-08-23 14:50:55', '::1', 'web'),
(123, 'NRU-0001', 'create', 'job_requisition', '4', NULL, '{\"title\":\"TEST Analyst\",\"department_org_unit_id\":3,\"grade\":null,\"headcount\":1}', '2026-08-23 14:50:56', '::1', 'web'),
(124, 'NRU-0001', 'create', 'partner_org', '5', NULL, '{\"name\":\"TEST Partner Org\",\"type\":null,\"contact_name\":null,\"contact_phone\":null,\"agreement\":null,\"status\":\"renewal_due\",\"since_year\":2022}', '2026-08-23 14:50:58', '::1', 'web'),
(125, 'NRU-0001', 'create', 'programme', '4', NULL, '{\"name\":\"TEST Programme\",\"lead_employee_no\":\"NRU-0009\",\"status\":\"Active\",\"start_date\":null,\"end_date\":\"2027-01-01\"}', '2026-08-23 14:50:59', '::1', 'web'),
(126, 'NRU-0001', 'create', 'org_unit', '15', NULL, '{\"kind\":\"department\",\"name\":\"TEST Unit\",\"lead_employee_no\":null,\"parent_id\":null,\"cost_centre\":\"CC-9999\",\"duty_station\":\"Testville\",\"note\":null}', '2026-08-23 14:51:00', '::1', 'web'),
(127, 'NRU-0001', 'login', 'app_user', 'NRU-0001', NULL, '{\"role\":\"System administrator\"}', '2026-08-23 14:51:37', '::1', 'web'),
(128, 'NRU-0001', 'delete', 'succession_plan', '4', '{\"id\":4,\"position_title\":\"TEST Regional Lead\",\"org_unit_id\":3,\"incumbent_employee_no\":\"NRU-0009\",\"risk\":\"high\",\"note\":null}', NULL, '2026-08-23 14:52:15', '::1', 'web'),
(129, 'NRU-0001', 'delete', 'feed', '4', '{\"id\":4,\"source_name\":\"TEST Feed Source\",\"transport\":\"sftp\",\"cadence\":null,\"field_map\":null,\"owner_employee_no\":\"NRU-0009\",\"status\":\"healthy\",\"last_run_at\":null}', NULL, '2026-08-23 14:52:15', '::1', 'web'),
(130, 'NRU-0001', 'delete', 'job_requisition', '4', '{\"id\":4,\"title\":\"TEST Analyst\",\"department_org_unit_id\":3,\"grade\":null,\"status\":\"open\",\"opened_by_employee_no\":\"NRU-0001\",\"opened_at\":\"2026-08-23\",\"headcount\":1}', NULL, '2026-08-23 14:52:15', '::1', 'web'),
(131, 'NRU-0001', 'delete', 'partner_org', '5', '{\"id\":5,\"name\":\"TEST Partner Org\",\"type\":null,\"contact_name\":null,\"contact_phone\":null,\"agreement\":null,\"status\":\"renewal_due\",\"since_year\":2022}', NULL, '2026-08-23 14:52:15', '::1', 'web'),
(132, 'NRU-0001', 'delete', 'programme', '4', '{\"id\":4,\"name\":\"TEST Programme\",\"lead_employee_no\":\"NRU-0009\",\"status\":\"Active\",\"start_date\":null,\"end_date\":\"2027-01-01\"}', NULL, '2026-08-23 14:52:15', '::1', 'web'),
(133, 'NRU-0001', 'delete', 'org_unit', '15', '{\"id\":15,\"kind\":\"department\",\"name\":\"TEST Unit\",\"lead_employee_no\":null,\"parent_id\":null,\"cost_centre\":\"CC-9999\",\"duty_station\":\"Testville\",\"note\":null,\"created_at\":\"2026-08-23 14:51:00\",\"updated_at\":\"2026-08-23 14:51:00\"}', NULL, '2026-08-23 14:52:15', '::1', 'web'),
(134, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 14:52:49', '::1', 'web'),
(135, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 15:20:01', '::1', 'web'),
(136, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 15:20:34', '::1', 'web'),
(137, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 15:22:15', '::1', 'web'),
(138, 'NRU-0002', 'update', 'voip_extension', '9', '{\"id\":9,\"employee_no\":\"NRU-0009\",\"extension\":\"108\",\"status\":\"active\",\"sip_username\":\"andile.ngwenya\",\"sip_domain\":\"sip.nru.local\",\"voicemail_pin\":\"2370\",\"device_assigned\":\"Poly VVX 411 — Desk 9\",\"department_org_unit_id\":6,\"emergency_number\":\"+268 999 (Police) / +268 933 (Fire & Amb\",\"forward_on_busy_to\":null,\"out_of_office_enabled\":0,\"out_of_office_target\":null,\"hunt_group\":null}', '{\"extension\":\"108\",\"department_org_unit_id\":6,\"device_assigned\":\"Poly VVX 411 — Desk 9\",\"emergency_number\":\"+268 999 (Police) / +268 933 (Fire & Amb\",\"sip_username\":\"andile.ngwenya\",\"sip_domain\":\"sip.nru.local\",\"voicemail_pin\":\"2370\",\"status\":\"forwarded\",\"forward_on_busy_to\":\"100\",\"out_of_office_enabled\":false,\"out_of_office_target\":null,\"hunt_group\":null}', '2026-08-23 15:22:17', '::1', 'web'),
(139, 'NRU-0002', 'update', 'voip_extension', '9', '{\"id\":9,\"employee_no\":\"NRU-0009\",\"extension\":\"108\",\"status\":\"forwarded\",\"sip_username\":\"andile.ngwenya\",\"sip_domain\":\"sip.nru.local\",\"voicemail_pin\":\"2370\",\"device_assigned\":\"Poly VVX 411 — Desk 9\",\"department_org_unit_id\":6,\"emergency_number\":\"+268 999 (Police) / +268 933 (Fire & Amb\",\"forward_on_busy_to\":\"100\",\"out_of_office_enabled\":0,\"out_of_office_target\":null,\"hunt_group\":null}', '{\"status\":\"active\",\"forward_on_busy_to\":null}', '2026-08-23 15:22:35', '::1', 'web'),
(140, 'NRU-0002', 'create', 'role', '8', NULL, '{\"name\":\"System Analyst\",\"description\":\"Analyzes Company systems and audit them\"}', '2026-08-23 15:23:32', '::1', 'web'),
(141, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 16:58:14', '::1', 'web'),
(142, 'NRU-0002', 'update', 'person', 'NRU-0009', '{\"employee_no\":\"NRU-0009\",\"full_legal_name\":\"Andile Ngwenya\",\"preferred_name\":\"Andile\",\"national_id\":null,\"date_of_birth\":\"1995-04-16\",\"gender\":\"Male\",\"nationality\":\"Liswati\",\"marital_status\":\"Married\",\"languages\":\"siSwati, English\",\"email\":\"employee@nru.org\",\"phone\":\"+268 241009\",\"address\":\"Plot 109, Mbabane\",\"next_of_kin_name\":\"Next of Kin Andile\",\"next_of_kin_relationship\":\"Spouse\",\"next_of_kin_phone\":\"+268 762009\",\"photo_url\":\"/uploads/NRU-0009-1787485451096.png\",\"status\":\"active\",\"created_at\":\"2026-08-23 10:55:44\",\"updated_at\":\"2026-08-23 13:44:11\"}', '{\"full_legal_name\":\"Andile Ngwenya\",\"preferred_name\":\"Andile\",\"email\":\"employee@nru.org\",\"phone\":\"+268 241009\",\"address\":\"Plot 109, Mbabane\",\"status\":\"on_leave\"}', '2026-08-23 16:58:16', '::1', 'web'),
(143, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 16:59:10', '::1', 'web'),
(144, 'NRU-0002', 'update', 'person', 'NRU-0009', '{\"employee_no\":\"NRU-0009\",\"full_legal_name\":\"Andile Ngwenya\",\"preferred_name\":\"Andile\",\"national_id\":null,\"date_of_birth\":\"1995-04-16\",\"gender\":\"Male\",\"nationality\":\"Liswati\",\"marital_status\":\"Married\",\"languages\":\"siSwati, English\",\"email\":\"employee@nru.org\",\"phone\":\"+268 241009\",\"address\":\"Plot 109, Mbabane\",\"next_of_kin_name\":\"Next of Kin Andile\",\"next_of_kin_relationship\":\"Spouse\",\"next_of_kin_phone\":\"+268 762009\",\"photo_url\":\"/uploads/NRU-0009-1787485451096.png\",\"status\":\"on_leave\",\"created_at\":\"2026-08-23 10:55:44\",\"updated_at\":\"2026-08-23 16:58:16\"}', '{\"status\":\"active\"}', '2026-08-23 16:59:10', '::1', 'web'),
(145, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 16:59:30', '::1', 'web'),
(146, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 17:03:00', '::1', 'web'),
(147, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 17:16:49', '::1', 'web'),
(148, 'NRU-0002', 'update', 'successor_candidate', '1', '{\"id\":1,\"succession_plan_id\":1,\"employee_no\":\"NRU-0012\",\"readiness\":\"ready_1_2yr\"}', '{\"readiness\":\"ready_now\"}', '2026-08-23 17:17:33', '::1', 'web'),
(149, 'NRU-0002', 'update', 'successor_candidate', '1', '{\"id\":1,\"succession_plan_id\":1,\"employee_no\":\"NRU-0012\",\"readiness\":\"ready_now\"}', '{\"readiness\":\"ready_1_2yr\"}', '2026-08-23 17:17:52', '::1', 'web'),
(150, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 17:20:18', '::1', 'web'),
(151, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 17:20:29', '::1', 'web'),
(152, 'NRU-0002', 'update', 'feed.sync', '2', '{\"last_run_at\":\"2026-08-18 06:00:00\"}', '{\"last_run_at\":\"now\"}', '2026-08-23 17:20:45', '::1', 'web'),
(153, 'NRU-0002', 'update', 'feed', '2', '{\"id\":2,\"source_name\":\"DHIS2 Facility Indicators\",\"transport\":\"api_pull\",\"cadence\":\"Weekly\",\"field_map\":\"{\\\"facility_code\\\":\\\"org_unit\\\",\\\"indicator\\\":\\\"indicator_name\\\"}\",\"owner_employee_no\":\"NRU-0004\",\"status\":\"healthy\",\"last_run_at\":\"2026-08-23 17:20:45\"}', '{\"field_map\":{\"src_name\":\"full_legal_name\",\"src_email\":\"email\"}}', '2026-08-23 17:20:45', '::1', 'web'),
(154, 'NRU-0004', 'login', 'app_user', 'NRU-0004', NULL, '{\"role\":\"Data & CRM officer\"}', '2026-08-23 17:21:07', '::1', 'web'),
(155, 'NRU-0002', 'create', 'permission_override', '1', NULL, '{\"employee_no\":\"NRU-0004\",\"module\":\"reports\",\"crud\":\"R\",\"reason\":\"Fork verification test - temp\",\"expires_at\":null}', '2026-08-23 17:21:47', '::1', 'web'),
(156, 'NRU-0002', 'delete', 'permission_override', '1', '{\"id\":1,\"employee_no\":\"NRU-0004\",\"module\":\"reports\",\"crud\":\"R\",\"reason\":\"Fork verification test - temp\",\"expires_at\":null,\"granted_by_employee_no\":\"NRU-0002\",\"created_at\":\"2026-08-23 17:21:47\"}', NULL, '2026-08-23 17:21:53', '::1', 'web'),
(157, 'NRU-0002', 'update', 'feed', '2', '{\"id\":2,\"source_name\":\"DHIS2 Facility Indicators\",\"transport\":\"api_pull\",\"cadence\":\"Weekly\",\"field_map\":\"{\\\"src_name\\\":\\\"full_legal_name\\\",\\\"src_email\\\":\\\"email\\\"}\",\"owner_employee_no\":\"NRU-0004\",\"status\":\"healthy\",\"last_run_at\":\"2026-08-23 17:20:45\"}', '{\"field_map\":null}', '2026-08-23 17:21:59', '::1', 'web'),
(158, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 17:22:51', '::1', 'web'),
(159, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 17:23:27', '::1', 'web'),
(160, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 17:24:46', '::1', 'web'),
(161, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 17:25:03', '::1', 'web'),
(162, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 19:04:56', '::1', 'web'),
(163, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 19:05:46', '::1', 'web'),
(164, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 19:06:54', '::1', 'web'),
(165, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 19:07:55', '::1', 'web'),
(166, 'NRU-0002', 'create', 'call_record', '6', NULL, '{\"callee_employee_no\":\"NRU-0001\"}', '2026-08-23 19:12:31', '::1', 'web'),
(167, 'NRU-0002', 'create', 'call_record', '7', NULL, '{\"callee_employee_no\":\"NRU-0009\"}', '2026-08-23 19:13:45', '::1', 'web'),
(168, 'NRU-0002', 'update', 'permission', '1:voip', '{\"role_id\":1,\"module\":\"voip\",\"can_create\":1,\"can_read\":1,\"can_update\":1,\"can_delete\":1,\"data_scope\":\"self\",\"field_classes\":\"public,internal\"}', '{\"can_create\":true,\"can_read\":true,\"can_update\":true,\"can_delete\":true,\"data_scope\":\"self\"}', '2026-08-23 19:20:07', '::1', 'web'),
(169, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 19:47:34', '::1', 'web'),
(170, 'NRU-0009', 'update', 'app_user.mfa', '6', '{\"totp_enabled\":false}', '{\"totp_enabled\":true}', '2026-08-23 19:48:00', '::1', 'web'),
(171, NULL, 'login_mfa_failed', 'app_user', 'NRU-0009', NULL, '{\"method\":\"totp\"}', '2026-08-23 19:48:14', '::1', 'web'),
(172, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\",\"mfa\":\"totp\"}', '2026-08-23 19:48:14', '::1', 'web'),
(173, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\",\"mfa\":\"backup\"}', '2026-08-23 19:48:27', '::1', 'web'),
(174, NULL, 'login_mfa_failed', 'app_user', 'NRU-0009', NULL, '{\"method\":\"backup\"}', '2026-08-23 19:48:28', '::1', 'web'),
(175, 'NRU-0004', 'login', 'app_user', 'NRU-0004', NULL, '{\"role\":\"Data & CRM officer\"}', '2026-08-23 19:48:42', '::1', 'web'),
(176, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 19:56:58', '::1', 'web'),
(177, 'NRU-0009', 'update', 'app_user.mfa', '6', '{\"totp_enabled\":false}', '{\"totp_enabled\":true}', '2026-08-23 19:56:59', '::1', 'web'),
(178, 'NRU-0002', 'update', 'app_user.mfa', '2', '{\"totp_enabled\":false}', '{\"totp_enabled\":true}', '2026-08-23 19:57:28', '::1', 'web'),
(179, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\",\"mfa\":\"totp\"}', '2026-08-23 19:57:30', '::1', 'web'),
(180, 'NRU-0009', 'update', 'app_user.mfa', '6', '{\"email_otp_enabled\":false}', '{\"email_otp_enabled\":true}', '2026-08-23 19:57:33', '::1', 'web'),
(181, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 19:59:20', '::1', 'web'),
(182, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\",\"mfa\":\"totp\"}', '2026-08-23 19:59:22', '::1', 'web'),
(183, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 20:05:58', '::1', 'web'),
(184, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 20:12:21', '::1', 'web'),
(185, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\",\"mfa\":\"totp\"}', '2026-08-23 20:12:21', '::1', 'web'),
(186, 'NRU-0009', 'update', 'app_user.mfa', '6', '{\"totp_enabled\":true}', '{\"totp_enabled\":false}', '2026-08-23 20:12:22', '::1', 'web'),
(187, 'NRU-0009', 'update', 'app_user.mfa', '6', '{\"email_otp_enabled\":true}', '{\"email_otp_enabled\":false}', '2026-08-23 20:12:23', '::1', 'web'),
(188, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 20:13:05', '::1', 'web'),
(189, 'NRU-0002', 'update', 'app_user.mfa', '2', '{\"totp_enabled\":false}', '{\"totp_enabled\":true}', '2026-08-23 20:53:26', '::1', 'web'),
(190, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\",\"mfa\":\"totp\"}', '2026-08-23 20:54:06', '::1', 'web'),
(191, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 21:09:33', '::1', 'web'),
(192, 'NRU-0002', 'export', 'report', 'workforce', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":16}', '2026-08-23 21:09:46', '::1', 'web'),
(193, 'NRU-0002', 'export', 'report', 'workforce', NULL, '{\"format\":\"pdf\",\"filters\":{},\"rowCount\":16}', '2026-08-23 21:09:56', '::1', 'web'),
(194, 'NRU-0002', 'export', 'report', 'workforce', NULL, '{\"format\":\"xlsx\",\"filters\":{},\"rowCount\":16}', '2026-08-23 21:09:56', '::1', 'web'),
(195, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 21:12:28', '::1', 'web'),
(196, 'NRU-0002', 'export', 'report', 'workforce', NULL, '{\"format\":\"pdf\",\"filters\":{},\"rowCount\":16}', '2026-08-23 21:12:28', '::1', 'web'),
(197, 'NRU-0002', 'create', 'saved_report', '1', NULL, '{\"name\":\"Test combo\",\"reportIds\":[\"workforce\",\"absence\"]}', '2026-08-23 21:15:41', '::1', 'web'),
(198, 'NRU-0002', 'export', 'report', 'workforce', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":16}', '2026-08-23 21:17:59', '::1', 'web'),
(199, 'NRU-0002', 'export', 'report', 'absence', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":4}', '2026-08-23 21:18:00', '::1', 'web'),
(200, 'NRU-0002', 'export', 'report', 'attendance', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":83}', '2026-08-23 21:18:00', '::1', 'web'),
(201, 'NRU-0002', 'export', 'report', 'payroll', NULL, '{\"format\":\"csv\",\"filters\":{\"period\":\"2026-08\"},\"rowCount\":16}', '2026-08-23 21:18:00', '::1', 'web'),
(202, 'NRU-0002', 'export', 'report', 'recruitment', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":3}', '2026-08-23 21:18:00', '::1', 'web'),
(203, 'NRU-0002', 'export', 'report', 'training', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":17}', '2026-08-23 21:18:00', '::1', 'web'),
(204, 'NRU-0002', 'export', 'report', 'performance', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":20}', '2026-08-23 21:18:00', '::1', 'web'),
(205, 'NRU-0002', 'export', 'report', 'benefits', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":32}', '2026-08-23 21:18:00', '::1', 'web'),
(206, 'NRU-0002', 'export', 'report', 'combined', NULL, '{\"format\":\"pdf\",\"reportIds\":[\"workforce\",\"absence\",\"payroll\"],\"rowCount\":36}', '2026-08-23 21:18:12', '::1', 'web'),
(207, 'NRU-0002', 'delete', 'saved_report', '1', '{\"id\":1,\"name\":\"Test combo\"}', NULL, '2026-08-23 21:18:12', '::1', 'web'),
(208, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 21:18:23', '::1', 'web'),
(209, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 21:18:58', '::1', 'web'),
(210, 'NRU-0002', 'export', 'report', 'workforce', NULL, '{\"format\":\"csv\",\"filters\":{\"department\":\"\",\"contractType\":\"\",\"status\":\"\"},\"rowCount\":16}', '2026-08-23 21:19:00', '::1', 'web'),
(211, 'NRU-0002', 'export', 'report', 'combined', NULL, '{\"format\":\"pdf\",\"reportIds\":[\"workforce\",\"absence\"],\"rowCount\":20}', '2026-08-23 21:19:00', '::1', 'web'),
(212, 'NRU-0002', 'create', 'saved_report', '2', NULL, '{\"name\":\"Playwright test combo\",\"reportIds\":[\"workforce\",\"absence\"]}', '2026-08-23 21:19:01', '::1', 'web'),
(213, 'NRU-0002', 'delete', 'saved_report', '2', '{\"id\":2,\"name\":\"Playwright test combo\"}', NULL, '2026-08-23 21:19:01', '::1', 'web'),
(214, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 21:19:03', '::1', 'web'),
(215, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 21:19:31', '::1', 'web'),
(216, 'NRU-0003', 'login', 'app_user', 'NRU-0003', NULL, '{\"role\":\"Head of Department\"}', '2026-08-23 21:20:15', '::1', 'web'),
(217, 'NRU-0003', 'export', 'report', 'workforce', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":2}', '2026-08-23 21:20:16', '::1', 'web'),
(218, 'NRU-0002', 'export', 'report', 'workforce', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":16}', '2026-08-23 21:20:16', '::1', 'web'),
(219, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 21:21:38', '::1', 'web'),
(220, 'NRU-0002', 'export', 'report', 'combined', NULL, '{\"format\":\"pdf\",\"reportIds\":[\"workforce\",\"absence\"],\"rowCount\":20}', '2026-08-23 21:31:30', '::1', 'web'),
(221, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 21:33:57', '::1', 'web'),
(222, 'NRU-0002', 'export', 'report', 'workforce', NULL, '{\"format\":\"pdf\",\"filters\":{},\"rowCount\":16}', '2026-08-23 21:33:57', '::1', 'web'),
(223, 'NRU-0002', 'export', 'report', 'succession', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":2}', '2026-08-23 21:37:55', '::1', 'web'),
(224, 'NRU-0002', 'export', 'report', 'certifications', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":4}', '2026-08-23 21:37:55', '::1', 'web'),
(225, 'NRU-0002', 'export', 'report', 'partners', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":3}', '2026-08-23 21:37:55', '::1', 'web'),
(226, 'NRU-0002', 'export', 'report', 'programme_indicators', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":2}', '2026-08-23 21:37:55', '::1', 'web'),
(227, 'NRU-0002', 'export', 'report', 'voip_activity', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":7}', '2026-08-23 21:37:55', '::1', 'web'),
(228, 'NRU-0002', 'export', 'report', 'asset_declarations', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":5}', '2026-08-23 21:37:55', '::1', 'web'),
(229, 'NRU-0002', 'export', 'report', 'data_feeds', NULL, '{\"format\":\"csv\",\"filters\":{},\"rowCount\":2}', '2026-08-23 21:37:55', '::1', 'web'),
(230, 'NRU-0002', 'export', 'report', 'asset_declarations', NULL, '{\"format\":\"pdf\",\"filters\":{\"department\":\"\",\"category\":\"\",\"status\":\"\"},\"rowCount\":5}', '2026-08-23 21:45:43', '::1', 'web'),
(231, 'NRU-0002', 'update', 'permission', '1:reports', '{\"role_id\":1,\"module\":\"reports\",\"can_create\":0,\"can_read\":1,\"can_update\":0,\"can_delete\":0,\"data_scope\":\"organisation\",\"field_classes\":\"internal\"}', '{\"can_create\":true,\"can_read\":true,\"can_update\":true,\"can_delete\":true,\"data_scope\":\"organisation\"}', '2026-08-23 21:47:40', '::1', 'web'),
(232, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 21:57:59', '::1', 'web'),
(233, 'NRU-0002', 'create', 'person', 'NRU-0017', NULL, '{\"full_legal_name\":\"Test AutoNumber Person\",\"status\":\"active\"}', '2026-08-23 21:57:59', '::1', 'web'),
(234, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 21:59:08', '::1', 'web'),
(235, 'NRU-0002', 'update', 'app_setting', 'bulk', NULL, '{\"org_name\":\"Acme Test Organization\"}', '2026-08-23 21:59:09', '::1', 'web'),
(236, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 21:59:44', '::1', 'web'),
(237, 'NRU-0002', 'update', 'app_setting', 'bulk', NULL, '{\"org_name\":\"United Nations and Religions World\"}', '2026-08-23 22:03:40', '::1', 'web'),
(238, 'NRU-0002', 'update', 'app_setting', 'bulk', NULL, '{\"org_name\":\"United Nations and Religions World Organization\"}', '2026-08-23 22:03:54', '::1', 'web'),
(239, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:06:51', '::1', 'web'),
(240, 'NRU-0002', 'export', 'report', 'workforce', NULL, '{\"format\":\"pdf\",\"filters\":{},\"rowCount\":16}', '2026-08-23 22:06:51', '::1', 'web'),
(241, 'NRU-0002', 'export', 'report', 'combined', NULL, '{\"format\":\"pdf\",\"reportIds\":[\"workforce\",\"absence\",\"payroll\"],\"rowCount\":36}', '2026-08-23 22:06:51', '::1', 'web'),
(242, 'NRU-0002', 'create', 'call_record', '8', NULL, '{\"callee_employee_no\":\"NRU-0004\"}', '2026-08-23 22:10:58', '::1', 'web'),
(243, 'NRU-0002', 'advance', 'payroll_run', '1', '{\"status\":\"paid\"}', '{\"status\":\"closed\"}', '2026-08-23 22:12:30', '::ffff:127.0.0.1', 'web'),
(244, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:12:49', '::1', 'web'),
(245, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 22:12:52', '::1', 'web'),
(246, 'NRU-0002', 'update', 'performance_review', '2', '{\"id\":2,\"cycle_id\":2,\"employee_no\":\"NRU-0004\",\"reviewer_employee_no\":\"NRU-0002\",\"self_rating\":null,\"manager_rating\":null,\"status\":\"not_started\",\"comments\":null}', '{\"manager_rating\":3,\"comments\":null,\"status\":\"completed\"}', '2026-08-23 22:13:47', '::1', 'web'),
(247, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:15:33', '::1', 'web'),
(248, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:17:01', '::1', 'web'),
(249, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:17:34', '::1', 'web'),
(250, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 22:17:36', '::1', 'web'),
(251, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 22:19:34', '::1', 'web'),
(252, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:19:35', '::1', 'web'),
(253, 'NRU-0003', 'login', 'app_user', 'NRU-0003', NULL, '{\"role\":\"Head of Department\"}', '2026-08-23 22:19:48', '::1', 'web'),
(254, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:20:30', '::1', 'web'),
(255, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:21:36', '::1', 'web'),
(256, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:21:55', '::1', 'web'),
(257, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 22:21:58', '::1', 'web'),
(258, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:22:38', '::1', 'web'),
(259, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:23:12', '::1', 'web'),
(260, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:23:47', '::1', 'web'),
(261, 'NRU-0002', 'update', 'person', 'NRU-0002', '{\"photo_url\":null}', '{\"photo_url\":\"/uploads/NRU-0002-1787517058335.jpeg\"}', '2026-08-23 22:30:58', '::1', 'web'),
(262, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:51:03', '::1', 'web'),
(263, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-23 22:54:55', '::1', 'web'),
(264, 'NRU-0009', 'update', 'app_user.mfa', '6', '{\"totp_enabled\":false}', '{\"totp_enabled\":true}', '2026-08-23 22:54:56', '::1', 'web'),
(265, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\",\"mfa\":\"totp\"}', '2026-08-23 22:55:54', '::1', 'web'),
(266, 'NRU-0009', 'update', 'app_user.mfa', '6', '{\"totp_enabled\":true}', '{\"totp_enabled\":false}', '2026-08-23 22:56:11', '::1', 'web'),
(267, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 22:58:28', '::1', 'web'),
(268, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 23:03:58', '::1', 'web');
INSERT INTO `audit_event` (`id`, `actor_employee_no`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `at`, `ip`, `consumer`) VALUES
(269, 'NRU-0002', 'update', 'person', 'NRU-0002', '{\"photo_url\":\"/uploads/NRU-0002-1787517058335.jpeg\"}', '{\"photo_url\":\"/uploads/NRU-0002-1787519089075.png\"}', '2026-08-23 23:04:49', '::1', 'web'),
(270, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 23:05:55', '::1', 'web'),
(271, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-23 23:08:36', '::1', 'web'),
(272, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 21:24:07', '::1', 'web'),
(273, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:30:16', '::1', 'web'),
(274, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 21:30:26', '::1', 'web'),
(275, 'NRU-0009', 'export', 'payslip', '25', NULL, '{\"period\":\"2026-08\"}', '2026-08-24 21:30:52', '::1', 'web'),
(276, 'NRU-0002', 'export', 'payslip', '18', NULL, '{\"period\":\"2026-08\"}', '2026-08-24 21:30:52', '::1', 'web'),
(277, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 21:31:56', '::1', 'web'),
(278, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:31:56', '::1', 'web'),
(279, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 21:32:01', '::1', 'web'),
(280, 'NRU-0002', 'lock', 'app_user', '6', '{\"locked_until\":null}', '{\"locked\":true}', '2026-08-24 21:32:04', '::1', 'web'),
(281, 'NRU-0002', 'unlock', 'app_user', '6', '{\"locked_until\":\"2126-08-24 21:32:04\"}', '{\"locked\":false}', '2026-08-24 21:32:04', '::1', 'web'),
(282, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:32:04', '::1', 'web'),
(283, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:32:22', '::1', 'web'),
(284, 'NRU-0002', 'lock', 'app_user', '6', '{\"locked_until\":null}', '{\"locked\":true}', '2026-08-24 21:32:22', '::1', 'web'),
(285, 'NRU-0002', 'unlock', 'app_user', '6', '{\"locked_until\":\"2126-08-24 21:32:22\"}', '{\"locked\":false}', '2026-08-24 21:32:22', '::1', 'web'),
(286, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:32:56', '::1', 'web'),
(287, 'NRU-0002', 'lock', 'app_user', '6', '{\"locked_until\":null}', '{\"locked\":true}', '2026-08-24 21:32:56', '::1', 'web'),
(288, 'NRU-0002', 'unlock', 'app_user', '6', '{\"locked_until\":\"2126-08-24 21:32:56\"}', '{\"locked\":false}', '2026-08-24 21:32:57', '::1', 'web'),
(289, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:32:57', '::1', 'web'),
(290, NULL, 'export', 'employee', 'bulk', NULL, '{\"query\":{\"status\":\"active\"},\"count\":16}', '2026-08-24 21:33:35', '::1', 'Test Fleet System'),
(291, NULL, 'export', 'timesheet', 'bulk', NULL, '{\"query\":{\"from\":\"2026-01-01\"},\"count\":83}', '2026-08-24 21:33:45', '::1', 'Test Fleet System'),
(292, NULL, 'export', 'timesheet', 'NRU-0009', NULL, '{\"query\":{},\"count\":6}', '2026-08-24 21:33:45', '::1', 'Test Fleet System'),
(293, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:34:00', '::1', 'web'),
(294, 'NRU-0002', 'lock', 'app_user', '6', '{\"locked_until\":null}', '{\"locked\":true}', '2026-08-24 21:34:00', '::1', 'web'),
(295, 'NRU-0002', 'unlock', 'app_user', '6', '{\"locked_until\":\"2126-08-24 21:34:00\"}', '{\"locked\":false}', '2026-08-24 21:34:01', '::1', 'web'),
(296, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:34:10', '::1', 'web'),
(297, 'NRU-0002', 'lock', 'app_user', '6', '{\"locked_until\":null}', '{\"locked\":true}', '2026-08-24 21:34:10', '::1', 'web'),
(298, 'NRU-0002', 'unlock', 'app_user', '6', '{\"locked_until\":\"2126-08-24 21:34:10\"}', '{\"locked\":false}', '2026-08-24 21:34:11', '::1', 'web'),
(299, 'NRU-0002', 'reset_password', 'app_user', '6', '{\"employee_no\":\"NRU-0009\"}', '{\"reset\":true}', '2026-08-24 21:34:19', '::1', 'web'),
(300, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:34:19', '::1', 'web'),
(301, 'NRU-0002', 'reset_password', 'app_user', '6', '{\"employee_no\":\"NRU-0009\"}', '{\"reset\":true}', '2026-08-24 21:34:19', '::1', 'web'),
(302, 'NRU-0002', 'create', 'api_key', '3', NULL, '{\"name\":\"Fleet system test\",\"scopes\":[\"employees:read\",\"timesheets:read\"]}', '2026-08-24 21:35:25', '::1', 'web'),
(303, NULL, 'export', 'employee', 'bulk', NULL, '{\"query\":{\"status\":\"active\"},\"count\":16}', '2026-08-24 21:35:33', '::1', 'Fleet system test'),
(304, NULL, 'export', 'timesheet', 'bulk', NULL, '{\"query\":{},\"count\":83}', '2026-08-24 21:35:33', '::1', 'Fleet system test'),
(305, 'NRU-0002', 'revoke', 'api_key', '3', '{\"is_active\":1}', '{\"is_active\":0}', '2026-08-24 21:35:41', '::1', 'web'),
(306, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 21:38:25', '::1', 'web'),
(307, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:38:30', '::1', 'web'),
(308, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:38:50', '::1', 'web'),
(309, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:39:02', '::1', 'web'),
(310, 'NRU-0002', 'update', 'feed.sync', '2', '{\"last_run_at\":\"2026-08-23 17:20:45\"}', '{\"last_run_at\":\"now\"}', '2026-08-24 21:39:02', '::1', 'web'),
(311, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:39:38', '::1', 'web'),
(312, 'NRU-0009', 'export', 'payslip', '25', NULL, '{\"period\":\"2026-08\"}', '2026-08-24 21:39:38', '::1', 'web'),
(313, 'NRU-0002', 'create', 'api_key', '4', NULL, '{\"name\":\"Smart Phone Tracking System\",\"scopes\":[\"employees:read\",\"timesheets:read\"]}', '2026-08-24 21:40:31', '::1', 'web'),
(314, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 21:40:34', '::1', 'web'),
(315, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:41:07', '::1', 'web'),
(316, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 21:41:58', '::1', 'web'),
(317, 'NRU-0002', 'revoke', 'api_key', '4', '{\"is_active\":1}', '{\"is_active\":0}', '2026-08-24 21:42:28', '::1', 'web'),
(318, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:43:27', '::1', 'web'),
(319, 'NRU-0002', 'lock', 'app_user', '6', '{\"locked_until\":null}', '{\"locked\":true}', '2026-08-24 21:43:27', '::1', 'web'),
(320, 'NRU-0002', 'unlock', 'app_user', '6', '{\"locked_until\":\"2126-08-24 21:43:27\"}', '{\"locked\":false}', '2026-08-24 21:43:27', '::1', 'web'),
(321, 'NRU-0002', 'create', 'api_key', '5', NULL, '{\"name\":\"Test Full Scope\",\"scopes\":[\"employees:read\",\"timesheets:read\",\"org:read\",\"leave:read\",\"payroll:read\",\"certifications:read\",\"devices:read\"]}', '2026-08-24 21:45:48', '::1', 'web'),
(322, NULL, 'export', 'org_unit', 'bulk', NULL, '{\"count\":10}', '2026-08-24 21:45:48', '::1', 'Test Full Scope'),
(323, NULL, 'export', 'leave_request', 'bulk', NULL, '{\"query\":{},\"count\":4}', '2026-08-24 21:45:48', '::1', 'Test Full Scope'),
(324, NULL, 'export', 'payroll_run', 'bulk', NULL, '{\"count\":2}', '2026-08-24 21:45:48', '::1', 'Test Full Scope'),
(325, NULL, 'export', 'certification', 'bulk', NULL, '{\"query\":{},\"count\":4}', '2026-08-24 21:45:48', '::1', 'Test Full Scope'),
(326, NULL, 'export', 'device', 'bulk', NULL, '{\"count\":16}', '2026-08-24 21:45:48', '::1', 'Test Full Scope'),
(327, 'NRU-0002', 'create', 'api_key', '6', NULL, '{\"name\":\"Test Limited Scope\",\"scopes\":[\"employees:read\"]}', '2026-08-24 21:46:05', '::1', 'web'),
(328, 'NRU-0002', 'revoke', 'api_key', '5', '{\"is_active\":1}', '{\"is_active\":0}', '2026-08-24 21:46:05', '::1', 'web'),
(329, 'NRU-0002', 'revoke', 'api_key', '6', '{\"is_active\":1}', '{\"is_active\":0}', '2026-08-24 21:46:06', '::1', 'web'),
(330, 'NRU-0002', 'create', 'api_key', '7', NULL, '{\"name\":\"Test Full Scope 2\",\"scopes\":[\"employees:read\",\"timesheets:read\",\"org:read\",\"leave:read\",\"payroll:read\",\"certifications:read\",\"devices:read\"]}', '2026-08-24 21:46:20', '::1', 'web'),
(331, NULL, 'export', 'payroll_run', '2', NULL, '{\"count\":16}', '2026-08-24 21:46:20', '::1', 'Test Full Scope 2'),
(332, NULL, 'export', 'certification', 'NRU-0009', NULL, '{\"count\":1}', '2026-08-24 21:46:20', '::1', 'Test Full Scope 2'),
(333, NULL, 'export', 'device', 'NRU-0009', NULL, '{}', '2026-08-24 21:46:20', '::1', 'Test Full Scope 2'),
(334, NULL, 'export', 'leave_request', 'NRU-0009', NULL, '{\"query\":{},\"count\":1}', '2026-08-24 21:46:20', '::1', 'Test Full Scope 2'),
(335, 'NRU-0002', 'revoke', 'api_key', '7', '{\"is_active\":1}', '{\"is_active\":0}', '2026-08-24 21:46:21', '::1', 'web'),
(336, 'NRU-0002', 'export', 'payslip', '2', NULL, '{\"period\":\"2026-07\"}', '2026-08-24 21:55:29', '::1', 'web'),
(337, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 21:57:45', '::1', 'web'),
(338, 'NRU-0001', 'login', 'app_user', 'NRU-0001', NULL, '{\"role\":\"System administrator\"}', '2026-08-24 21:57:45', '::1', 'web'),
(339, 'NRU-0001', 'login', 'app_user', 'NRU-0001', NULL, '{\"role\":\"System administrator\"}', '2026-08-24 21:58:10', '::1', 'web'),
(340, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 21:58:13', '::ffff:127.0.0.1', 'web'),
(341, 'NRU-0002', 'update', 'app_setting', 'bulk', NULL, '{\"employee_no_prefix\":\"NRU\",\"employee_no_padding\":\"4\"}', '2026-08-24 21:58:13', '::1', 'web'),
(342, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 22:00:08', '::1', 'web'),
(343, 'NRU-0002', 'advance', 'payroll_run', '2', '{\"status\":\"approved_finance\"}', '{\"status\":\"approved_ed\"}', '2026-08-24 22:00:15', '::1', 'web'),
(344, 'NRU-0002', 'create', 'api_key', '8', NULL, '{\"name\":\"Test Accounting Full\",\"scopes\":[\"payroll:read\",\"payroll:write\"]}', '2026-08-24 22:00:26', '::1', 'web'),
(345, NULL, 'mark_paid', 'payroll_run', '2', '{\"status\":\"approved_ed\"}', '{\"status\":\"paid\",\"payment_reference\":\"ACCT-2026-08-TEST\"}', '2026-08-24 22:00:26', '::1', 'Test Accounting Full'),
(346, 'NRU-0002', 'create', 'api_key', '9', NULL, '{\"name\":\"Test No Write\",\"scopes\":[\"payroll:read\"]}', '2026-08-24 22:01:07', '::1', 'web'),
(347, 'NRU-0002', 'revoke', 'api_key', '9', '{\"is_active\":1}', '{\"is_active\":0}', '2026-08-24 22:01:07', '::1', 'web'),
(348, 'NRU-0002', 'reactivate', 'api_key', '9', '{\"is_active\":0}', '{\"is_active\":1}', '2026-08-24 22:01:07', '::1', 'web'),
(349, NULL, 'export', 'payroll_run', 'bulk', NULL, '{\"count\":2}', '2026-08-24 22:01:07', '::1', 'Test No Write'),
(350, 'NRU-0002', 'renew', 'api_key', '9', '{\"key_prefix\":\"hris_J0BiTDk\"}', '{\"key_prefix\":\"hris_TQdvrLU\"}', '2026-08-24 22:01:07', '::1', 'web'),
(351, NULL, 'export', 'payroll_run', 'bulk', NULL, '{\"count\":2}', '2026-08-24 22:01:08', '::1', 'Test No Write'),
(352, 'NRU-0002', 'delete', 'api_key', '8', '{\"name\":\"Test Accounting Full\",\"scopes\":\"payroll:read,payroll:write\",\"is_active\":1}', NULL, '2026-08-24 22:01:08', '::1', 'web'),
(353, 'NRU-0002', 'delete', 'api_key', '9', '{\"name\":\"Test No Write\",\"scopes\":\"payroll:read\",\"is_active\":1}', NULL, '2026-08-24 22:01:08', '::1', 'web'),
(354, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 22:06:48', '::1', 'web'),
(355, 'NRU-0002', 'create', 'payroll_run', '4', NULL, '{\"period\":\"2026-10\"}', '2026-08-24 22:06:59', '::1', 'web'),
(356, 'NRU-0002', 'create', 'payline', '4', NULL, '{\"added\":16}', '2026-08-24 22:07:00', '::1', 'web'),
(357, 'NRU-0002', 'update', 'payline', '57', '{\"id\":57,\"payroll_run_id\":4,\"employee_no\":\"NRU-0009\",\"basic\":\"0.00\",\"allowances\":\"0.00\",\"overtime\":\"0.00\",\"deductions\":\"0.00\",\"net\":\"0.00\",\"bank_account\":null,\"tax_number\":null,\"run_status\":\"draft\"}', '{\"basic\":12000,\"allowances\":2100,\"overtime\":500,\"deductions\":2280,\"bank_account\":null,\"tax_number\":null,\"net\":12320}', '2026-08-24 22:07:06', '::1', 'web'),
(358, 'NRU-0002', 'export', 'payslip', '57', NULL, '{\"period\":\"2026-10\"}', '2026-08-24 22:07:14', '::1', 'web'),
(359, 'NRU-0002', 'export', 'payslip', '63', NULL, '{\"period\":\"2026-10\"}', '2026-08-24 22:08:42', '::1', 'web'),
(360, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 22:08:55', '::1', 'web'),
(361, 'NRU-0009', 'export', 'payslip', '57', NULL, '{\"period\":\"2026-10\"}', '2026-08-24 22:08:56', '::1', 'web'),
(362, 'NRU-0002', 'delete', 'payroll_run', '4', '{\"id\":4,\"period\":\"2026-10\",\"status\":\"draft\",\"cutoff_date\":null,\"created_by_employee_no\":\"NRU-0002\",\"approved_finance_by\":null,\"approved_finance_at\":null,\"approved_ed_by\":null,\"approved_ed_at\":null,\"paid_at\":null,\"created_at\":\"2026-08-24 22:06:59\",\"paid_via\":\"manual\",\"payment_reference\":null}', NULL, '2026-08-24 22:08:56', '::1', 'web'),
(363, 'NRU-0002', 'export', 'payslip', '2', NULL, '{\"period\":\"2026-07\"}', '2026-08-24 22:09:28', '::1', 'web'),
(364, 'NRU-0009', 'export', 'payslip', '25', NULL, '{\"period\":\"2026-08\"}', '2026-08-24 22:10:55', '::1', 'web'),
(365, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 22:22:50', '::1', 'web'),
(366, 'NRU-0002', 'create', 'payroll_run', '5', NULL, '{\"period\":\"2026-09\"}', '2026-08-24 22:22:50', '::1', 'web'),
(367, 'NRU-0002', 'create', 'payline', '5', NULL, '{\"added\":16}', '2026-08-24 22:23:00', '::1', 'web'),
(368, 'NRU-0002', 'bulk_adjust', 'payroll_run', '5', NULL, '{\"type\":\"increment_percent\",\"value\":5,\"target\":\"all\",\"affected\":16}', '2026-08-24 22:23:12', '::1', 'web'),
(369, 'NRU-0002', 'bulk_adjust', 'payroll_run', '5', NULL, '{\"type\":\"cola\",\"value\":500,\"mode\":\"flat\",\"label\":\"Cost of Living Adjustment 2026\",\"target\":\"department\",\"affected\":3}', '2026-08-24 22:23:28', '::1', 'web'),
(370, 'NRU-0002', 'bulk_adjust', 'payroll_run', '5', NULL, '{\"type\":\"bonus\",\"value\":1000,\"label\":\"Performance Bonus Q3\",\"target\":\"selected\",\"affected\":1}', '2026-08-24 22:23:28', '::1', 'web'),
(371, 'NRU-0002', 'delete', 'payroll_run', '5', '{\"id\":5,\"period\":\"2026-09\",\"status\":\"draft\",\"cutoff_date\":null,\"created_by_employee_no\":\"NRU-0002\",\"approved_finance_by\":null,\"approved_finance_at\":null,\"approved_ed_by\":null,\"approved_ed_at\":null,\"paid_at\":null,\"created_at\":\"2026-08-24 22:22:50\",\"paid_via\":\"manual\",\"payment_reference\":null}', NULL, '2026-08-24 22:24:17', '::1', 'web'),
(372, 'NRU-0002', 'create', 'payroll_run', '6', NULL, '{\"period\":\"2026-09\"}', '2026-08-24 22:24:19', '::1', 'web'),
(373, 'NRU-0002', 'create', 'payline', '6', NULL, '{\"added\":16}', '2026-08-24 22:24:19', '::1', 'web'),
(374, 'NRU-0002', 'bulk_adjust', 'payroll_run', '6', NULL, '{\"type\":\"cola\",\"value\":500,\"mode\":\"flat\",\"label\":\"Cost of Living Adjustment 2026\",\"target\":\"department\",\"affected\":3}', '2026-08-24 22:24:19', '::1', 'web'),
(375, 'NRU-0002', 'delete', 'payroll_run', '6', '{\"id\":6,\"period\":\"2026-09\",\"status\":\"draft\",\"cutoff_date\":null,\"created_by_employee_no\":\"NRU-0002\",\"approved_finance_by\":null,\"approved_finance_at\":null,\"approved_ed_by\":null,\"approved_ed_at\":null,\"paid_at\":null,\"created_at\":\"2026-08-24 22:24:19\",\"paid_via\":\"manual\",\"payment_reference\":null}', NULL, '2026-08-24 22:24:34', '::1', 'web'),
(376, 'NRU-0002', 'login', 'app_user', 'NRU-0002', NULL, '{\"role\":\"HR administrator\"}', '2026-08-24 22:27:16', '::1', 'web'),
(377, 'NRU-0002', 'create', 'api_key', '10', NULL, '{\"name\":\"Test Clock Full\",\"scopes\":[\"timesheets:create\",\"timesheets:read\",\"timesheets:update\",\"payroll:read\",\"payroll:update\"]}', '2026-08-24 22:27:58', '::1', 'web'),
(378, NULL, 'create', 'work_timer', '84', NULL, '{\"clock_in\":\"now\",\"source\":\"mobile_gps\"}', '2026-08-24 22:27:58', '::1', 'Test Clock Full'),
(379, NULL, 'update', 'work_timer', '84', '{\"clock_out\":null}', '{\"clock_out\":\"now\"}', '2026-08-24 22:27:58', '::1', 'Test Clock Full'),
(380, NULL, 'export', 'timesheet', 'NRU-0010', NULL, '{\"query\":{},\"count\":6}', '2026-08-24 22:27:59', '::1', 'Test Clock Full'),
(381, 'NRU-0002', 'create', 'api_key', '11', NULL, '{\"name\":\"Test Read Only\",\"scopes\":[\"timesheets:read\"]}', '2026-08-24 22:28:32', '::1', 'web'),
(382, 'NRU-0002', 'update', 'api_key', '11', '{\"scopes\":\"timesheets:read\"}', '{\"scopes\":[\"timesheets:read\",\"timesheets:create\"]}', '2026-08-24 22:28:32', '::1', 'web'),
(383, NULL, 'create', 'work_timer', '85', NULL, '{\"clock_in\":\"now\",\"source\":\"mobile_gps\"}', '2026-08-24 22:28:32', '::1', 'Test Read Only'),
(384, 'NRU-0002', 'delete', 'api_key', '10', '{\"name\":\"Test Clock Full\",\"scopes\":\"timesheets:create,timesheets:read,timesheets:update,payroll:read,payroll:update\",\"is_active\":1}', NULL, '2026-08-24 22:29:25', '::1', 'web'),
(385, 'NRU-0002', 'delete', 'api_key', '11', '{\"name\":\"Test Read Only\",\"scopes\":\"timesheets:read,timesheets:create\",\"is_active\":1}', NULL, '2026-08-24 22:29:25', '::1', 'web'),
(386, 'NRU-0002', 'update', 'person', 'NRU-0009', '{\"photo_url\":\"/uploads/NRU-0009-1787485451096.png\"}', '{\"photo_url\":\"/uploads/NRU-0009-1787603881157.png\"}', '2026-08-24 22:38:01', '::1', 'web'),
(387, 'NRU-0002', 'create', 'person', 'NRU-0017', NULL, '{\"full_legal_name\":\"Test Salary Person\"}', '2026-08-24 22:44:52', '::1', 'web'),
(388, 'NRU-0002', 'create', 'employment', 'NRU-0017', NULL, '{\"position_title\":\"Test Role\",\"contract_type\":\"permanent\",\"start_date\":\"2026-08-24\",\"basic_salary\":9999.5}', '2026-08-24 22:44:52', '::1', 'web'),
(389, 'NRU-0009', 'login', 'app_user', 'NRU-0009', NULL, '{\"role\":\"Employee\"}', '2026-08-24 22:45:06', '::1', 'web'),
(390, 'NRU-0003', 'login', 'app_user', 'NRU-0003', NULL, '{\"role\":\"Head of Department\"}', '2026-08-24 22:45:06', '::1', 'web'),
(391, 'NRU-0004', 'login', 'app_user', 'NRU-0004', NULL, '{\"role\":\"Data & CRM officer\"}', '2026-08-24 22:45:31', '::1', 'web'),
(392, 'NRU-0002', 'create', 'payroll_run', '7', NULL, '{\"period\":\"2026-10\"}', '2026-08-24 22:45:41', '::1', 'web'),
(393, 'NRU-0002', 'create', 'payline', '7', NULL, '{\"added\":17}', '2026-08-24 22:45:42', '::1', 'web'),
(394, 'NRU-0002', 'delete', 'payroll_run', '7', '{\"id\":7,\"period\":\"2026-10\",\"status\":\"draft\",\"cutoff_date\":null,\"created_by_employee_no\":\"NRU-0002\",\"approved_finance_by\":null,\"approved_finance_at\":null,\"approved_ed_by\":null,\"approved_ed_at\":null,\"paid_at\":null,\"created_at\":\"2026-08-24 22:45:41\",\"paid_via\":\"manual\",\"payment_reference\":null}', NULL, '2026-08-24 22:45:42', '::1', 'web'),
(395, 'NRU-0002', 'create', 'person', 'NRU-0017', NULL, '{\"full_legal_name\":\"Verify Test Person\",\"status\":\"active\"}', '2026-08-24 22:46:25', '::1', 'web'),
(396, 'NRU-0002', 'create', 'employment', 'NRU-0017', NULL, '{\"position_title\":\"Verify Role\",\"contract_type\":\"permanent\",\"start_date\":\"2026-08-24\",\"basic_salary\":7777.77}', '2026-08-24 22:46:25', '::1', 'web'),
(397, 'NRU-0004', 'login', 'app_user', 'NRU-0004', NULL, '{\"role\":\"Data & CRM officer\"}', '2026-08-24 22:46:40', '::1', 'web');

-- --------------------------------------------------------

--
-- Table structure for table `benefit_enrollment`
--

CREATE TABLE `benefit_enrollment` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `benefit_plan_id` int(11) NOT NULL,
  `enrolled_at` date NOT NULL,
  `status` enum('active','cancelled') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `benefit_enrollment`
--

INSERT INTO `benefit_enrollment` (`id`, `employee_no`, `benefit_plan_id`, `enrolled_at`, `status`) VALUES
(1, 'NRU-0001', 1, '2023-02-01', 'active'),
(2, 'NRU-0001', 4, '2023-02-01', 'active'),
(3, 'NRU-0002', 1, '2023-02-01', 'active'),
(4, 'NRU-0002', 4, '2023-02-01', 'active'),
(5, 'NRU-0003', 1, '2023-02-01', 'active'),
(6, 'NRU-0003', 4, '2023-02-01', 'active'),
(7, 'NRU-0004', 1, '2023-02-01', 'active'),
(8, 'NRU-0004', 4, '2023-02-01', 'active'),
(9, 'NRU-0005', 1, '2023-02-01', 'active'),
(10, 'NRU-0005', 4, '2023-02-01', 'active'),
(11, 'NRU-0006', 1, '2023-02-01', 'active'),
(12, 'NRU-0006', 4, '2023-02-01', 'active'),
(13, 'NRU-0007', 1, '2023-02-01', 'active'),
(14, 'NRU-0007', 4, '2023-02-01', 'active'),
(15, 'NRU-0008', 1, '2023-02-01', 'active'),
(16, 'NRU-0008', 4, '2023-02-01', 'active'),
(17, 'NRU-0009', 1, '2023-02-01', 'active'),
(18, 'NRU-0009', 4, '2023-02-01', 'active'),
(19, 'NRU-0010', 1, '2023-02-01', 'active'),
(20, 'NRU-0010', 4, '2023-02-01', 'active'),
(21, 'NRU-0011', 1, '2023-02-01', 'active'),
(22, 'NRU-0011', 4, '2023-02-01', 'active'),
(23, 'NRU-0012', 1, '2023-02-01', 'active'),
(24, 'NRU-0012', 4, '2023-02-01', 'active'),
(25, 'NRU-0013', 1, '2023-02-01', 'active'),
(26, 'NRU-0013', 4, '2023-02-01', 'active'),
(27, 'NRU-0014', 1, '2023-02-01', 'active'),
(28, 'NRU-0014', 4, '2023-02-01', 'active'),
(29, 'NRU-0015', 1, '2023-02-01', 'active'),
(30, 'NRU-0015', 4, '2023-02-01', 'active'),
(31, 'NRU-0016', 1, '2023-02-01', 'active'),
(32, 'NRU-0016', 4, '2023-02-01', 'active');

-- --------------------------------------------------------

--
-- Table structure for table `benefit_plan`
--

CREATE TABLE `benefit_plan` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `kind` varchar(60) DEFAULT NULL,
  `cost_per_person` decimal(10,2) NOT NULL DEFAULT 0.00,
  `note` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `benefit_plan`
--

INSERT INTO `benefit_plan` (`id`, `name`, `kind`, `cost_per_person`, `note`) VALUES
(1, 'Medical Aid', 'Health', 420.00, 'Family cover available at own cost.'),
(2, 'Group Life Assurance', 'Insurance', 65.00, '3x annual salary cover.'),
(3, 'Wellness & EAP', 'Wellness', 95.00, 'Counselling, legal advice, annual screening.'),
(4, 'Pension Fund', 'Retirement', 0.00, 'Employer matches 7.5% of basic salary.');

-- --------------------------------------------------------

--
-- Table structure for table `call_record`
--

CREATE TABLE `call_record` (
  `id` bigint(20) NOT NULL,
  `caller_employee_no` varchar(20) NOT NULL,
  `callee_employee_no` varchar(20) DEFAULT NULL,
  `callee_number` varchar(40) DEFAULT NULL,
  `started_at` datetime NOT NULL,
  `duration_seconds` int(11) NOT NULL DEFAULT 0,
  `direction` enum('outbound','inbound') NOT NULL DEFAULT 'outbound',
  `outcome` enum('completed','missed','declined','voicemail') NOT NULL DEFAULT 'completed'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `call_record`
--

INSERT INTO `call_record` (`id`, `caller_employee_no`, `callee_employee_no`, `callee_number`, `started_at`, `duration_seconds`, `direction`, `outcome`) VALUES
(1, 'NRU-0009', 'NRU-0005', NULL, '2026-08-21 09:14:00', 184, 'outbound', 'completed'),
(2, 'NRU-0002', 'NRU-0003', NULL, '2026-08-22 11:02:00', 340, 'outbound', 'completed'),
(3, 'NRU-0004', NULL, '+268 2404 1180', '2026-08-22 15:40:00', 0, 'outbound', 'missed'),
(4, 'NRU-0002', 'NRU-0012', NULL, '2026-08-23 11:04:17', 187, 'outbound', 'completed'),
(5, 'NRU-0002', 'NRU-0011', NULL, '2026-08-23 11:25:34', 190, 'outbound', 'completed'),
(6, 'NRU-0002', 'NRU-0001', NULL, '2026-08-23 19:12:31', 170, 'outbound', 'completed'),
(7, 'NRU-0002', 'NRU-0009', NULL, '2026-08-23 19:13:45', 227, 'outbound', 'completed'),
(8, 'NRU-0002', 'NRU-0004', NULL, '2026-08-23 22:10:58', 45, 'outbound', 'completed');

-- --------------------------------------------------------

--
-- Table structure for table `candidate`
--

CREATE TABLE `candidate` (
  `id` int(11) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(40) DEFAULT NULL,
  `resume_url` varchar(255) DEFAULT NULL,
  `source` varchar(80) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `candidate`
--

INSERT INTO `candidate` (`id`, `full_name`, `email`, `phone`, `resume_url`, `source`) VALUES
(1, 'Nomcebo Dlamini', 'nomcebo.d@example.com', '+268 7611 2233', NULL, 'LinkedIn'),
(2, 'Thulani Nkambule', 'thulani.n@example.com', '+268 7622 3344', NULL, 'Referral'),
(3, 'Gcina Mamba', 'gcina.m@example.com', '+268 7633 4455', NULL, 'Job board');

-- --------------------------------------------------------

--
-- Table structure for table `certification`
--

CREATE TABLE `certification` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `name` varchar(150) NOT NULL,
  `issued_at` date DEFAULT NULL,
  `expires_at` date DEFAULT NULL,
  `issuing_body` varchar(150) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `certification`
--

INSERT INTO `certification` (`id`, `employee_no`, `name`, `issued_at`, `expires_at`, `issuing_body`) VALUES
(1, 'NRU-0007', 'Defensive Driving', '2024-09-02', '2026-09-02', 'Eswatini Driving Academy'),
(2, 'NRU-0011', 'Defensive Driving', '2025-01-15', '2027-01-15', 'Eswatini Driving Academy'),
(3, 'NRU-0009', 'Safeguarding Level 1', '2023-08-20', '2026-08-20', 'Internal'),
(4, 'NRU-0016', 'First Aid', '2025-11-01', '2026-11-01', 'Red Cross Eswatini');

-- --------------------------------------------------------

--
-- Table structure for table `employment`
--

CREATE TABLE `employment` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `position_title` varchar(150) NOT NULL,
  `department_org_unit_id` int(11) DEFAULT NULL,
  `duty_station` varchar(100) DEFAULT NULL,
  `grade` varchar(10) DEFAULT NULL,
  `contract_type` enum('permanent','fixed_term','consultant','intern') NOT NULL DEFAULT 'permanent',
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `reports_to_employee_no` varchar(20) DEFAULT NULL,
  `cost_centre` varchar(30) DEFAULT NULL,
  `basic_salary` decimal(12,2) DEFAULT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `employment`
--

INSERT INTO `employment` (`id`, `employee_no`, `position_title`, `department_org_unit_id`, `duty_station`, `grade`, `contract_type`, `start_date`, `end_date`, `reports_to_employee_no`, `cost_centre`, `basic_salary`, `is_current`, `created_at`) VALUES
(1, 'NRU-0001', 'Systems Administrator', 1, 'Mbabane', 'G8', 'permanent', '2023-01-16', NULL, NULL, 'CC-1400', NULL, 1, '2026-08-23 08:55:44'),
(2, 'NRU-0002', 'HR Administrator', 2, 'Mbabane', 'G8', 'permanent', '2023-01-16', NULL, NULL, 'CC-1200', NULL, 1, '2026-08-23 08:55:44'),
(3, 'NRU-0003', 'Finance Manager', 3, 'Mbabane', 'G9', 'permanent', '2023-01-16', NULL, NULL, 'CC-1100', NULL, 1, '2026-08-23 08:55:44'),
(4, 'NRU-0004', 'Data & CRM Officer', 4, 'Manzini', 'G7', 'permanent', '2023-01-16', NULL, 'NRU-0002', 'CC-1300', NULL, 1, '2026-08-23 08:55:44'),
(5, 'NRU-0005', 'Field Operations Manager', 6, 'Manzini', 'G9', 'permanent', '2023-01-16', NULL, NULL, 'CC-1600', NULL, 1, '2026-08-23 08:55:44'),
(6, 'NRU-0006', 'Programmes Director · Caritas Eswatini', NULL, 'Mbabane', NULL, 'permanent', '2023-01-16', NULL, NULL, NULL, NULL, 1, '2026-08-23 08:55:44'),
(7, 'NRU-0007', 'Driver', 5, 'Mbabane', 'G5', 'permanent', '2023-01-16', NULL, 'NRU-0008', 'CC-1500', NULL, 1, '2026-08-23 08:55:44'),
(8, 'NRU-0008', 'Fleet Manager', 5, 'Mbabane', 'G9', 'permanent', '2023-01-16', NULL, NULL, 'CC-1500', NULL, 1, '2026-08-23 08:55:44'),
(9, 'NRU-0009', 'Field Enumerator', 6, 'Manzini', 'G4', 'permanent', '2023-01-16', NULL, 'NRU-0005', 'CC-1600', NULL, 1, '2026-08-23 08:55:44'),
(10, 'NRU-0010', 'Programme Assistant', 4, 'Manzini', 'G5', 'permanent', '2023-01-16', NULL, 'NRU-0004', 'CC-1300', NULL, 1, '2026-08-23 08:55:44'),
(11, 'NRU-0011', 'Driver', 5, 'Mbabane', 'G4', 'permanent', '2023-01-16', NULL, 'NRU-0008', 'CC-1500', NULL, 1, '2026-08-23 08:55:44'),
(12, 'NRU-0012', 'Payroll Officer', 3, 'Mbabane', 'G6', 'permanent', '2023-01-16', NULL, 'NRU-0003', 'CC-1100', NULL, 1, '2026-08-23 08:55:44'),
(13, 'NRU-0013', 'HR Officer', 2, 'Mbabane', 'G5', 'permanent', '2023-01-16', NULL, 'NRU-0002', 'CC-1200', NULL, 1, '2026-08-23 08:55:44'),
(14, 'NRU-0014', 'IT Support Officer', 1, 'Mbabane', 'G5', 'permanent', '2023-01-16', NULL, 'NRU-0001', 'CC-1400', NULL, 1, '2026-08-23 08:55:44'),
(15, 'NRU-0015', 'M&E Officer', 4, 'Manzini', 'G6', 'permanent', '2023-01-16', NULL, 'NRU-0004', 'CC-1300', NULL, 1, '2026-08-23 08:55:44'),
(16, 'NRU-0016', 'Field Enumerator', 6, 'Manzini', 'G4', 'permanent', '2023-01-16', NULL, 'NRU-0005', 'CC-1600', NULL, 1, '2026-08-23 08:55:44');

-- --------------------------------------------------------

--
-- Table structure for table `feed`
--

CREATE TABLE `feed` (
  `id` int(11) NOT NULL,
  `source_name` varchar(150) NOT NULL,
  `transport` enum('api_pull','sftp','csv_upload','webhook_push') NOT NULL DEFAULT 'csv_upload',
  `cadence` varchar(60) DEFAULT NULL,
  `field_map` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`field_map`)),
  `owner_employee_no` varchar(20) DEFAULT NULL,
  `status` enum('healthy','degraded','failed') NOT NULL DEFAULT 'healthy',
  `last_run_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `feed`
--

INSERT INTO `feed` (`id`, `source_name`, `transport`, `cadence`, `field_map`, `owner_employee_no`, `status`, `last_run_at`) VALUES
(1, 'National Payroll Tax Service', 'sftp', 'Monthly', '{\"tin\":\"tax_number\",\"rate\":\"paye_rate\",\"month\":\"period\"}', 'NRU-0004', 'healthy', '2026-07-25 18:05:00'),
(2, 'DHIS2 Facility Indicators', 'api_pull', 'Weekly', 'null', 'NRU-0004', 'healthy', '2026-08-24 21:39:02');

-- --------------------------------------------------------

--
-- Table structure for table `feed_record`
--

CREATE TABLE `feed_record` (
  `id` bigint(20) NOT NULL,
  `feed_id` int(11) NOT NULL,
  `raw_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`raw_payload`)),
  `status` enum('staged','quarantined','published') NOT NULL DEFAULT 'staged',
  `reason` varchar(255) DEFAULT NULL,
  `resolved_by_employee_no` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `feed_record`
--

INSERT INTO `feed_record` (`id`, `feed_id`, `raw_payload`, `status`, `reason`, `resolved_by_employee_no`, `created_at`) VALUES
(1, 1, '{\"tin\":\"X-99213\",\"name\":\"Unmapped Employee\"}', 'quarantined', 'tax number does not match any active person record', NULL, '2026-08-23 08:55:44'),
(2, 2, '{\"facility_code\":\"MZ-12\",\"indicator\":\"TB screenings\",\"value\":88}', 'published', NULL, NULL, '2026-08-23 08:55:44');

-- --------------------------------------------------------

--
-- Table structure for table `indicator_record`
--

CREATE TABLE `indicator_record` (
  `id` int(11) NOT NULL,
  `programme_id` int(11) NOT NULL,
  `partner_org_id` int(11) DEFAULT NULL,
  `indicator_name` varchar(150) NOT NULL,
  `period` varchar(20) NOT NULL,
  `value` decimal(14,2) NOT NULL DEFAULT 0.00,
  `source_feed` varchar(100) DEFAULT NULL,
  `collected_by_employee_no` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `indicator_record`
--

INSERT INTO `indicator_record` (`id`, `programme_id`, `partner_org_id`, `indicator_name`, `period`, `value`, `source_feed`, `collected_by_employee_no`, `created_at`) VALUES
(1, 1, 2, 'TB screenings', '2026-07', 612.00, 'DHIS2 API', 'NRU-0015', '2026-08-23 08:55:44'),
(2, 2, 3, 'Children screened', '2026-07', 908.00, 'KoboToolbox', 'NRU-0015', '2026-08-23 08:55:44');

-- --------------------------------------------------------

--
-- Table structure for table `interview`
--

CREATE TABLE `interview` (
  `id` int(11) NOT NULL,
  `application_id` int(11) NOT NULL,
  `interviewer_employee_no` varchar(20) DEFAULT NULL,
  `scheduled_at` datetime NOT NULL,
  `outcome` enum('pending','pass','fail') NOT NULL DEFAULT 'pending',
  `notes` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `interview`
--

INSERT INTO `interview` (`id`, `application_id`, `interviewer_employee_no`, `scheduled_at`, `outcome`, `notes`) VALUES
(1, 1, 'NRU-0005', '2026-08-27 10:00:00', 'pending', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `job_requisition`
--

CREATE TABLE `job_requisition` (
  `id` int(11) NOT NULL,
  `title` varchar(150) NOT NULL,
  `department_org_unit_id` int(11) DEFAULT NULL,
  `grade` varchar(10) DEFAULT NULL,
  `status` enum('open','on_hold','closed') NOT NULL DEFAULT 'open',
  `opened_by_employee_no` varchar(20) DEFAULT NULL,
  `opened_at` date NOT NULL,
  `headcount` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `job_requisition`
--

INSERT INTO `job_requisition` (`id`, `title`, `department_org_unit_id`, `grade`, `status`, `opened_by_employee_no`, `opened_at`, `headcount`) VALUES
(1, 'Field Enumerator', 6, 'G4', 'open', 'NRU-0005', '2026-08-01', 3),
(2, 'Accountant', 3, 'G6', 'open', 'NRU-0003', '2026-08-05', 1);

-- --------------------------------------------------------

--
-- Table structure for table `leave_balance`
--

CREATE TABLE `leave_balance` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `leave_type_id` int(11) NOT NULL,
  `year` int(11) NOT NULL,
  `entitled_days` decimal(5,2) NOT NULL DEFAULT 0.00,
  `used_days` decimal(5,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `leave_balance`
--

INSERT INTO `leave_balance` (`id`, `employee_no`, `leave_type_id`, `year`, `entitled_days`, `used_days`) VALUES
(1, 'NRU-0001', 1, 2026, 21.00, 6.00),
(2, 'NRU-0001', 2, 2026, 14.00, 3.00),
(3, 'NRU-0002', 1, 2026, 21.00, 3.00),
(4, 'NRU-0002', 2, 2026, 14.00, 3.00),
(5, 'NRU-0003', 1, 2026, 21.00, 7.00),
(6, 'NRU-0003', 2, 2026, 14.00, 0.00),
(7, 'NRU-0004', 1, 2026, 21.00, 0.00),
(8, 'NRU-0004', 2, 2026, 14.00, 0.00),
(9, 'NRU-0005', 1, 2026, 21.00, 0.00),
(10, 'NRU-0005', 2, 2026, 14.00, 2.00),
(11, 'NRU-0006', 1, 2026, 21.00, 6.00),
(12, 'NRU-0006', 2, 2026, 14.00, 0.00),
(13, 'NRU-0007', 1, 2026, 21.00, 1.00),
(14, 'NRU-0007', 2, 2026, 14.00, 0.00),
(15, 'NRU-0008', 1, 2026, 21.00, 2.00),
(16, 'NRU-0008', 2, 2026, 14.00, 1.00),
(17, 'NRU-0009', 1, 2026, 21.00, 2.00),
(18, 'NRU-0009', 2, 2026, 14.00, 1.00),
(19, 'NRU-0010', 1, 2026, 21.00, 2.00),
(20, 'NRU-0010', 2, 2026, 14.00, 3.00),
(21, 'NRU-0011', 1, 2026, 21.00, 3.00),
(22, 'NRU-0011', 2, 2026, 14.00, 2.00),
(23, 'NRU-0012', 1, 2026, 21.00, 5.00),
(24, 'NRU-0012', 2, 2026, 14.00, 2.00),
(25, 'NRU-0013', 1, 2026, 21.00, 3.00),
(26, 'NRU-0013', 2, 2026, 14.00, 2.00),
(27, 'NRU-0014', 1, 2026, 21.00, 7.00),
(28, 'NRU-0014', 2, 2026, 14.00, 3.00),
(29, 'NRU-0015', 1, 2026, 21.00, 3.00),
(30, 'NRU-0015', 2, 2026, 14.00, 2.00),
(31, 'NRU-0016', 1, 2026, 21.00, 5.00),
(32, 'NRU-0016', 2, 2026, 14.00, 1.00);

-- --------------------------------------------------------

--
-- Table structure for table `leave_request`
--

CREATE TABLE `leave_request` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `leave_type_id` int(11) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `days` decimal(5,2) NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `stage` enum('manager','hr','completed') NOT NULL DEFAULT 'manager',
  `status` enum('pending','approved','declined','cancelled') NOT NULL DEFAULT 'pending',
  `decided_by_employee_no` varchar(20) DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `leave_request`
--

INSERT INTO `leave_request` (`id`, `employee_no`, `leave_type_id`, `start_date`, `end_date`, `days`, `reason`, `stage`, `status`, `decided_by_employee_no`, `decided_at`, `created_at`) VALUES
(1, 'NRU-0009', 1, '2026-08-25', '2026-08-27', 3.00, 'Family event', 'manager', 'pending', NULL, NULL, '2026-08-23 08:55:44'),
(2, 'NRU-0016', 2, '2026-08-18', '2026-08-19', 2.00, 'Flu', 'completed', 'approved', 'NRU-0002', '2026-08-15 09:00:00', '2026-08-23 08:55:44'),
(3, 'NRU-0010', 1, '2026-09-01', '2026-09-05', 5.00, 'Travel', 'manager', 'pending', NULL, NULL, '2026-08-23 08:55:44'),
(4, 'NRU-0007', 5, '2026-08-10', '2026-08-11', 2.00, 'Bereavement — documentation pending', 'completed', 'declined', 'NRU-0002', '2026-08-15 09:00:00', '2026-08-23 08:55:44');

-- --------------------------------------------------------

--
-- Table structure for table `leave_type`
--

CREATE TABLE `leave_type` (
  `id` int(11) NOT NULL,
  `name` varchar(60) NOT NULL,
  `annual_entitlement_days` decimal(5,2) NOT NULL DEFAULT 0.00,
  `paid` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `leave_type`
--

INSERT INTO `leave_type` (`id`, `name`, `annual_entitlement_days`, `paid`) VALUES
(1, 'Annual Leave', 21.00, 1),
(2, 'Sick Leave', 14.00, 1),
(3, 'Maternity Leave', 90.00, 1),
(4, 'Paternity Leave', 5.00, 1),
(5, 'Compassionate Leave', 5.00, 1),
(6, 'Study Leave', 10.00, 0);

-- --------------------------------------------------------

--
-- Table structure for table `membership`
--

CREATE TABLE `membership` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `org_unit_id` int(11) NOT NULL,
  `role_in_unit` varchar(100) DEFAULT NULL,
  `from_date` date NOT NULL,
  `to_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `membership`
--

INSERT INTO `membership` (`id`, `employee_no`, `org_unit_id`, `role_in_unit`, `from_date`, `to_date`) VALUES
(1, 'NRU-0001', 1, 'Member', '2023-01-01', NULL),
(2, 'NRU-0002', 2, 'Member', '2023-01-01', NULL),
(3, 'NRU-0003', 3, 'Member', '2023-01-01', NULL),
(4, 'NRU-0004', 4, 'Member', '2023-01-01', NULL),
(5, 'NRU-0005', 6, 'Member', '2023-01-01', NULL),
(6, 'NRU-0007', 5, 'Member', '2023-01-01', NULL),
(7, 'NRU-0008', 5, 'Member', '2023-01-01', NULL),
(8, 'NRU-0009', 6, 'Member', '2023-01-01', NULL),
(9, 'NRU-0010', 4, 'Member', '2023-01-01', NULL),
(10, 'NRU-0011', 5, 'Member', '2023-01-01', NULL),
(11, 'NRU-0012', 3, 'Member', '2023-01-01', NULL),
(12, 'NRU-0013', 2, 'Member', '2023-01-01', NULL),
(13, 'NRU-0014', 1, 'Member', '2023-01-01', NULL),
(14, 'NRU-0015', 4, 'Member', '2023-01-01', NULL),
(15, 'NRU-0016', 6, 'Member', '2023-01-01', NULL),
(16, 'NRU-0004', 7, 'Chair', '2024-01-01', NULL),
(17, 'NRU-0003', 7, 'Member', '2024-01-01', NULL),
(18, 'NRU-0005', 9, 'Enumerator', '2024-06-01', NULL),
(19, 'NRU-0005', 10, 'Field staff', '2024-06-01', NULL),
(20, 'NRU-0009', 9, 'Enumerator', '2024-06-01', NULL),
(21, 'NRU-0009', 10, 'Field staff', '2024-06-01', NULL),
(22, 'NRU-0016', 9, 'Enumerator', '2024-06-01', NULL),
(23, 'NRU-0016', 10, 'Field staff', '2024-06-01', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `mfa_backup_code`
--

CREATE TABLE `mfa_backup_code` (
  `id` int(11) NOT NULL,
  `app_user_id` int(11) NOT NULL,
  `code_hash` varchar(255) NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notification_log`
--

CREATE TABLE `notification_log` (
  `id` bigint(20) NOT NULL,
  `event_key` varchar(60) NOT NULL,
  `recipient_email` varchar(150) DEFAULT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `status` enum('sent','failed','skipped') NOT NULL DEFAULT 'sent',
  `error` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `notification_log`
--

INSERT INTO `notification_log` (`id`, `event_key`, `recipient_email`, `subject`, `status`, `error`, `created_at`) VALUES
(1, 'leave_submitted', 'field.hod@nru.org', 'Leave request submitted — Andile Ngwenya', 'skipped', 'SMTP not configured', '2026-08-23 08:57:49'),
(2, 'leave_decided', 'employee@nru.org', 'Leave approved — Annual Leave', 'skipped', 'SMTP not configured', '2026-08-23 08:58:51'),
(3, 'mfa_enrolled', 'employee@nru.org', 'Two-factor authentication enabled (totp)', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-23 17:48:02'),
(4, 'mfa_enrolled', 'employee@nru.org', 'Two-factor authentication enabled (totp)', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-23 17:57:01'),
(5, 'mfa_enrolled', 'hr.admin@nru.org', 'Two-factor authentication enabled (totp)', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-23 17:57:30'),
(6, 'login_email_otp', 'employee@nru.org', 'Your sign-in code: 886599', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-23 17:57:32'),
(7, 'mfa_enrolled', 'employee@nru.org', 'Two-factor authentication enabled (email)', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-23 17:57:35'),
(8, 'mfa_disabled', 'employee@nru.org', 'Two-factor authentication disabled (totp)', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-23 18:12:25'),
(9, 'mfa_disabled', 'employee@nru.org', 'Two-factor authentication disabled (email)', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-23 18:12:25'),
(10, 'mfa_enrolled', 'hr.admin@nru.org', 'Two-factor authentication enabled (totp)', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-23 18:53:29'),
(11, 'mfa_enrolled', 'employee@nru.org', 'Two-factor authentication enabled (totp)', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-23 20:54:58'),
(12, 'payslip_released', 'sysadmin@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:28'),
(13, 'payslip_released', 'hr.admin@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:29'),
(14, 'payslip_released', 'finance.hod@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:31'),
(15, 'payslip_released', 'data.crm@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:32'),
(16, 'payslip_released', 'field.hod@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:34'),
(17, 'payslip_released', 'partner@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:35'),
(18, 'payslip_released', 'musa.fakudze@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:37'),
(19, 'payslip_released', 'fleet.hod@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:38'),
(20, 'payslip_released', 'employee@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:40'),
(21, 'payslip_released', 'nokuthula.mabuza@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:41'),
(22, 'payslip_released', 'sabelo.motsa@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:42'),
(23, 'payslip_released', 'phindile.vilakati@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:44'),
(24, 'payslip_released', 'mduduzi.shongwe@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:45'),
(25, 'payslip_released', 'nonhlanhla.zwane@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:47'),
(26, 'payslip_released', 'bhekani.maseko@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:48'),
(27, 'payslip_released', 'fikile.dlamini@nru.org', 'Payslip released — 2026-08', 'failed', 'Missing credentials for \"PLAIN\"', '2026-08-24 20:00:50');

-- --------------------------------------------------------

--
-- Table structure for table `notification_setting`
--

CREATE TABLE `notification_setting` (
  `id` int(11) NOT NULL,
  `event_key` varchar(60) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `channel` varchar(30) NOT NULL DEFAULT 'email',
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `notification_setting`
--

INSERT INTO `notification_setting` (`id`, `event_key`, `description`, `channel`, `is_enabled`) VALUES
(1, 'leave_submitted', 'Leave request submitted', 'email', 1),
(2, 'leave_decided', 'Leave approved or declined', 'email', 1),
(3, 'timesheet_missing', 'Timesheet not submitted (Friday 15:00 digest)', 'email', 1),
(4, 'payslip_released', 'Payslip released', 'email', 1),
(5, 'payroll_awaiting_approval', 'Payroll run awaiting approval', 'email', 1),
(6, 'certification_expiring', 'Certification expiring in 90 days (weekly digest)', 'email', 1);

-- --------------------------------------------------------

--
-- Table structure for table `org_unit`
--

CREATE TABLE `org_unit` (
  `id` int(11) NOT NULL,
  `kind` enum('department','committee','board','group','project_team') NOT NULL,
  `name` varchar(150) NOT NULL,
  `lead_employee_no` varchar(20) DEFAULT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `cost_centre` varchar(30) DEFAULT NULL,
  `duty_station` varchar(100) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `org_unit`
--

INSERT INTO `org_unit` (`id`, `kind`, `name`, `lead_employee_no`, `parent_id`, `cost_centre`, `duty_station`, `note`, `created_at`, `updated_at`) VALUES
(1, 'department', 'Information Technology', 'NRU-0001', NULL, 'CC-1400', 'Mbabane', NULL, '2026-08-23 08:55:43', '2026-08-23 08:55:44'),
(2, 'department', 'Human Resources', 'NRU-0002', NULL, 'CC-1200', 'Mbabane', NULL, '2026-08-23 08:55:43', '2026-08-23 08:55:44'),
(3, 'department', 'Finance', 'NRU-0003', NULL, 'CC-1100', 'Mbabane', NULL, '2026-08-23 08:55:43', '2026-08-23 08:55:44'),
(4, 'department', 'Programmes', 'NRU-0004', NULL, 'CC-1300', 'Manzini', NULL, '2026-08-23 08:55:43', '2026-08-23 08:55:44'),
(5, 'department', 'Fleet & Logistics', 'NRU-0008', NULL, 'CC-1500', 'Mbabane', NULL, '2026-08-23 08:55:43', '2026-08-23 08:55:44'),
(6, 'department', 'Field Operations', 'NRU-0005', NULL, 'CC-1600', 'Manzini', NULL, '2026-08-23 08:55:44', '2026-08-23 08:55:44'),
(7, 'committee', 'Programme Quality Committee', 'NRU-0004', NULL, NULL, 'Mbabane', NULL, '2026-08-23 08:55:44', '2026-08-23 08:55:44'),
(8, 'board', 'Board of Trustees', NULL, NULL, NULL, 'Mbabane', NULL, '2026-08-23 08:55:44', '2026-08-23 08:55:44'),
(9, 'group', 'Field Data Collection team', 'NRU-0005', NULL, NULL, 'Manzini', NULL, '2026-08-23 08:55:44', '2026-08-23 08:55:44'),
(10, 'project_team', 'Health Outreach 2026', 'NRU-0004', NULL, NULL, 'Manzini', NULL, '2026-08-23 08:55:44', '2026-08-23 08:55:44');

-- --------------------------------------------------------

--
-- Table structure for table `partner_org`
--

CREATE TABLE `partner_org` (
  `id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `type` varchar(80) DEFAULT NULL,
  `contact_name` varchar(150) DEFAULT NULL,
  `contact_phone` varchar(40) DEFAULT NULL,
  `agreement` varchar(150) DEFAULT NULL,
  `status` enum('active','renewal_due','inactive') NOT NULL DEFAULT 'active',
  `since_year` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `partner_org`
--

INSERT INTO `partner_org` (`id`, `name`, `type`, `contact_name`, `contact_phone`, `agreement`, `status`, `since_year`) VALUES
(1, 'Caritas Eswatini', 'Faith-based NGO', 'S. Nxumalo · Programmes Director', '+268 2404 1180', 'MoU to 31 Dec 2027', 'active', 2019),
(2, 'Ministry of Health · Manzini region', 'Government', 'Dr T. Mkhonta · Regional Health Officer', '+268 2505 2210', 'Data-sharing agreement to 2028', 'active', 2021),
(3, 'Save the Children Eswatini', 'International NGO', 'L. Dube · M&E Lead', '+268 2404 7712', 'MoU under renewal', 'renewal_due', 2023);

-- --------------------------------------------------------

--
-- Table structure for table `payline`
--

CREATE TABLE `payline` (
  `id` int(11) NOT NULL,
  `payroll_run_id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `allowances` decimal(12,2) NOT NULL DEFAULT 0.00,
  `overtime` decimal(12,2) NOT NULL DEFAULT 0.00,
  `deductions` decimal(12,2) NOT NULL DEFAULT 0.00,
  `net` decimal(12,2) NOT NULL DEFAULT 0.00,
  `bank_account` varchar(255) DEFAULT NULL,
  `tax_number` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payline`
--

INSERT INTO `payline` (`id`, `payroll_run_id`, `employee_no`, `basic`, `allowances`, `overtime`, `deductions`, `net`, `bank_account`, `tax_number`) VALUES
(1, 1, 'NRU-0001', 15700.00, 1200.00, 0.00, 1884.00, 15016.00, 'iE/P6m0EVn3+dvyDdbe+elXfe9McuwiSbuDhk58RE5UO6LV5PnEI', 'hllOrGwpuZPQT72p6OyDUOBQ/YwDVS7VraveBvX5gwIX8n+e'),
(2, 1, 'NRU-0002', 15700.00, 1200.00, 0.00, 1884.00, 15016.00, '/djmzQM22plMKJ74DlBzaTOm4UD+Drpfp3tQNARk3Hqqhnl6glBy', 'Y7Eual78jsY47g6S8AdLP4ab80h/qRE8cx3CfCjEY9A9y0Lk'),
(3, 1, 'NRU-0003', 16600.00, 1200.00, 0.00, 1992.00, 15808.00, 'HbohP9x34j0hthTvBwYX0q0H7z8Ki/mVihYT/BtP6sHG/yvPh/Xu', '5xH7od27+B/WgIY+NKOOqDwZFNwljr60Ee8uYhrYfJVVtG5Y'),
(4, 1, 'NRU-0004', 14800.00, 1200.00, 0.00, 1776.00, 14224.00, '52IlkeAKTNg1eGpvlbb0svoDVsCMbw8cEy0ChWcV32Ys8T6Vy7FV', '/lE5TcgC3eI8R2Ka5O4NCdSHrLyxGaicsoFryUXEM02qC8WN'),
(5, 1, 'NRU-0005', 16600.00, 1200.00, 0.00, 1992.00, 15808.00, 'ZEVC4X2SNa+7rPhDegswmf8mT4z55G6CeN2GvqW4mSq9m7fUT7bS', 'NrMH5HNygUslQv1+mFpqaRUnkxTd3ORlsItUuDF9kk5sCiVg'),
(6, 1, 'NRU-0006', 12100.00, 1200.00, 0.00, 1452.00, 11848.00, '5BAD7j8W0/b07jOUb0xjzEKNBReCNn4W0YdJv3Dx8iZX/i8EhD0T', 'bjDA6Q3yxVDF2Pc6zM2/nxeeWfcaBTws9eLrA2jsGus/pMss'),
(7, 1, 'NRU-0007', 13000.00, 1200.00, 640.00, 1560.00, 13280.00, 'uMOwFKMgOCCJ8EFaXPDz9M5dinOTd0zLpah0UNyJp5Y4nAkSfX7G', 'bqJPq5S7LF5ZiCQ5tH0vRVEVTiWNolkxhNbmK3p7vUVbsB3p'),
(8, 1, 'NRU-0008', 16600.00, 1200.00, 0.00, 1992.00, 15808.00, 'EXhdovtoWIQIkRR3TdImdqlf5DeyNHNZisx1oxP35fFb925LP8/t', 'Q4GxEkloEhZTf9XCkoRckzgCAdA/Qf0EaNNaJfvlqMnXWWzG'),
(9, 1, 'NRU-0009', 12100.00, 1200.00, 0.00, 1452.00, 11848.00, 'NE7rCqtXxsU5heZjp/DcCrnKVJYrLnv9lIRiO0JbqwQOVod6CeRC', 'KqJUH1B+UpIqTjOJOF1xh4B6XZx9+ety3zHWjnGDGC+k6SKW'),
(10, 1, 'NRU-0010', 13000.00, 1200.00, 0.00, 1560.00, 12640.00, 'O0nCfe+VXbJ4Fvmak0YpKFXmMQTBHVA2wpq30JGLSXOqDyXY7zeF', 'D0StmLMolKVc6JfmCDQw1ksRMSJHxgOV5wLRRWc1338BSGuT'),
(11, 1, 'NRU-0011', 12100.00, 1200.00, 640.00, 1452.00, 12488.00, 'tavdTX25ZsRtJgM0SOAMDwd4XxoVpFmPDcEwBru3+Z2qR9Ignozn', 'ngbqV4vchoOcbi+J8PaVFH17doBrx83bH9O5MDED3QaghndS'),
(12, 1, 'NRU-0012', 13900.00, 1200.00, 0.00, 1668.00, 13432.00, 'YKlVulWo4Wo23J9pdjxTj9bJoHHPb1/3cULWmuR0yDdzXX7dNgWU', '1juYaDMG1z71bZnn3shQ0zKQSctLc9EyxYnmTPBqnit+1l3z'),
(13, 1, 'NRU-0013', 13000.00, 1200.00, 0.00, 1560.00, 12640.00, 'tuJelTGbFY/3ujqugfjla5DNRIGnbpfIPPIR8UaOeoBiwQLxxsew', '6fSJ/HpxHarel80GgoYcIRaKd8ky7wE9sCZKh15X8dqcI2iL'),
(14, 1, 'NRU-0014', 13000.00, 1200.00, 0.00, 1560.00, 12640.00, '6Iiz5qs1uWkiECb15G0bQfQVkfhpjIZDGgme6L/Qt9bpsBMR7WzM', 'Rdq7aY28NAA5e0xKciKwX9qgCKwiC7iKgMP6N5qhIEkaJ1if'),
(15, 1, 'NRU-0015', 13900.00, 1200.00, 0.00, 1668.00, 13432.00, '3WyovztJcmZIWvYb66hSoyhcnb4mdOCXtVB8IHGmurS/BOrSt/EL', 'RRYb+/GWjAnCl0W5CvnXOA7SD/6GgsdYGGU6VPrEeFPffwAb'),
(16, 1, 'NRU-0016', 12100.00, 1200.00, 0.00, 1452.00, 11848.00, 'WL9F1gn9MCE3GtJsoMH2RpYxFPjph05mV6cTRlj0PTgdAuUDhfcU', 'pcqhw6ZHXngIuBV6POgWteiwpmmRYZmuwXMH2WoV57xFFfHc'),
(17, 2, 'NRU-0001', 15700.00, 1200.00, 0.00, 1884.00, 15016.00, 'JrpYaxoVyEypNl3UhbxnSwjegUASHAWuNpQKn8DNvmFFLtyLWfKu', 'WzamMIJZe12PvtXopFfzFiziyKJO2ENRsyDUzkr5lpW4sN9W'),
(18, 2, 'NRU-0002', 15700.00, 1200.00, 0.00, 1884.00, 15016.00, 'OPfHVH2rR/B/s8D0YmStfa6x96R0u/7yyRtOadSLjC69lvPMwqrp', 'xPNdepj550wHkICNeLnlG0tuTnR10C2jLY1+pT8sDpbpXimv'),
(19, 2, 'NRU-0003', 16600.00, 1200.00, 0.00, 1992.00, 15808.00, 'GdbonVsLZOI/JBD3ngsoq8E+/bVCNhORzrECaaP34ryv8Dx2US8Y', '8jtT3kZlxUbLYOrcNFGiVMStt2eVKsf/BEQLnndeGG8ZeOn5'),
(20, 2, 'NRU-0004', 14800.00, 1200.00, 0.00, 1776.00, 14224.00, 'hFILtCwc0UHwjhxOiLQSFnauu+d4BCXK3UL6RxhUdIEHLIwhA0VP', 'pFeoRQVN9fm1vZroGEmU3mTb6xgRV1ma+uHH6LjOrHCzzoHL'),
(21, 2, 'NRU-0005', 16600.00, 1200.00, 0.00, 1992.00, 15808.00, 'aQGnCt6dKfEyVg2LKNcD5BtpKfVJ5rNHdVcOA3ccoPSLKDupJyRv', '01rRpJPnws7xJDfX2Zj/3YueLaIgg6O2lPX9kYyYhRAgaFcF'),
(22, 2, 'NRU-0006', 12100.00, 1200.00, 0.00, 1452.00, 11848.00, 'MF5YUPMfHji8GCA7r8Kaanw4K3f5PPDReedbkKCnsiMKZSO2ijd9', 'QbtsJfuYnzfS8GQGULop+pj87K7AdaW9Jzey1b+1bzoyaZ2Y'),
(23, 2, 'NRU-0007', 13000.00, 1200.00, 640.00, 1560.00, 13280.00, 'xc9JSaaz3INgXfPSNTkno/oDJnNWlz5M2UgwrWGA5owu+MUIGLGf', 'ZYNKPld4Pnps6DJ1mwgAXULc1RcX8WORo5x3+HAUD2lwhBm0'),
(24, 2, 'NRU-0008', 16600.00, 1200.00, 0.00, 1992.00, 15808.00, 'YoUJjzrkIemalU/OSjeMmvGMzOpTkDKFzzexURd7/1Jgj5+G5vGG', 'G7AXr9UnSX0Gqjxb0JPIruvdNzUKltJ2sANTZhKusqGpIqVT'),
(25, 2, 'NRU-0009', 12100.00, 1200.00, 0.00, 1452.00, 11848.00, 'irLzhoEo33f+aTo9x6VLhcj8Va5COgnIWC1YDvJuL2ZKBYSzmE1P', 'S4B+MHM4DrenlNeEYQaUArxNOoVuYLs5ZwtzQnDlNrNue8vI'),
(26, 2, 'NRU-0010', 13000.00, 1200.00, 0.00, 1560.00, 12640.00, 'dNoVjBQdXSybMwAGwAQ52xUm4FaQq95FMiuzu/YK/z/fS5iTgFqz', '2o1LXNLOIFbLxMa8Ldu6nSuP5vSIc/jb0RkauEy7iiYJWSc4'),
(27, 2, 'NRU-0011', 12100.00, 1200.00, 640.00, 1452.00, 12488.00, 'dJgIAaU2H7sFyYMDbf0tYSyV7ztdv8VwHiEzdA+prwUNOvugp5Qx', 'gPuwPGJ+VB5YkTPW7Jcw0EXneMZGRlB5VDt26f8GZLHmYE45'),
(28, 2, 'NRU-0012', 13900.00, 1200.00, 0.00, 1668.00, 13432.00, 'f/6prX9imqnPAxicVLWSAnqUL+aYKyPf13S2AFD81FIGXJqDmdo/', '7vh85QxLXegLsrmxdc6wIYfuvd7gAEC+Vtlkce8OiWvfjWg8'),
(29, 2, 'NRU-0013', 13000.00, 1200.00, 0.00, 1560.00, 12640.00, 'yBCOB1iPe56b0Em2ZK4R5JerSxvRm4XRuiGnLX7sxjFm8Arf5jFH', '91+CBBOB8xmrq3MsGY01dz1ihETQbSFoT/UabXaJ5xvpakMJ'),
(30, 2, 'NRU-0014', 13000.00, 1200.00, 0.00, 1560.00, 12640.00, 'kBd5B4vnHwxC27tdStgL8GaPgOYCQgPubgaJfB6Q8zqCqzAohAUk', 'g9v3BBsnAAOAJyexpdFHbn4v03Ww86jcxEkWx7YZP2bpiTjo'),
(31, 2, 'NRU-0015', 13900.00, 1200.00, 0.00, 1668.00, 13432.00, '10+QtMf6/nNtB/iQ0xA+6ITpLGFy2fZR9OyV18BGn79UusOG6Lq9', '1Q3rYkCFLLX9W1tDOLeQszXBLyAvMIfLv/XL/na3q0b///0o'),
(32, 2, 'NRU-0016', 12100.00, 1200.00, 0.00, 1452.00, 11848.00, 'VmVDYG8mGnWrmhNKtNDBSD5L4jYQAW+Hq6W5NBa9abymFab3gp+y', 's/fKUFPmg1HdFVerB4eSis8mEc86EI/eD2C0nu9uydDakJ3k');

-- --------------------------------------------------------

--
-- Table structure for table `payline_item`
--

CREATE TABLE `payline_item` (
  `id` int(11) NOT NULL,
  `payline_id` int(11) NOT NULL,
  `kind` enum('allowance','deduction') NOT NULL,
  `label` varchar(100) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payroll_run`
--

CREATE TABLE `payroll_run` (
  `id` int(11) NOT NULL,
  `period` varchar(20) NOT NULL,
  `status` enum('draft','inputs_locked','in_review','approved_finance','approved_ed','paid','closed') NOT NULL DEFAULT 'draft',
  `cutoff_date` date DEFAULT NULL,
  `created_by_employee_no` varchar(20) DEFAULT NULL,
  `approved_finance_by` varchar(20) DEFAULT NULL,
  `approved_finance_at` datetime DEFAULT NULL,
  `approved_ed_by` varchar(20) DEFAULT NULL,
  `approved_ed_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `paid_via` enum('manual','accounting_integration') NOT NULL DEFAULT 'manual',
  `payment_reference` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payroll_run`
--

INSERT INTO `payroll_run` (`id`, `period`, `status`, `cutoff_date`, `created_by_employee_no`, `approved_finance_by`, `approved_finance_at`, `approved_ed_by`, `approved_ed_at`, `paid_at`, `created_at`, `paid_via`, `payment_reference`) VALUES
(1, '2026-07', 'closed', '2026-07-25', 'NRU-0002', 'NRU-0003', '2026-07-24 10:00:00', 'NRU-0001', '2026-07-24 14:00:00', '2026-07-25 09:00:00', '2026-08-23 08:55:44', 'manual', NULL),
(2, '2026-08', 'paid', '2026-08-25', 'NRU-0002', 'NRU-0002', '2026-08-23 10:58:51', 'NRU-0002', '2026-08-24 22:00:15', '2026-08-24 22:00:26', '2026-08-23 08:55:44', 'accounting_integration', 'ACCT-2026-08-TEST');

-- --------------------------------------------------------

--
-- Table structure for table `performance_review`
--

CREATE TABLE `performance_review` (
  `id` int(11) NOT NULL,
  `cycle_id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `reviewer_employee_no` varchar(20) DEFAULT NULL,
  `self_rating` decimal(3,1) DEFAULT NULL,
  `manager_rating` decimal(3,1) DEFAULT NULL,
  `status` enum('not_started','self_submitted','manager_submitted','completed') NOT NULL DEFAULT 'not_started',
  `comments` varchar(1000) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `performance_review`
--

INSERT INTO `performance_review` (`id`, `cycle_id`, `employee_no`, `reviewer_employee_no`, `self_rating`, `manager_rating`, `status`, `comments`) VALUES
(1, 1, 'NRU-0004', 'NRU-0002', 4.0, 4.2, 'completed', NULL),
(2, 2, 'NRU-0004', 'NRU-0002', NULL, 3.0, 'completed', NULL),
(3, 1, 'NRU-0007', 'NRU-0008', 4.0, 4.2, 'completed', NULL),
(4, 2, 'NRU-0007', 'NRU-0008', NULL, NULL, 'not_started', NULL),
(5, 1, 'NRU-0009', 'NRU-0005', 4.0, 4.2, 'completed', NULL),
(6, 2, 'NRU-0009', 'NRU-0005', NULL, NULL, 'not_started', NULL),
(7, 1, 'NRU-0010', 'NRU-0004', 4.0, 4.2, 'completed', NULL),
(8, 2, 'NRU-0010', 'NRU-0004', NULL, NULL, 'not_started', NULL),
(9, 1, 'NRU-0011', 'NRU-0008', 4.0, 4.2, 'completed', NULL),
(10, 2, 'NRU-0011', 'NRU-0008', NULL, NULL, 'not_started', NULL),
(11, 1, 'NRU-0012', 'NRU-0003', 4.0, 4.2, 'completed', NULL),
(12, 2, 'NRU-0012', 'NRU-0003', NULL, NULL, 'not_started', NULL),
(13, 1, 'NRU-0013', 'NRU-0002', 4.0, 4.2, 'completed', NULL),
(14, 2, 'NRU-0013', 'NRU-0002', NULL, 2.4, 'completed', NULL),
(15, 1, 'NRU-0014', 'NRU-0001', 4.0, 4.2, 'completed', NULL),
(16, 2, 'NRU-0014', 'NRU-0001', NULL, NULL, 'not_started', NULL),
(17, 1, 'NRU-0015', 'NRU-0004', 4.0, 4.2, 'completed', NULL),
(18, 2, 'NRU-0015', 'NRU-0004', NULL, NULL, 'not_started', NULL),
(19, 1, 'NRU-0016', 'NRU-0005', 4.0, 4.2, 'completed', NULL),
(20, 2, 'NRU-0016', 'NRU-0005', NULL, NULL, 'not_started', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `permission`
--

CREATE TABLE `permission` (
  `role_id` int(11) NOT NULL,
  `module` varchar(30) NOT NULL,
  `can_create` tinyint(1) NOT NULL DEFAULT 0,
  `can_read` tinyint(1) NOT NULL DEFAULT 0,
  `can_update` tinyint(1) NOT NULL DEFAULT 0,
  `can_delete` tinyint(1) NOT NULL DEFAULT 0,
  `data_scope` enum('self','team','department','organisation','programme') NOT NULL DEFAULT 'self',
  `field_classes` varchar(120) NOT NULL DEFAULT 'public'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `permission`
--

INSERT INTO `permission` (`role_id`, `module`, `can_create`, `can_read`, `can_update`, `can_delete`, `data_scope`, `field_classes`) VALUES
(1, 'assets', 1, 1, 1, 1, 'organisation', 'internal,restricted'),
(1, 'attendance', 1, 1, 1, 1, 'organisation', 'public,internal'),
(1, 'benefits', 1, 1, 1, 1, 'organisation', 'internal,restricted'),
(1, 'crm', 1, 1, 1, 1, 'organisation', 'public,internal'),
(1, 'intake', 1, 1, 1, 1, 'organisation', 'internal'),
(1, 'leave', 1, 1, 1, 1, 'organisation', 'public,internal'),
(1, 'org', 1, 1, 1, 1, 'organisation', 'public,internal'),
(1, 'payroll', 1, 1, 1, 1, 'organisation', 'restricted'),
(1, 'people', 1, 1, 1, 1, 'organisation', 'public,internal,restricted,sensitive'),
(1, 'performance', 1, 1, 1, 1, 'organisation', 'internal,sensitive'),
(1, 'recruitment', 1, 1, 1, 1, 'organisation', 'internal'),
(1, 'reports', 1, 1, 1, 1, 'organisation', 'internal'),
(1, 'succession', 1, 1, 1, 1, 'organisation', 'internal,sensitive'),
(1, 'training', 1, 1, 1, 1, 'organisation', 'public,internal'),
(1, 'voip', 1, 1, 1, 1, 'self', 'public,internal'),
(1, 'worktime', 1, 1, 1, 1, 'organisation', 'public,internal'),
(2, 'assets', 1, 1, 1, 0, 'self', 'internal,restricted'),
(2, 'attendance', 1, 1, 1, 0, 'department', 'public,internal'),
(2, 'benefits', 0, 1, 0, 0, 'department', 'internal,restricted'),
(2, 'crm', 0, 0, 0, 0, 'self', 'public,internal'),
(2, 'intake', 0, 0, 0, 0, 'self', 'internal'),
(2, 'leave', 1, 1, 1, 0, 'department', 'public,internal'),
(2, 'org', 0, 1, 0, 0, 'department', 'public,internal'),
(2, 'payroll', 0, 1, 0, 0, 'department', 'restricted'),
(2, 'people', 0, 1, 1, 0, 'department', 'public,internal'),
(2, 'performance', 1, 1, 1, 0, 'department', 'internal,sensitive'),
(2, 'recruitment', 1, 1, 1, 0, 'department', 'internal'),
(2, 'reports', 0, 1, 0, 0, 'department', 'internal'),
(2, 'succession', 0, 1, 1, 0, 'department', 'internal,sensitive'),
(2, 'training', 0, 1, 1, 0, 'department', 'public,internal'),
(2, 'voip', 1, 1, 1, 1, 'self', 'public,internal'),
(2, 'worktime', 0, 1, 1, 0, 'department', 'public,internal'),
(3, 'assets', 1, 1, 1, 0, 'self', 'internal,restricted'),
(3, 'attendance', 1, 1, 1, 0, 'self', 'public,internal'),
(3, 'benefits', 0, 0, 0, 0, 'self', 'internal,restricted'),
(3, 'crm', 1, 1, 1, 1, 'organisation', 'public,internal'),
(3, 'intake', 1, 1, 1, 1, 'organisation', 'internal'),
(3, 'leave', 0, 1, 0, 0, 'self', 'public,internal'),
(3, 'org', 0, 1, 0, 0, 'organisation', 'public,internal'),
(3, 'payroll', 0, 0, 0, 0, 'self', 'restricted'),
(3, 'people', 0, 1, 0, 0, 'organisation', 'public,internal'),
(3, 'performance', 0, 0, 0, 0, 'self', 'internal,sensitive'),
(3, 'recruitment', 0, 0, 0, 0, 'self', 'internal'),
(3, 'reports', 0, 1, 0, 0, 'organisation', 'internal'),
(3, 'succession', 0, 0, 0, 0, 'self', 'internal,sensitive'),
(3, 'training', 0, 0, 0, 0, 'self', 'public,internal'),
(3, 'voip', 1, 1, 1, 1, 'self', 'public,internal'),
(3, 'worktime', 0, 0, 0, 0, 'self', 'public,internal'),
(4, 'assets', 1, 1, 1, 0, 'self', 'internal,restricted'),
(4, 'attendance', 1, 1, 1, 0, 'self', 'public,internal'),
(4, 'benefits', 0, 1, 1, 0, 'self', 'internal,restricted'),
(4, 'crm', 0, 0, 0, 0, 'self', 'public,internal'),
(4, 'intake', 0, 0, 0, 0, 'self', 'internal'),
(4, 'leave', 1, 1, 1, 0, 'self', 'public,internal'),
(4, 'org', 0, 1, 0, 0, 'self', 'public,internal'),
(4, 'payroll', 0, 1, 0, 0, 'self', 'restricted'),
(4, 'people', 0, 1, 1, 0, 'self', 'public,internal,restricted,sensitive'),
(4, 'performance', 0, 1, 1, 0, 'self', 'internal,sensitive'),
(4, 'recruitment', 0, 0, 0, 0, 'self', 'internal'),
(4, 'reports', 0, 0, 0, 0, 'self', 'internal'),
(4, 'succession', 0, 0, 0, 0, 'self', 'internal,sensitive'),
(4, 'training', 0, 1, 1, 0, 'self', 'public,internal'),
(4, 'voip', 1, 1, 1, 1, 'self', 'public,internal'),
(4, 'worktime', 0, 1, 0, 0, 'self', 'public,internal'),
(5, 'assets', 1, 1, 1, 1, 'organisation', 'internal,restricted'),
(5, 'attendance', 1, 1, 1, 1, 'organisation', 'public,internal'),
(5, 'benefits', 1, 1, 1, 1, 'organisation', 'internal,restricted'),
(5, 'crm', 1, 1, 1, 1, 'organisation', 'public,internal'),
(5, 'intake', 1, 1, 1, 1, 'organisation', 'internal'),
(5, 'leave', 1, 1, 1, 1, 'organisation', 'public,internal'),
(5, 'org', 1, 1, 1, 1, 'organisation', 'public,internal'),
(5, 'payroll', 1, 1, 1, 1, 'organisation', 'restricted'),
(5, 'people', 1, 1, 1, 1, 'organisation', 'public,internal,restricted,sensitive'),
(5, 'performance', 1, 1, 1, 1, 'organisation', 'internal,sensitive'),
(5, 'recruitment', 1, 1, 1, 1, 'organisation', 'internal'),
(5, 'reports', 1, 1, 1, 1, 'organisation', 'internal'),
(5, 'succession', 1, 1, 1, 1, 'organisation', 'internal,sensitive'),
(5, 'training', 1, 1, 1, 1, 'organisation', 'public,internal'),
(5, 'voip', 1, 1, 1, 1, 'organisation', 'public,internal'),
(5, 'worktime', 1, 1, 1, 1, 'organisation', 'public,internal'),
(6, 'assets', 0, 0, 0, 0, 'self', 'internal,restricted'),
(6, 'attendance', 0, 0, 0, 0, 'self', 'public,internal'),
(6, 'benefits', 0, 0, 0, 0, 'self', 'internal,restricted'),
(6, 'crm', 0, 1, 0, 0, 'programme', 'public,internal'),
(6, 'intake', 0, 0, 0, 0, 'self', 'internal'),
(6, 'leave', 0, 0, 0, 0, 'self', 'public,internal'),
(6, 'org', 0, 0, 0, 0, 'self', 'public,internal'),
(6, 'payroll', 0, 0, 0, 0, 'self', 'restricted'),
(6, 'people', 0, 0, 0, 0, 'self', 'public,internal,restricted,sensitive'),
(6, 'performance', 0, 0, 0, 0, 'self', 'internal,sensitive'),
(6, 'recruitment', 0, 0, 0, 0, 'self', 'internal'),
(6, 'reports', 0, 0, 0, 0, 'self', 'internal'),
(6, 'succession', 0, 0, 0, 0, 'self', 'internal,sensitive'),
(6, 'training', 0, 0, 0, 0, 'self', 'public,internal'),
(6, 'voip', 0, 0, 0, 0, 'self', 'public,internal'),
(6, 'worktime', 0, 0, 0, 0, 'self', 'public,internal'),
(8, 'assets', 0, 0, 0, 0, 'self', 'public'),
(8, 'attendance', 0, 0, 0, 0, 'self', 'public'),
(8, 'benefits', 0, 0, 0, 0, 'self', 'public'),
(8, 'crm', 0, 0, 0, 0, 'self', 'public'),
(8, 'intake', 0, 0, 0, 0, 'self', 'public'),
(8, 'leave', 0, 0, 0, 0, 'self', 'public'),
(8, 'org', 0, 0, 0, 0, 'self', 'public'),
(8, 'payroll', 0, 0, 0, 0, 'self', 'public'),
(8, 'people', 0, 0, 0, 0, 'self', 'public'),
(8, 'performance', 0, 0, 0, 0, 'self', 'public'),
(8, 'recruitment', 0, 0, 0, 0, 'self', 'public'),
(8, 'reports', 0, 0, 0, 0, 'self', 'public'),
(8, 'succession', 0, 0, 0, 0, 'self', 'public'),
(8, 'training', 0, 0, 0, 0, 'self', 'public'),
(8, 'voip', 0, 0, 0, 0, 'self', 'public'),
(8, 'worktime', 0, 0, 0, 0, 'self', 'public');

-- --------------------------------------------------------

--
-- Table structure for table `permission_override`
--

CREATE TABLE `permission_override` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `module` varchar(30) NOT NULL,
  `crud` varchar(10) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `granted_by_employee_no` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `person`
--

CREATE TABLE `person` (
  `employee_no` varchar(20) NOT NULL,
  `full_legal_name` varchar(150) NOT NULL,
  `preferred_name` varchar(80) DEFAULT NULL,
  `national_id` varchar(255) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `nationality` varchar(60) DEFAULT NULL,
  `marital_status` varchar(30) DEFAULT NULL,
  `languages` varchar(150) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(40) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `next_of_kin_name` varchar(150) DEFAULT NULL,
  `next_of_kin_relationship` varchar(60) DEFAULT NULL,
  `next_of_kin_phone` varchar(255) DEFAULT NULL,
  `photo_url` varchar(255) DEFAULT NULL,
  `status` enum('active','on_leave','suspended','exited') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `person`
--

INSERT INTO `person` (`employee_no`, `full_legal_name`, `preferred_name`, `national_id`, `date_of_birth`, `gender`, `nationality`, `marital_status`, `languages`, `email`, `phone`, `address`, `next_of_kin_name`, `next_of_kin_relationship`, `next_of_kin_phone`, `photo_url`, `status`, `created_at`, `updated_at`) VALUES
('NRU-0001', 'Thandeka Nkosi', 'Thandeka', NULL, '1988-03-14', 'Female', 'Liswati', 'Married', 'siSwati, English', 'sysadmin@nru.org', '+268 241001', 'Plot 101, Mbabane', 'Next of Kin Thandeka', 'Spouse', 'zdSNvryBUm625/NTy1WF2bLVS8aO4ZFfsUTZ4iG1Mg6mBqD51G/5', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0002', 'Bongani Simelane', 'Bongani', NULL, '1985-07-22', 'Male', 'Liswati', 'Married', 'siSwati, English', 'hr.admin@nru.org', '+268 241002', 'Plot 102, Mbabane', 'Next of Kin Bongani', 'Spouse', '2hrs6/ksq1HHWsw98dXnJ88/ob0EQAti+q669Leb5TZLGvUDN5xL', '/uploads/NRU-0002-1787519089075.png', 'active', '2026-08-23 08:55:44', '2026-08-23 21:04:49'),
('NRU-0003', 'Nomvula Khumalo', 'Nomvula', NULL, '1982-11-02', 'Female', 'Liswati', 'Married', 'siSwati, English', 'finance.hod@nru.org', '+268 241003', 'Plot 103, Mbabane', 'Next of Kin Nomvula', 'Spouse', '5kzFYsTID4CHPEg7Zfc/iWq7Xvf3pOmSoAhEm3ysWRDDp+CrRE2A', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0004', 'Sipho Dube', 'Sipho', NULL, '1990-05-18', 'Male', 'Liswati', 'Married', 'siSwati, English', 'data.crm@nru.org', '+268 241004', 'Plot 104, Mbabane', 'Next of Kin Sipho', 'Spouse', '1wnxD44MKK/pVwvjCnaxaSLyaOGfEGqz86URUjYrcEZrVgAE8xwP', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0005', 'Lindiwe Mkhonta', 'Lindiwe', NULL, '1984-09-09', 'Female', 'Liswati', 'Married', 'siSwati, English', 'field.hod@nru.org', '+268 241005', 'Plot 105, Mbabane', 'Next of Kin Lindiwe', 'Spouse', 'vy9BySpk+89hPsYcU3XdLOxTdoiT5wQ2iZlzWe3eFyS3gr4OFL4T', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0006', 'Sarah Nxumalo', 'Sarah', NULL, '1979-01-30', 'Female', 'Liswati', 'Married', 'siSwati, English', 'partner@nru.org', '+268 241006', 'Plot 106, Mbabane', 'Next of Kin Sarah', 'Spouse', 'D4NajJb7/3XdpVvcXKGpF7Qi9HWLBE1ZXMjHfvLjlr5Y0m4fLGL3', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0007', 'Musa Fakudze', 'Musa', NULL, '1992-02-11', 'Male', 'Liswati', 'Married', 'siSwati, English', 'musa.fakudze@nru.org', '+268 241007', 'Plot 107, Mbabane', 'Next of Kin Musa', 'Spouse', 'te4LQNI7YvJBDqas9fFWyOgQwR+d5o1A/JQS2jS4OM52zeXokN8d', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0008', 'Zanele Simelane', 'Zanele', NULL, '1983-06-27', 'Female', 'Liswati', 'Married', 'siSwati, English', 'fleet.hod@nru.org', '+268 241008', 'Plot 108, Mbabane', 'Next of Kin Zanele', 'Spouse', 'QWPEvw+ff8xinNPcrohilc4TF/yMQvLZesKC1pCL5TLM8VczXZUl', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0009', 'Andile Ngwenya', 'Andile', NULL, '1995-04-16', 'Male', 'Liswati', 'Married', 'siSwati, English', 'employee@nru.org', '+268 241009', 'Plot 109, Mbabane', 'Next of Kin Andile', 'Spouse', 'wtxOc+OwDfWn5E9E9qQnplz9f44Wr85FaZt++3jK3PxvApoL05zU', '/uploads/NRU-0009-1787603881157.png', 'active', '2026-08-23 08:55:44', '2026-08-24 20:38:01'),
('NRU-0010', 'Nokuthula Mabuza', 'Nokuthula', NULL, '1993-08-05', 'Female', 'Liswati', 'Married', 'siSwati, English', 'nokuthula.mabuza@nru.org', '+268 241010', 'Plot 110, Mbabane', 'Next of Kin Nokuthula', 'Spouse', 'D0zXhSQ6IQ0Si9n9ZSBXP0WmPHviGFZ9Zgrkqt8nPPIhJT/Vwju5', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0011', 'Sabelo Motsa', 'Sabelo', NULL, '1991-12-19', 'Male', 'Liswati', 'Married', 'siSwati, English', 'sabelo.motsa@nru.org', '+268 241011', 'Plot 111, Mbabane', 'Next of Kin Sabelo', 'Spouse', 'uYv1wR4lYSBrP96U/wmaZO+lZRD/IrE5qGXMgP9c+rBY9jiDBIKs', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0012', 'Phindile Vilakati', 'Phindile', NULL, '1989-10-23', 'Female', 'Liswati', 'Married', 'siSwati, English', 'phindile.vilakati@nru.org', '+268 241012', 'Plot 112, Mbabane', 'Next of Kin Phindile', 'Spouse', '2txm+8n6UqrndnrhveJnBVGvOvPiOFNyxAoWiTlvAARzPtMjXlMk', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0013', 'Mduduzi Shongwe', 'Mduduzi', NULL, '1994-01-08', 'Male', 'Liswati', 'Married', 'siSwati, English', 'mduduzi.shongwe@nru.org', '+268 241013', 'Plot 113, Mbabane', 'Next of Kin Mduduzi', 'Spouse', 'SNFXmHUNHKYdjlo3FEq6XaeHExlqFkd6kDx603H5icM5AqBA/BYN', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0014', 'Nonhlanhla Zwane', 'Nonhlanhla', NULL, '1996-03-30', 'Female', 'Liswati', 'Married', 'siSwati, English', 'nonhlanhla.zwane@nru.org', '+268 241014', 'Plot 114, Mbabane', 'Next of Kin Nonhlanhla', 'Spouse', 'ofIboGgmm6edc8XxUqyEXkkSu4SOoNRHHWCVfE8+FFEsJAGBawhz', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0015', 'Bhekani Maseko', 'Bhekani', NULL, '1987-07-14', 'Male', 'Liswati', 'Married', 'siSwati, English', 'bhekani.maseko@nru.org', '+268 241015', 'Plot 115, Mbabane', 'Next of Kin Bhekani', 'Spouse', 'f2ZZdJE/yYjlgk0ADWQIRyaEPOQO0C3HedbWx8QZBdmpLQfbcZAg', '/uploads/NRU-0015-1787485991182.png', 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25'),
('NRU-0016', 'Fikile Dlamini', 'Fikile', NULL, '1997-05-21', 'Female', 'Liswati', 'Married', 'siSwati, English', 'fikile.dlamini@nru.org', '+268 241016', 'Plot 116, Mbabane', 'Next of Kin Fikile', 'Spouse', '8AbKPFwIs9ghoG9OvpBbYMIuEkVFggvhjtXVV3UJVZOJvMBNdSRf', NULL, 'active', '2026-08-23 08:55:44', '2026-08-23 20:50:25');

-- --------------------------------------------------------

--
-- Table structure for table `programme`
--

CREATE TABLE `programme` (
  `id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `lead_employee_no` varchar(20) DEFAULT NULL,
  `status` varchar(40) NOT NULL DEFAULT 'Active',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `programme`
--

INSERT INTO `programme` (`id`, `name`, `lead_employee_no`, `status`, `start_date`, `end_date`) VALUES
(1, 'Health Outreach 2026', 'NRU-0004', 'Active', '2026-01-01', NULL),
(2, 'Child Nutrition Survey', 'NRU-0004', 'Active', '2026-03-01', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `programme_partner`
--

CREATE TABLE `programme_partner` (
  `programme_id` int(11) NOT NULL,
  `partner_org_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `programme_partner`
--

INSERT INTO `programme_partner` (`programme_id`, `partner_org_id`) VALUES
(1, 1),
(1, 2),
(2, 3);

-- --------------------------------------------------------

--
-- Table structure for table `reporting_line`
--

CREATE TABLE `reporting_line` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `manager_employee_no` varchar(20) NOT NULL,
  `from_date` date NOT NULL,
  `to_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `reporting_line`
--

INSERT INTO `reporting_line` (`id`, `employee_no`, `manager_employee_no`, `from_date`, `to_date`) VALUES
(1, 'NRU-0004', 'NRU-0002', '2023-01-16', NULL),
(2, 'NRU-0007', 'NRU-0008', '2023-01-16', NULL),
(3, 'NRU-0009', 'NRU-0005', '2023-01-16', NULL),
(4, 'NRU-0010', 'NRU-0004', '2023-01-16', NULL),
(5, 'NRU-0011', 'NRU-0008', '2023-01-16', NULL),
(6, 'NRU-0012', 'NRU-0003', '2023-01-16', NULL),
(7, 'NRU-0013', 'NRU-0002', '2023-01-16', NULL),
(8, 'NRU-0014', 'NRU-0001', '2023-01-16', NULL),
(9, 'NRU-0015', 'NRU-0004', '2023-01-16', NULL),
(10, 'NRU-0016', 'NRU-0005', '2023-01-16', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `review_cycle`
--

CREATE TABLE `review_cycle` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `period` varchar(20) NOT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `review_cycle`
--

INSERT INTO `review_cycle` (`id`, `name`, `period`, `status`, `start_date`, `end_date`) VALUES
(1, 'Mid-year 2026', '2026-H1', 'closed', '2026-01-01', '2026-06-30'),
(2, 'Annual 2026', '2026', 'open', '2026-01-01', '2026-12-31');

-- --------------------------------------------------------

--
-- Table structure for table `role`
--

CREATE TABLE `role` (
  `id` int(11) NOT NULL,
  `name` varchar(60) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_super_admin` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `role`
--

INSERT INTO `role` (`id`, `name`, `description`, `is_super_admin`) VALUES
(1, 'HR administrator', 'Full read/write across HR modules for the whole organisation.', 0),
(2, 'Head of Department', 'Manages their department: team-scoped read/write, approves for direct reports.', 0),
(3, 'Data & CRM officer', 'Owns external data intake and partner/programme records.', 0),
(4, 'Employee', 'Self-service access plus read on shared structures.', 0),
(5, 'System administrator', 'Full technical administration, including access control.', 1),
(6, 'Partner (external)', 'External partner with narrow, programme-scoped read access.', 0),
(8, 'System Analyst', 'Analyzes Company systems and audit them', 0);

-- --------------------------------------------------------

--
-- Table structure for table `saved_report`
--

CREATE TABLE `saved_report` (
  `id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `report_ids_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`report_ids_json`)),
  `filters_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`filters_json`)),
  `created_by_employee_no` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int(11) UNSIGNED NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `sessions`
--

INSERT INTO `sessions` (`session_id`, `expires`, `data`) VALUES
('-foXP8LhisW0_0z97WphzDvD4r4u7MVV', 1787633106, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T04:45:06.141Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4,\"isSuperAdmin\":false}}'),
('2Ka5Bpa2GK_N9PqxUinWTODSumo9oxK3', 1787629113, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:38:30.331Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4}}'),
('9LRlyh7F6bn8SBkV2zfaNgpl4WAAjGx8', 1787632166, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T04:27:16.118Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1,\"isSuperAdmin\":false}}'),
('ArvqAj2VV6K-lUnGE7S252msWxH1xDHP', 1787629143, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:39:02.821Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4}}'),
('CXUV_x9EiNRtDYpe4o1m7S-javkCw0FK', 1787630266, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:57:45.466Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0001\",\"name\":\"Thandeka Nkosi\",\"role\":\"System administrator\",\"roleId\":5,\"isSuperAdmin\":true}}'),
('CwSEVufX5zGDVqbqosmw1IJ6Kjep272w', 1787630265, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:57:45.263Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4,\"isSuperAdmin\":false}}'),
('HwTY1-bHLwPrZrGTDpocXnhWhup0Y2-I', 1787628860, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:34:19.683Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4}}'),
('KMw3WbWrlTsMvfK2ufZqyPLbH7oRm4xi', 1787628653, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:30:26.049Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1}}'),
('MLX49-FbRN28jb-An0Ao7KJs2dASIYT9', 1787633658, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:32:01.326Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1}}'),
('RoQMw5uNfu_Q96vJP5wY0-vHw-Crdfxw', 1787628724, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:32:04.488Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4}}'),
('SqrQtAcG27gOnUeObVxTlwdGXyY7QPUG', 1787629349, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:31:56.241Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1}}'),
('ThgbWLJ1u-pYDQcomW0kRmZXon1j6vkK', 1787633186, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T04:08:55.854Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4,\"isSuperAdmin\":false}}'),
('VSpnUykOW1Qw_HR7hq4q7b4GtdS5wo8e', 1787629234, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:40:34.082Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1}}'),
('W_BT5H7L3zOn64v0Zpu1BffC_j1qbz5M', 1787629268, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:41:07.618Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4}}'),
('ZMoEk7gUf2wqBI34Dy2lO9mbd4eA2hQw', 1787629319, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:41:58.364Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1}}'),
('_AVtJwFur9_O7IOdNL3vFyVuG3TAqrm6', 1787630294, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:58:13.403Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1,\"isSuperAdmin\":false}}'),
('c9ihmNCot1rXpOB1EAD1sEzBm9AqHzsb', 1787628777, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:32:57.228Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4}}'),
('e0aGXyqPr4R6BN-zds550a2vLN5ZVqUE', 1787633107, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T04:45:06.490Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0003\",\"name\":\"Nomvula Khumalo\",\"role\":\"Head of Department\",\"roleId\":2,\"isSuperAdmin\":false}}'),
('fDt54jQJnp9SsELyyHGYkdiHbr3F6aQ1', 1787630936, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T04:06:48.883Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1,\"isSuperAdmin\":false}}'),
('gpd7wmJyTSDrS3j3khp3akmuNgqHoWji', 1787630468, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T04:00:08.046Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1,\"isSuperAdmin\":false}}'),
('hLNWjqufNwwA-xVznGvwbrZsV9sBYNTH', 1787630291, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:58:10.765Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0001\",\"name\":\"Thandeka Nkosi\",\"role\":\"System administrator\",\"roleId\":5,\"isSuperAdmin\":true}}'),
('hpUlvBHIBjOEBK8fdRTSTaebIZ6ymGX7', 1787633132, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T04:45:31.623Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0004\",\"name\":\"Sipho Dube\",\"role\":\"Data & CRM officer\",\"roleId\":3,\"isSuperAdmin\":false}}'),
('jj2Gpj5IjrO9mI9a--BrA9auyS1VFaO_', 1787631039, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:24:07.263Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1}}'),
('ldzOBXnGGYwcA-Qhx5tktDHCU6ir1wJP', 1787629133, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:38:50.381Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4}}'),
('mZAPoW6rkwzLLNgT0eoBTWBjIgZY0e3m', 1787629179, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:39:38.665Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4}}'),
('o4BHwzsqO4cWVzUL7kB-sepEXjY8QRpG', 1787628724, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:31:56.359Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4}}'),
('upfb5lbVbQqkTpQwU6BTjcx7m0f0uhNY', 1787628653, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:30:16.600Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0009\",\"name\":\"Andile Ngwenya\",\"role\":\"Employee\",\"roleId\":4}}'),
('wZ6pkd34HyGQG7jDFTn-0ewN8KM0cVlM', 1787629108, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T03:38:25.904Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1}}'),
('wwptBichCUqMJSnMJ82TK4QAoa6P-aLN', 1787633200, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T04:46:40.050Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0004\",\"name\":\"Sipho Dube\",\"role\":\"Data & CRM officer\",\"roleId\":3,\"isSuperAdmin\":false}}'),
('xh2rWkuRW6UtjHH2LRRg2Ihvdeedn_pQ', 1787633186, '{\"cookie\":{\"originalMaxAge\":28800000,\"expires\":\"2026-08-25T04:22:50.570Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"employeeNo\":\"NRU-0002\",\"name\":\"Bongani Simelane\",\"role\":\"HR administrator\",\"roleId\":1,\"isSuperAdmin\":false}}');

-- --------------------------------------------------------

--
-- Table structure for table `shift_pattern`
--

CREATE TABLE `shift_pattern` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `pattern` varchar(150) NOT NULL,
  `contracted_hours` decimal(5,2) NOT NULL DEFAULT 40.00,
  `break_rule` varchar(100) DEFAULT NULL,
  `grace_minutes` int(11) NOT NULL DEFAULT 10,
  `overtime_rule` varchar(150) DEFAULT NULL,
  `rounding_rule` varchar(100) DEFAULT NULL,
  `auto_clock_out` tinyint(1) NOT NULL DEFAULT 0,
  `capture_source` enum('terminal','mobile_gps','web','vehicle_log') NOT NULL DEFAULT 'web'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `shift_pattern`
--

INSERT INTO `shift_pattern` (`id`, `name`, `pattern`, `contracted_hours`, `break_rule`, `grace_minutes`, `overtime_rule`, `rounding_rule`, `auto_clock_out`, `capture_source`) VALUES
(1, 'Standard day', 'Mon-Fri 08:00-17:00', 40.00, '1 hour unpaid lunch', 10, '1.5x after 40 hrs/week', 'Nearest 15 min', 0, 'web'),
(2, 'Driver shift', 'Variable, dispatch-led', 45.00, '30 min as scheduled', 15, '1.5x after 45 hrs/week', 'Nearest 5 min', 0, 'vehicle_log'),
(3, 'Field roster', 'Mon-Sat, roster-based', 40.00, '1 hour unpaid', 15, '1.5x after 40 hrs/week', 'Nearest 15 min', 1, 'mobile_gps');

-- --------------------------------------------------------

--
-- Table structure for table `succession_plan`
--

CREATE TABLE `succession_plan` (
  `id` int(11) NOT NULL,
  `position_title` varchar(150) NOT NULL,
  `org_unit_id` int(11) DEFAULT NULL,
  `incumbent_employee_no` varchar(20) DEFAULT NULL,
  `risk` enum('low','medium','high') NOT NULL DEFAULT 'low',
  `note` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `succession_plan`
--

INSERT INTO `succession_plan` (`id`, `position_title`, `org_unit_id`, `incumbent_employee_no`, `risk`, `note`) VALUES
(1, 'Finance Manager', 3, 'NRU-0003', 'medium', 'No ready-now successor identified.'),
(2, 'Fleet Manager', 5, 'NRU-0008', 'high', 'Single point of failure — sole qualified driver-manager.');

-- --------------------------------------------------------

--
-- Table structure for table `successor_candidate`
--

CREATE TABLE `successor_candidate` (
  `id` int(11) NOT NULL,
  `succession_plan_id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `readiness` enum('ready_now','ready_1_2yr','ready_3_5yr') NOT NULL DEFAULT 'ready_1_2yr'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `successor_candidate`
--

INSERT INTO `successor_candidate` (`id`, `succession_plan_id`, `employee_no`, `readiness`) VALUES
(1, 1, 'NRU-0012', 'ready_1_2yr'),
(2, 2, 'NRU-0007', 'ready_3_5yr');

-- --------------------------------------------------------

--
-- Table structure for table `training_course`
--

CREATE TABLE `training_course` (
  `id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `provider` varchar(150) DEFAULT NULL,
  `category` varchar(80) DEFAULT NULL,
  `is_certification` tinyint(1) NOT NULL DEFAULT 0,
  `validity_months` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `training_course`
--

INSERT INTO `training_course` (`id`, `name`, `provider`, `category`, `is_certification`, `validity_months`) VALUES
(1, 'Data Protection Fundamentals', 'Internal', 'Compliance', 0, NULL),
(2, 'Defensive Driving', 'Eswatini Driving Academy', 'Fleet', 1, 24),
(3, 'Safeguarding Level 1', 'Internal', 'Compliance', 1, 36),
(4, 'First Aid', 'Red Cross Eswatini', 'Health & Safety', 1, 12);

-- --------------------------------------------------------

--
-- Table structure for table `training_enrollment`
--

CREATE TABLE `training_enrollment` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `course_id` int(11) NOT NULL,
  `status` enum('enrolled','in_progress','completed','failed') NOT NULL DEFAULT 'enrolled',
  `completed_at` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `training_enrollment`
--

INSERT INTO `training_enrollment` (`id`, `employee_no`, `course_id`, `status`, `completed_at`) VALUES
(1, 'NRU-0001', 1, 'completed', '2026-02-15'),
(2, 'NRU-0002', 1, 'completed', '2026-02-15'),
(3, 'NRU-0003', 1, 'completed', '2026-02-15'),
(4, 'NRU-0004', 1, 'completed', '2026-02-15'),
(5, 'NRU-0005', 1, 'completed', '2026-02-15'),
(6, 'NRU-0006', 1, 'completed', '2026-02-15'),
(7, 'NRU-0007', 1, 'completed', '2026-02-15'),
(8, 'NRU-0008', 1, 'completed', '2026-02-15'),
(9, 'NRU-0009', 1, 'completed', '2026-02-15'),
(10, 'NRU-0010', 1, 'completed', '2026-02-15'),
(11, 'NRU-0011', 1, 'completed', '2026-02-15'),
(12, 'NRU-0012', 1, 'completed', '2026-02-15'),
(13, 'NRU-0013', 1, 'completed', '2026-02-15'),
(14, 'NRU-0014', 1, 'completed', '2026-02-15'),
(15, 'NRU-0015', 1, 'completed', '2026-02-15'),
(16, 'NRU-0016', 1, 'completed', '2026-02-15'),
(17, 'NRU-0002', 2, 'enrolled', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `user_preference`
--

CREATE TABLE `user_preference` (
  `employee_no` varchar(20) NOT NULL,
  `dashboard_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`dashboard_json`)),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user_preference`
--

INSERT INTO `user_preference` (`employee_no`, `dashboard_json`, `updated_at`) VALUES
('NRU-0002', '{}', '2026-08-24 19:39:02'),
('NRU-0009', '{}', '2026-08-24 19:39:02');

-- --------------------------------------------------------

--
-- Table structure for table `voip_extension`
--

CREATE TABLE `voip_extension` (
  `id` int(11) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `extension` varchar(20) NOT NULL,
  `status` enum('active','inactive','forwarded') NOT NULL DEFAULT 'active',
  `sip_username` varchar(60) DEFAULT NULL,
  `sip_domain` varchar(120) DEFAULT 'sip.nru.local',
  `voicemail_pin` varchar(10) DEFAULT NULL,
  `device_assigned` varchar(120) DEFAULT NULL,
  `department_org_unit_id` int(11) DEFAULT NULL,
  `emergency_number` varchar(40) DEFAULT NULL,
  `forward_on_busy_to` varchar(20) DEFAULT NULL,
  `out_of_office_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `out_of_office_target` varchar(20) DEFAULT NULL,
  `hunt_group` varchar(60) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `voip_extension`
--

INSERT INTO `voip_extension` (`id`, `employee_no`, `extension`, `status`, `sip_username`, `sip_domain`, `voicemail_pin`, `device_assigned`, `department_org_unit_id`, `emergency_number`, `forward_on_busy_to`, `out_of_office_enabled`, `out_of_office_target`, `hunt_group`) VALUES
(1, 'NRU-0001', '100', 'active', 'thandeka.nkosi', 'sip.nru.local', '1662', 'Yealink T46S — Desk 1', 1, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(2, 'NRU-0002', '101', 'active', 'bongani.simelane', 'sip.nru.local', '3335', 'Yealink T33G — Desk 2', 2, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(3, 'NRU-0003', '102', 'forwarded', 'nomvula.khumalo', 'sip.nru.local', '4733', 'Cisco 8841 — Desk 3', 3, '+268 999 (Police) / +268 933 (Fire & Amb', '100', 0, NULL, 'HR Front Desk'),
(4, 'NRU-0004', '103', 'active', 'sipho.dube', 'sip.nru.local', '8683', 'Poly VVX 411 — Desk 4', 4, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, 'Finance Queue'),
(5, 'NRU-0005', '104', 'active', 'lindiwe.mkhonta', 'sip.nru.local', '4353', 'Softphone (Zoiper) — Desk 5', 6, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 1, 'voicemail', NULL),
(6, 'NRU-0006', '105', 'active', 'sarah.nxumalo', 'sip.nru.local', '4387', 'Yealink T46S — Desk 6', NULL, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(7, 'NRU-0007', '106', 'active', 'musa.fakudze', 'sip.nru.local', '9005', 'Yealink T33G — Desk 7', 5, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(8, 'NRU-0008', '107', 'active', 'zanele.simelane', 'sip.nru.local', '8537', 'Cisco 8841 — Desk 8', 5, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(9, 'NRU-0009', '108', 'active', 'andile.ngwenya', 'sip.nru.local', '2370', 'Poly VVX 411 — Desk 9', 6, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(10, 'NRU-0010', '109', 'active', 'nokuthula.mabuza', 'sip.nru.local', '1072', 'Softphone (Zoiper) — Desk 10', 4, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(11, 'NRU-0011', '110', 'active', 'sabelo.motsa', 'sip.nru.local', '4463', 'Yealink T46S — Desk 11', 5, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(12, 'NRU-0012', '111', 'active', 'phindile.vilakati', 'sip.nru.local', '8406', 'Yealink T33G — Desk 12', 3, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(13, 'NRU-0013', '112', 'active', 'mduduzi.shongwe', 'sip.nru.local', '3364', 'Cisco 8841 — Desk 13', 2, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, 'Finance Queue'),
(14, 'NRU-0014', '113', 'active', 'nonhlanhla.zwane', 'sip.nru.local', '4380', 'Poly VVX 411 — Desk 14', 1, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(15, 'NRU-0015', '114', 'active', 'bhekani.maseko', 'sip.nru.local', '4890', 'Softphone (Zoiper) — Desk 15', 4, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL),
(16, 'NRU-0016', '115', 'active', 'fikile.dlamini', 'sip.nru.local', '6472', 'Yealink T46S — Desk 16', 6, '+268 999 (Police) / +268 933 (Fire & Amb', NULL, 0, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `work_timer`
--

CREATE TABLE `work_timer` (
  `id` bigint(20) NOT NULL,
  `employee_no` varchar(20) NOT NULL,
  `shift_pattern_id` int(11) DEFAULT NULL,
  `clock_in` datetime NOT NULL,
  `clock_out` datetime DEFAULT NULL,
  `source` enum('terminal','mobile_gps','web','vehicle_log') NOT NULL DEFAULT 'web',
  `device` varchar(100) DEFAULT NULL,
  `geo` varchar(100) DEFAULT NULL,
  `correction_of` bigint(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `work_timer`
--

INSERT INTO `work_timer` (`id`, `employee_no`, `shift_pattern_id`, `clock_in`, `clock_out`, `source`, `device`, `geo`, `correction_of`, `created_at`) VALUES
(1, 'NRU-0001', 1, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(2, 'NRU-0001', 1, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(3, 'NRU-0001', 1, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(4, 'NRU-0001', 1, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(5, 'NRU-0001', 1, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(6, 'NRU-0002', 1, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(7, 'NRU-0002', 1, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(8, 'NRU-0002', 1, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(9, 'NRU-0002', 1, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(10, 'NRU-0002', 1, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(11, 'NRU-0003', 1, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(12, 'NRU-0003', 1, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(13, 'NRU-0003', 1, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(14, 'NRU-0003', 1, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(15, 'NRU-0003', 1, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(16, 'NRU-0004', 1, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(17, 'NRU-0004', 1, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(18, 'NRU-0004', 1, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(19, 'NRU-0004', 1, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(20, 'NRU-0004', 1, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(21, 'NRU-0005', 3, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(22, 'NRU-0005', 3, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(23, 'NRU-0005', 3, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(24, 'NRU-0005', 3, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(25, 'NRU-0005', 3, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(26, 'NRU-0006', 1, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(27, 'NRU-0006', 1, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(28, 'NRU-0006', 1, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(29, 'NRU-0006', 1, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(30, 'NRU-0006', 1, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(31, 'NRU-0007', 2, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'vehicle_log', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(32, 'NRU-0007', 2, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'vehicle_log', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(33, 'NRU-0007', 2, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'vehicle_log', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(34, 'NRU-0007', 2, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'vehicle_log', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(35, 'NRU-0007', 2, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'vehicle_log', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(36, 'NRU-0008', 1, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(37, 'NRU-0008', 1, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(38, 'NRU-0008', 1, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(39, 'NRU-0008', 1, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(40, 'NRU-0008', 1, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(41, 'NRU-0009', 3, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(42, 'NRU-0009', 3, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(43, 'NRU-0009', 3, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(44, 'NRU-0009', 3, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(45, 'NRU-0009', 3, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(46, 'NRU-0010', 1, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(47, 'NRU-0010', 1, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(48, 'NRU-0010', 1, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(49, 'NRU-0010', 1, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(50, 'NRU-0010', 1, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(51, 'NRU-0011', 2, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'vehicle_log', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(52, 'NRU-0011', 2, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'vehicle_log', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(53, 'NRU-0011', 2, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'vehicle_log', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(54, 'NRU-0011', 2, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'vehicle_log', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(55, 'NRU-0011', 2, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'vehicle_log', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(56, 'NRU-0012', 1, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(57, 'NRU-0012', 1, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(58, 'NRU-0012', 1, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(59, 'NRU-0012', 1, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(60, 'NRU-0012', 1, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(61, 'NRU-0013', 1, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(62, 'NRU-0013', 1, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(63, 'NRU-0013', 1, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(64, 'NRU-0013', 1, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(65, 'NRU-0013', 1, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(66, 'NRU-0014', 1, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(67, 'NRU-0014', 1, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(68, 'NRU-0014', 1, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(69, 'NRU-0014', 1, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(70, 'NRU-0014', 1, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'web', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(71, 'NRU-0015', 3, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(72, 'NRU-0015', 3, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(73, 'NRU-0015', 3, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(74, 'NRU-0015', 3, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(75, 'NRU-0015', 3, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(76, 'NRU-0016', 3, '2026-08-18 08:01:00', '2026-08-18 17:01:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(77, 'NRU-0016', 3, '2026-08-19 08:02:00', '2026-08-19 17:02:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(78, 'NRU-0016', 3, '2026-08-20 08:03:00', '2026-08-20 17:00:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(79, 'NRU-0016', 3, '2026-08-21 08:00:00', '2026-08-21 17:01:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(80, 'NRU-0016', 3, '2026-08-22 08:01:00', '2026-08-22 17:02:00', 'mobile_gps', 'Kiosk-1', NULL, NULL, '2026-08-23 08:55:44'),
(81, 'NRU-0009', 1, '2026-08-23 10:58:44', '2026-08-23 10:58:44', 'web', 'Browser', NULL, NULL, '2026-08-23 08:58:44'),
(82, 'NRU-0002', 1, '2026-08-23 11:05:31', '2026-08-23 11:06:56', 'web', 'Browser', NULL, NULL, '2026-08-23 09:05:31'),
(83, 'NRU-0002', 1, '2026-08-23 11:19:26', '2026-08-23 14:19:20', 'web', 'Browser', NULL, NULL, '2026-08-23 09:19:26');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `api_key`
--
ALTER TABLE `api_key`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_apikey_creator` (`created_by_employee_no`);

--
-- Indexes for table `application`
--
ALTER TABLE `application`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_app_req` (`requisition_id`),
  ADD KEY `fk_app_candidate` (`candidate_id`);

--
-- Indexes for table `app_setting`
--
ALTER TABLE `app_setting`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `setting_key` (`setting_key`);

--
-- Indexes for table `app_user`
--
ALTER TABLE `app_user`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `employee_no` (`employee_no`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `fk_user_role` (`role_id`);

--
-- Indexes for table `asset_declaration`
--
ALTER TABLE `asset_declaration`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_asset_reviewer` (`reviewed_by_employee_no`),
  ADD KEY `idx_asset_person` (`employee_no`,`status`);

--
-- Indexes for table `audit_event`
--
ALTER TABLE `audit_event`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_audit_entity` (`entity_type`,`entity_id`),
  ADD KEY `idx_audit_at` (`at`),
  ADD KEY `idx_audit_actor` (`actor_employee_no`,`at`);

--
-- Indexes for table `benefit_enrollment`
--
ALTER TABLE `benefit_enrollment`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_enroll_person` (`employee_no`),
  ADD KEY `fk_enroll_plan` (`benefit_plan_id`);

--
-- Indexes for table `benefit_plan`
--
ALTER TABLE `benefit_plan`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `call_record`
--
ALTER TABLE `call_record`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_call_caller` (`caller_employee_no`),
  ADD KEY `fk_call_callee` (`callee_employee_no`);

--
-- Indexes for table `candidate`
--
ALTER TABLE `candidate`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `certification`
--
ALTER TABLE `certification`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_cert_person` (`employee_no`);

--
-- Indexes for table `employment`
--
ALTER TABLE `employment`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_employment_dept` (`department_org_unit_id`),
  ADD KEY `fk_employment_manager` (`reports_to_employee_no`),
  ADD KEY `idx_employment_person` (`employee_no`);

--
-- Indexes for table `feed`
--
ALTER TABLE `feed`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_feed_owner` (`owner_employee_no`);

--
-- Indexes for table `feed_record`
--
ALTER TABLE `feed_record`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_feedrecord_feed` (`feed_id`),
  ADD KEY `fk_feedrecord_resolver` (`resolved_by_employee_no`);

--
-- Indexes for table `indicator_record`
--
ALTER TABLE `indicator_record`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_indicator_programme` (`programme_id`),
  ADD KEY `fk_indicator_partner` (`partner_org_id`),
  ADD KEY `fk_indicator_collector` (`collected_by_employee_no`);

--
-- Indexes for table `interview`
--
ALTER TABLE `interview`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_interview_app` (`application_id`),
  ADD KEY `fk_interview_person` (`interviewer_employee_no`);

--
-- Indexes for table `job_requisition`
--
ALTER TABLE `job_requisition`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_req_dept` (`department_org_unit_id`),
  ADD KEY `fk_req_opener` (`opened_by_employee_no`);

--
-- Indexes for table `leave_balance`
--
ALTER TABLE `leave_balance`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_balance` (`employee_no`,`leave_type_id`,`year`),
  ADD KEY `fk_balance_type` (`leave_type_id`);

--
-- Indexes for table `leave_request`
--
ALTER TABLE `leave_request`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_leavereq_type` (`leave_type_id`),
  ADD KEY `fk_leavereq_decider` (`decided_by_employee_no`),
  ADD KEY `idx_leavereq_person` (`employee_no`,`status`);

--
-- Indexes for table `leave_type`
--
ALTER TABLE `leave_type`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `membership`
--
ALTER TABLE `membership`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_membership_person` (`employee_no`),
  ADD KEY `idx_membership_unit` (`org_unit_id`);

--
-- Indexes for table `mfa_backup_code`
--
ALTER TABLE `mfa_backup_code`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_backup_user` (`app_user_id`,`used_at`);

--
-- Indexes for table `notification_log`
--
ALTER TABLE `notification_log`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `notification_setting`
--
ALTER TABLE `notification_setting`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `event_key` (`event_key`);

--
-- Indexes for table `org_unit`
--
ALTER TABLE `org_unit`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_orgunit_lead` (`lead_employee_no`),
  ADD KEY `fk_orgunit_parent` (`parent_id`);

--
-- Indexes for table `partner_org`
--
ALTER TABLE `partner_org`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `payline`
--
ALTER TABLE `payline`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_payline_person` (`employee_no`),
  ADD KEY `idx_payline_run` (`payroll_run_id`);

--
-- Indexes for table `payline_item`
--
ALTER TABLE `payline_item`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_plitem_payline` (`payline_id`);

--
-- Indexes for table `payroll_run`
--
ALTER TABLE `payroll_run`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `period` (`period`),
  ADD KEY `fk_run_creator` (`created_by_employee_no`),
  ADD KEY `fk_run_finance` (`approved_finance_by`),
  ADD KEY `fk_run_ed` (`approved_ed_by`);

--
-- Indexes for table `performance_review`
--
ALTER TABLE `performance_review`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_perf_cycle` (`cycle_id`),
  ADD KEY `fk_perf_person` (`employee_no`),
  ADD KEY `fk_perf_reviewer` (`reviewer_employee_no`);

--
-- Indexes for table `permission`
--
ALTER TABLE `permission`
  ADD PRIMARY KEY (`role_id`,`module`);

--
-- Indexes for table `permission_override`
--
ALTER TABLE `permission_override`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_override_person` (`employee_no`),
  ADD KEY `fk_override_grantor` (`granted_by_employee_no`);

--
-- Indexes for table `person`
--
ALTER TABLE `person`
  ADD PRIMARY KEY (`employee_no`);

--
-- Indexes for table `programme`
--
ALTER TABLE `programme`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_programme_lead` (`lead_employee_no`);

--
-- Indexes for table `programme_partner`
--
ALTER TABLE `programme_partner`
  ADD PRIMARY KEY (`programme_id`,`partner_org_id`),
  ADD KEY `fk_pp_partner` (`partner_org_id`);

--
-- Indexes for table `reporting_line`
--
ALTER TABLE `reporting_line`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_rline_person` (`employee_no`),
  ADD KEY `fk_rline_manager` (`manager_employee_no`);

--
-- Indexes for table `review_cycle`
--
ALTER TABLE `review_cycle`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `role`
--
ALTER TABLE `role`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `saved_report`
--
ALTER TABLE `saved_report`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`session_id`);

--
-- Indexes for table `shift_pattern`
--
ALTER TABLE `shift_pattern`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `succession_plan`
--
ALTER TABLE `succession_plan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_succession_unit` (`org_unit_id`),
  ADD KEY `fk_succession_incumbent` (`incumbent_employee_no`);

--
-- Indexes for table `successor_candidate`
--
ALTER TABLE `successor_candidate`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_successor_plan` (`succession_plan_id`),
  ADD KEY `fk_successor_person` (`employee_no`);

--
-- Indexes for table `training_course`
--
ALTER TABLE `training_course`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `training_enrollment`
--
ALTER TABLE `training_enrollment`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_train_person` (`employee_no`),
  ADD KEY `fk_train_course` (`course_id`);

--
-- Indexes for table `user_preference`
--
ALTER TABLE `user_preference`
  ADD PRIMARY KEY (`employee_no`);

--
-- Indexes for table `voip_extension`
--
ALTER TABLE `voip_extension`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `employee_no` (`employee_no`),
  ADD UNIQUE KEY `extension` (`extension`),
  ADD KEY `fk_ext_department` (`department_org_unit_id`);

--
-- Indexes for table `work_timer`
--
ALTER TABLE `work_timer`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_timer_shift` (`shift_pattern_id`),
  ADD KEY `fk_timer_correction` (`correction_of`),
  ADD KEY `idx_timer_person` (`employee_no`,`clock_in`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `api_key`
--
ALTER TABLE `api_key`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `application`
--
ALTER TABLE `application`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `app_setting`
--
ALTER TABLE `app_setting`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=24;

--
-- AUTO_INCREMENT for table `app_user`
--
ALTER TABLE `app_user`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `asset_declaration`
--
ALTER TABLE `asset_declaration`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `audit_event`
--
ALTER TABLE `audit_event`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=398;

--
-- AUTO_INCREMENT for table `benefit_enrollment`
--
ALTER TABLE `benefit_enrollment`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=33;

--
-- AUTO_INCREMENT for table `benefit_plan`
--
ALTER TABLE `benefit_plan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `call_record`
--
ALTER TABLE `call_record`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `candidate`
--
ALTER TABLE `candidate`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `certification`
--
ALTER TABLE `certification`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `employment`
--
ALTER TABLE `employment`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT for table `feed`
--
ALTER TABLE `feed`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `feed_record`
--
ALTER TABLE `feed_record`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `indicator_record`
--
ALTER TABLE `indicator_record`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `interview`
--
ALTER TABLE `interview`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `job_requisition`
--
ALTER TABLE `job_requisition`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `leave_balance`
--
ALTER TABLE `leave_balance`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=33;

--
-- AUTO_INCREMENT for table `leave_request`
--
ALTER TABLE `leave_request`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `leave_type`
--
ALTER TABLE `leave_type`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `membership`
--
ALTER TABLE `membership`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=24;

--
-- AUTO_INCREMENT for table `mfa_backup_code`
--
ALTER TABLE `mfa_backup_code`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=41;

--
-- AUTO_INCREMENT for table `notification_log`
--
ALTER TABLE `notification_log`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=28;

--
-- AUTO_INCREMENT for table `notification_setting`
--
ALTER TABLE `notification_setting`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `org_unit`
--
ALTER TABLE `org_unit`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `partner_org`
--
ALTER TABLE `partner_org`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `payline`
--
ALTER TABLE `payline`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=114;

--
-- AUTO_INCREMENT for table `payline_item`
--
ALTER TABLE `payline_item`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `payroll_run`
--
ALTER TABLE `payroll_run`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `performance_review`
--
ALTER TABLE `performance_review`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=22;

--
-- AUTO_INCREMENT for table `permission_override`
--
ALTER TABLE `permission_override`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `programme`
--
ALTER TABLE `programme`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `reporting_line`
--
ALTER TABLE `reporting_line`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `review_cycle`
--
ALTER TABLE `review_cycle`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `role`
--
ALTER TABLE `role`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `saved_report`
--
ALTER TABLE `saved_report`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `shift_pattern`
--
ALTER TABLE `shift_pattern`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `succession_plan`
--
ALTER TABLE `succession_plan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `successor_candidate`
--
ALTER TABLE `successor_candidate`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `training_course`
--
ALTER TABLE `training_course`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `training_enrollment`
--
ALTER TABLE `training_enrollment`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT for table `voip_extension`
--
ALTER TABLE `voip_extension`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `work_timer`
--
ALTER TABLE `work_timer`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=86;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `api_key`
--
ALTER TABLE `api_key`
  ADD CONSTRAINT `fk_apikey_creator` FOREIGN KEY (`created_by_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL;

--
-- Constraints for table `application`
--
ALTER TABLE `application`
  ADD CONSTRAINT `fk_app_candidate` FOREIGN KEY (`candidate_id`) REFERENCES `candidate` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_app_req` FOREIGN KEY (`requisition_id`) REFERENCES `job_requisition` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `app_user`
--
ALTER TABLE `app_user`
  ADD CONSTRAINT `fk_user_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`);

--
-- Constraints for table `asset_declaration`
--
ALTER TABLE `asset_declaration`
  ADD CONSTRAINT `fk_asset_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_asset_reviewer` FOREIGN KEY (`reviewed_by_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL;

--
-- Constraints for table `benefit_enrollment`
--
ALTER TABLE `benefit_enrollment`
  ADD CONSTRAINT `fk_enroll_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_enroll_plan` FOREIGN KEY (`benefit_plan_id`) REFERENCES `benefit_plan` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `call_record`
--
ALTER TABLE `call_record`
  ADD CONSTRAINT `fk_call_callee` FOREIGN KEY (`callee_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_call_caller` FOREIGN KEY (`caller_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE;

--
-- Constraints for table `certification`
--
ALTER TABLE `certification`
  ADD CONSTRAINT `fk_cert_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE;

--
-- Constraints for table `employment`
--
ALTER TABLE `employment`
  ADD CONSTRAINT `fk_employment_dept` FOREIGN KEY (`department_org_unit_id`) REFERENCES `org_unit` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_employment_manager` FOREIGN KEY (`reports_to_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_employment_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE;

--
-- Constraints for table `feed`
--
ALTER TABLE `feed`
  ADD CONSTRAINT `fk_feed_owner` FOREIGN KEY (`owner_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL;

--
-- Constraints for table `feed_record`
--
ALTER TABLE `feed_record`
  ADD CONSTRAINT `fk_feedrecord_feed` FOREIGN KEY (`feed_id`) REFERENCES `feed` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_feedrecord_resolver` FOREIGN KEY (`resolved_by_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL;

--
-- Constraints for table `indicator_record`
--
ALTER TABLE `indicator_record`
  ADD CONSTRAINT `fk_indicator_collector` FOREIGN KEY (`collected_by_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_indicator_partner` FOREIGN KEY (`partner_org_id`) REFERENCES `partner_org` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_indicator_programme` FOREIGN KEY (`programme_id`) REFERENCES `programme` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `interview`
--
ALTER TABLE `interview`
  ADD CONSTRAINT `fk_interview_app` FOREIGN KEY (`application_id`) REFERENCES `application` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_interview_person` FOREIGN KEY (`interviewer_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL;

--
-- Constraints for table `job_requisition`
--
ALTER TABLE `job_requisition`
  ADD CONSTRAINT `fk_req_dept` FOREIGN KEY (`department_org_unit_id`) REFERENCES `org_unit` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_req_opener` FOREIGN KEY (`opened_by_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL;

--
-- Constraints for table `leave_balance`
--
ALTER TABLE `leave_balance`
  ADD CONSTRAINT `fk_balance_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_balance_type` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_type` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `leave_request`
--
ALTER TABLE `leave_request`
  ADD CONSTRAINT `fk_leavereq_decider` FOREIGN KEY (`decided_by_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_leavereq_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_leavereq_type` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_type` (`id`);

--
-- Constraints for table `membership`
--
ALTER TABLE `membership`
  ADD CONSTRAINT `fk_membership_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_membership_unit` FOREIGN KEY (`org_unit_id`) REFERENCES `org_unit` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mfa_backup_code`
--
ALTER TABLE `mfa_backup_code`
  ADD CONSTRAINT `fk_backup_user` FOREIGN KEY (`app_user_id`) REFERENCES `app_user` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `org_unit`
--
ALTER TABLE `org_unit`
  ADD CONSTRAINT `fk_orgunit_lead` FOREIGN KEY (`lead_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_orgunit_parent` FOREIGN KEY (`parent_id`) REFERENCES `org_unit` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `payline`
--
ALTER TABLE `payline`
  ADD CONSTRAINT `fk_payline_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_payline_run` FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_run` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payline_item`
--
ALTER TABLE `payline_item`
  ADD CONSTRAINT `fk_plitem_payline` FOREIGN KEY (`payline_id`) REFERENCES `payline` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payroll_run`
--
ALTER TABLE `payroll_run`
  ADD CONSTRAINT `fk_run_creator` FOREIGN KEY (`created_by_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_run_ed` FOREIGN KEY (`approved_ed_by`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_run_finance` FOREIGN KEY (`approved_finance_by`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL;

--
-- Constraints for table `performance_review`
--
ALTER TABLE `performance_review`
  ADD CONSTRAINT `fk_perf_cycle` FOREIGN KEY (`cycle_id`) REFERENCES `review_cycle` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_perf_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_perf_reviewer` FOREIGN KEY (`reviewer_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL;

--
-- Constraints for table `permission`
--
ALTER TABLE `permission`
  ADD CONSTRAINT `fk_perm_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `permission_override`
--
ALTER TABLE `permission_override`
  ADD CONSTRAINT `fk_override_grantor` FOREIGN KEY (`granted_by_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_override_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE;

--
-- Constraints for table `programme`
--
ALTER TABLE `programme`
  ADD CONSTRAINT `fk_programme_lead` FOREIGN KEY (`lead_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL;

--
-- Constraints for table `programme_partner`
--
ALTER TABLE `programme_partner`
  ADD CONSTRAINT `fk_pp_partner` FOREIGN KEY (`partner_org_id`) REFERENCES `partner_org` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_pp_programme` FOREIGN KEY (`programme_id`) REFERENCES `programme` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `reporting_line`
--
ALTER TABLE `reporting_line`
  ADD CONSTRAINT `fk_rline_manager` FOREIGN KEY (`manager_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_rline_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE;

--
-- Constraints for table `succession_plan`
--
ALTER TABLE `succession_plan`
  ADD CONSTRAINT `fk_succession_incumbent` FOREIGN KEY (`incumbent_employee_no`) REFERENCES `person` (`employee_no`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_succession_unit` FOREIGN KEY (`org_unit_id`) REFERENCES `org_unit` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `successor_candidate`
--
ALTER TABLE `successor_candidate`
  ADD CONSTRAINT `fk_successor_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_successor_plan` FOREIGN KEY (`succession_plan_id`) REFERENCES `succession_plan` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `training_enrollment`
--
ALTER TABLE `training_enrollment`
  ADD CONSTRAINT `fk_train_course` FOREIGN KEY (`course_id`) REFERENCES `training_course` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_train_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE;

--
-- Constraints for table `user_preference`
--
ALTER TABLE `user_preference`
  ADD CONSTRAINT `fk_pref_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE;

--
-- Constraints for table `voip_extension`
--
ALTER TABLE `voip_extension`
  ADD CONSTRAINT `fk_ext_department` FOREIGN KEY (`department_org_unit_id`) REFERENCES `org_unit` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ext_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE;

--
-- Constraints for table `work_timer`
--
ALTER TABLE `work_timer`
  ADD CONSTRAINT `fk_timer_correction` FOREIGN KEY (`correction_of`) REFERENCES `work_timer` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_timer_person` FOREIGN KEY (`employee_no`) REFERENCES `person` (`employee_no`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_timer_shift` FOREIGN KEY (`shift_pattern_id`) REFERENCES `shift_pattern` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
