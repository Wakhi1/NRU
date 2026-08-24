# NRU HRIS — System Documentation

Internal reference for the application itself: architecture, data model, permission model, and
what every module actually does. For how *other* systems (smartphone tracking, accounting,
fleet/logistics) pull or push data via the API-key-authenticated integration layer, see
**[INTEGRATION.md](./INTEGRATION.md)** instead — this document does not repeat that content.

## 1. Overview

This is a full HRIS built for an NGO/international-organisation context — department names
(Field Operations, Programmes), partner organisations (Caritas Eswatini, Save the Children
Eswatini), and the currency used throughout (`SZL`, Eswatini Lilangeni, displayed with an `E`
prefix) all confirm this in `src/db/seed.js`. It's a single Node/Express/MySQL application with
no external identity provider, no ORM, and no frontend build step — everything ships as plain
HTML/CSS/JS served directly by the same process that runs the API.

The originally-seeded roles cover the org: **System administrator** (true superuser, see §4), **HR
administrator**, **Head of Department**, **Data & CRM officer**, **Employee**, and **Partner
(external)** — plus at least one role added later via the admin UI itself (**System Analyst**),
since roles are not fixed in code: they're rows in the `role` table an admin can create at will,
and every new role starts with zero access to anything until deliberately granted (§4).

The system is designed as the org's single source of truth for employee and timesheet data —
three other systems (smartphone tracking, accounting, fleet/logistics) integrate against it
read-mostly, with one deliberate write-back path for payroll. See INTEGRATION.md.

## 2. Architecture & stack

- **Backend**: Express 4, `mysql2/promise` for raw SQL (no ORM — see `src/platform/db.js`, which
  exposes a plain `query(sql, params)` plus a `tx(work)` transaction helper). Route files under
  `src/routes/*.routes.js` contain their handler logic directly — there is **no controller
  layer**; validation lives in `src/validators/*.validators.js` (Zod schemas), cross-cutting
  concerns (auth, scope resolution, audit, encryption, mail, MFA, file serving, report rendering)
  live in `src/platform/*.js`.
- **Sessions**: `express-session` backed by a MySQL-stored session table (`express-mysql-session`,
  auto-created). Session cookie name `nru_hris_sid`, 8-hour rolling expiry, `secure` in
  production. There is no JWT/stateless auth anywhere in this app.
- **Frontend**: plain HTML per page (`public/*.html`) plus one JS file per page
  (`public/js/<page>.js`), no framework, no bundler. Two shared files every page includes:
  `public/js/api.js` (fetch wrapper — `Api.get/post/put/del`, `Api.withLoading`, global 401
  handling, toast notifications) and `public/js/shell.js` (renders the sidebar/topbar chrome and
  exposes `Shell.init(pageKey)`, which every page's own script calls first to get `{user, scope}`
  from `GET /auth/me`). `NAV_ITEMS` in `shell.js` is the single place page visibility is decided —
  each item is gated either by a module's `read` scope or, for a few admin-only pages (Audit
  trail, Integrations), by an explicit `roles` allowlist.
- **TLS**: `server.js` starts `https.createServer` when `SSL_KEY_PATH`/`SSL_CERT_PATH` are both
  set (self-terminated TLS); otherwise plain `http.createServer`, which is only appropriate in
  production behind a reverse proxy that terminates TLS itself (`TRUST_PROXY=true` in that case,
  see `.env.example`).
- **Scheduled jobs**: `node-cron`, registered in `src/platform/jobs.js` — a Friday 15:00 "missing
  timesheet" digest and a Monday 08:00 "certification expiring soon" digest, both emailing the
  affected employee and (for timesheets) their manager.
- **Local dev setup**: XAMPP MySQL, `.env` (copy from `.env.example`), `npm run migrate` (applies
  `src/db/schema.sql`, idempotent — every statement is `CREATE TABLE IF NOT EXISTS`) then
  `npm run seed` (idempotent — skips if `person` already has rows). Two one-time data migrations
  exist outside the normal `migrate` script, run manually when needed:
  `src/db/migrate-encrypt-fields.js` (encrypts any still-plaintext sensitive DB columns) and
  `src/db/migrate-encrypt-files.js` (encrypts any still-plaintext uploaded files).

## 3. Data model

`src/db/schema.sql` is organized into commented sections; the shape matters more than the column
list, so this section explains the shape.

**People & employment.** `person` is the master identity record — one row per human, keyed by a
configurable `employee_no` (prefix + digit padding set in Settings → Branding, see §8).
`employment` is a **versioned history table**, not a single row per person: a promotion, a
department move, or a salary change inserts a *new* `employment` row and flips the previous
current row's `is_current` to 0, rather than updating in place (`POST /people/:id/employment` in
`people.routes.js`). `basic_salary` lives here for exactly that reason — a raise is versioned
employment history, the same as a promotion. `reporting_line` is a separate append-only table
tracking manager changes specifically (so "who reported to whom, when" has its own history
independent of full employment versioning, used by `PATCH /people/:id/manager` for a lightweight
reassignment that doesn't need a whole new employment row).

**Access.** `role` → `permission` (one row per role × module, see §4) → `permission_override`
(time-bound per-person exceptions) → `app_user` (the actual login: email/password, MFA state,
lockout state, one-to-one with a `person` via `employee_no`). `mfa_backup_code` holds bcrypt-hashed
one-time recovery codes.

**Operational modules** each get their own table group: `org_unit`/`membership` (departments,
committees, boards — a self-referencing tree via `parent_id`), `shift_pattern`/`work_timer`
(attendance — `work_timer.source` distinguishes a browser clock-in from a `mobile_gps` or
`vehicle_log` one, i.e. this schema was built anticipating exactly the integration write-back
described in INTEGRATION.md), `leave_type`/`leave_balance`/`leave_request`, `benefit_plan`/
`benefit_enrollment`, the payroll group (§6), `job_requisition`/`candidate`/`application`/
`interview` (recruitment), `review_cycle`/`performance_review`, `succession_plan`/
`successor_candidate`, `training_course`/`training_enrollment`/`certification`, the CRM group
(`partner_org`/`programme`/`indicator_record`) and its sibling `feed`/`feed_record` (external data
intake — staged/quarantined/published rows from an inbound feed), `voip_extension`/`call_record`
(a **simulated** PBX — configuration data only, documented as such in `voip.routes.js`, never sent
to a real SIP registrar), and `asset_declaration` (an integrity/compliance feature: staff
self-declare personal assets/financial interests/gifts, HR/System admin review org-wide).

**Encryption at rest.** Two independent layers:
- *Text fields*: `national_id`, `next_of_kin_phone`, `bank_account`, `tax_number`, and
  `app_user.totp_secret` are AES-256-GCM ciphertext (base64) via `platform/crypto.js`'s
  `encrypt`/`decrypt`, keyed by `ENCRYPTION_KEY`. `decrypt()` is deliberately tolerant — a value
  that doesn't parse as the iv+tag+ciphertext format is returned unchanged, so a not-yet-migrated
  legacy plaintext row degrades to "still readable" rather than crashing the request.
- *Uploaded files*: profile photos (`uploads/`) and admin-uploaded branding logo/favicon
  (`public/img/`) are **also** AES-256-GCM encrypted at rest, via the same key and the binary
  counterparts `encryptBuffer`/`decryptBufferTolerant`. Uploads use `multer.memoryStorage()` so
  plaintext never touches disk even momentarily — the route handler encrypts the buffer and writes
  ciphertext directly (`people.routes.js`'s photo upload, `branding.routes.js`'s logo/favicon
  upload). `src/platform/fileServe.js` decrypts on the way back out, tolerantly (a bundled default
  asset like `nru-logo.png`, never encrypted, still serves correctly) — it replaces a plain
  `express.static` mount for exactly these two directories in `server.js`; every other static
  asset (css/js/html) is untouched by this and still served directly.

**Audit.** Every mutating route calls `writeAudit(req, action, entityType, entityId, before,
after)` (`platform/audit.js`), writing one row to `audit_event` with a before/after JSON diff, the
acting employee, IP, and a `consumer` column (`'web'` for normal in-app actions; an API key's name
for integration-originated writes — see INTEGRATION.md).

## 4. The permission model (RBAC)

`src/platform/scope.js` is the center of this. Every module-gated route calls
`requireScope(moduleName, action)`, which resolves the caller's effective permission for that
module and attaches it to `req.scope`:

1. **Base grant** — one row in `permission` per `(role_id, module)`: four CRUD booleans, a
   `data_scope` (`self` / `team` / `department` / `organisation` / `programme`), and a
   `field_classes` list (`public` / `internal` / `restricted` / `sensitive` — which sensitivity
   tiers of a `person` row this role can see, applied by `maskPerson()`).
2. **Per-person overrides** — `permission_override` rows can grant a specific person extra CRUD on
   a module for a limited time (`expires_at`), or explicitly deny (`crud = '-'`, which always wins
   over any grant).
3. **Super-admin bypass** — a role flagged `role.is_super_admin` (only **System administrator** is
   seeded with this; there is deliberately no UI to grant it to an arbitrary role) skips steps 1–2
   entirely and gets full CRUD, `organisation` data scope, and every field class, on every module.
   This is a genuine bypass at the top of `resolveScope()`, not a widened permission row — it can't
   be accidentally narrowed by someone editing the matrix.

**`data_scope` is not optional context — it's a second, independent check from `read`/`write`.**
Having `read: true` on a module means "this role can read *something* in this module," not
"organisation-wide." `scopeFilterSql(scope, user, column)` turns a `data_scope` into a SQL `WHERE`
fragment (`self` → own `employee_no` only; `department` → a subquery against the caller's own
current department; `team` → direct reports; `organisation` → unrestricted). Every route that
returns a list or a single record for someone else must apply this filter, not just check `read`.
A concrete, currently-live example of getting this right: `employment.basic_salary` is stripped
from a person's profile response unless the caller's **`payroll`** scope (not their `people`
scope) actually reaches that specific employee — read access to `payroll` alone isn't enough, the
`department`/`self`/`organisation` narrowing is re-checked against the target employee_no
specifically (`people.routes.js`'s `GET /:id`). This mirrors an actual bug fixed earlier in this
system's life: two dashboard charts were once gated on `read` alone and leaked organisation-wide
payroll/recruitment totals to roles that should only see their own.

**Route-level gates**: `requireScope(module, action)` for anything covered by the permission
matrix; `requireRole(...roleNames)` for the handful of things that are role-identity-gated instead
(role/permission-matrix administration itself — so a role can never edit its own way into wider
access — plus Settings, VoIP provisioning, and Audit trail admin actions).

**Account-state enforcement is separate from permission scope.** `requireAuth`
(`platform/auth.js`) re-checks `is_active`/`locked_until` against the database on **every
request**, not just at login — so an admin manually locking or suspending someone
(`POST /access/users/:id/lock|unlock`, distinct from the older auto-lockout-on-failed-password
mechanism which uses the same columns) takes effect on that person's already-open session
immediately, not just at their next login attempt.

## 5. Account security

- **MFA**: TOTP (authenticator app, `otplib`) and/or email OTP, self-enrolled from Settings →
  Security (visible to every role, not admin-gated — it's about securing your own login). 8
  single-use backup codes (`XXXX-XXXX`, bcrypt-hashed) generated on enrollment. `platform/mfa.js`.
- **Lockout, two kinds**: automatic (`LOCKOUT_DEFAULT_ATTEMPTS`/`_WINDOW_MIN`, tunable in Settings,
  triggers after repeated bad passwords) and **manual** (an admin action, effectively indefinite —
  `DATE_ADD(NOW(), INTERVAL 100 YEAR)` — until explicitly released). Both use the same
  `locked_until` column; one `/unlock` endpoint releases either kind.
- **Password reset**: admin-initiated (`POST /access/users/:id/reset-password`), also clears any
  lockout state on the account.
- **Encryption in transit**: see §2 (TLS). **At rest**: see §3.

## 6. Every module

Each nav item in the sidebar (`shell.js`'s `NAV_ITEMS`), what it's for, and its most important
capabilities. "Gated by" means the `requireScope` module name.

- **Dashboard** (`index.html`/`dashboard.routes.js`, no module gate — content self-filters) — KPI
  cards and ~10 Chart.js charts (headcount, hires trend, leave, attendance, certifications,
  payroll, recruitment funnel, training), each chart individually present only if the viewer's
  scope for that underlying module grants read access, and each one **query-filtered** by that
  module's data_scope too (not just gated on presence — the payroll/recruitment charts specifically
  had a real scope-leak bug here, since fixed). Per-user, **server-side** display preferences
  (`user_preference.dashboard_json`) — which KPIs/charts are hidden, and a configurable row of
  quick-action shortcuts, each shortcut only offered if the viewer's own scope for its target
  module actually permits it. Every role can personalize their own view; this isn't admin-only.
- **People records** (`directory.html`/`people.routes.js`, `people`) — the master person record,
  employment history, photo, org relationships (`GET /:id/relationships` — manager/peers/direct
  reports). Field-class masking applies per role (§4). Self-service profile editing is restricted
  to a whitelist of contact/next-of-kin fields (`SELF_EDITABLE_FIELDS`) when the caller is editing
  their own record under `self` scope — HR/managers with wider scope keep full field access.
- **Org & groups** (`org.html`/`org.routes.js`, `org`) — the department/committee/board tree and
  membership assignments.
- **Time & attendance** (`attendance.html`/`attendance.routes.js`, `attendance`) — self-service
  clock-in/out (one open timer per person per day), plus supervisor corrections (a correction
  inserts a **new** row referencing the original via `correction_of` rather than editing history in
  place).
- **Leave** (`leave.html`/`leave.routes.js`, `leave`) — leave types/entitlements, balances, and a
  two-stage (`manager` → `hr`) request/decision workflow.
- **Benefits** (`benefits.html`/`benefits.routes.js`, `benefits`) — plans and enrollments.
- **Payroll** (`payroll.html`/`payroll.routes.js`, `payroll`) — see the dedicated walkthrough
  below; this is the module the user most recently asked about.
- **Recruitment** (`recruitment.html`/`recruitment.routes.js`, `recruitment`) — requisitions →
  candidates → applications → interview stages → hire.
- **Performance** (`performance.html`/`performance.routes.js`, `performance`) — review cycles,
  self-rating and manager-rating on the same review record (two separate PUT endpoints,
  `/reviews/:id/self` vs `/reviews/:id/manager`, each field-permission-gated to the right party).
- **Succession** (`succession.html`/`succession.routes.js`, `succession`) — at-risk positions and
  their bench of ready-now/1-2yr/3-5yr successor candidates.
- **Training** (`training.html`/`training.routes.js`, `training`) — courses, enrollments, and
  certifications (some courses are themselves certifications with an expiry, feeding the Monday
  cron digest and the reports/integration certification-expiry views).
- **External data** (`intake.html`/`intake.routes.js`, `intake`) — inbound data feeds from other
  systems (staged → quarantined → published records), a general-purpose ingestion/reconciliation
  surface distinct from the integration API's own push endpoints.
- **CRM & programmes** (`crm.html`/`crm.routes.js`, `crm`) — partner organisations, programmes,
  and indicator records (M&E-style metrics collected against a programme/partner).
- **VoIP directory** (`voip.html`/`voip.routes.js`, `voip`) — a simulated PBX directory: extension
  provisioning, device assignment, call routing config, and a fake CDR. Directory read + your own
  call-handling prefs follow normal per-user scope; provisioning (allocate/reassign, SIP
  credentials, hunt groups) is admin-role-gated like Settings, not matrix-gated.
- **Reports** (`reports.html`/`reports.routes.js`, `reports`) — see §7.
- **Audit trail** (`audit.html`/`audit.routes.js`, no module gate — role-gated) — HR/System admin
  only. Every audited action, filterable, with a computed before/after diff view and export.
- **Integrations** (`integration.html`/`integration.routes.js`) — HR/System admin only. API key
  lifecycle management; see INTEGRATION.md for the full detail, this page is just the admin UI for
  it.
- **Asset declarations** (`assets.html`/`assets.routes.js`, `assets`) — self-declare, HR/System
  admin review organisation-wide.
- **My workspace** (`self-service.html`) — redirects to the viewer's own `employee.html` profile,
  which surfaces role-appropriate tabs (Personal, Employment, Structures, Leave, **Payroll** — see
  below, Training & compliance) scoped to their own record.
- **Settings** (`settings.html`/`settings.routes.js` + `access.routes.js`) — HR/System admin only,
  tabbed: permission matrix, roles & logins (including the lock/suspend/reset actions from §5),
  per-person overrides, notification toggles, branding/first-run setup (§8), org-wide settings
  (payroll cutoff day, leave cycle, session lifetime, lockout tuning), and Security (MFA — visible
  to everyone, not admin-gated, see §5).

### Payroll in detail

A payroll run moves through a fixed state machine (`SEQUENCE` in `payroll.routes.js`):
`draft → inputs_locked → in_review → approved_finance → approved_ed → paid → closed`. Each step
is `POST /runs/:id/advance`, which only accepts the single valid next status, notifies HR/System
admin when a run enters review, and notifies every affected employee when it reaches `paid`.

**Populating a run** (`POST /runs/:id/populate`) inserts one `payline` per active employee not
already in the run — and **carries forward** figures rather than starting at zero: for an employee
with a payline in an earlier-period run, their `basic`/`allowances`/`deductions` (and any itemized
breakdown, and bank/tax details) carry forward from that most recent prior payline; overtime always
resets to zero (it's genuinely per-period). For an employee with **no** payroll history at all — a
brand-new hire — their very first payline seeds from `employment.basic_salary`, the figure set (or
later updated) on their employment record, instead of zero. This is what makes "set a salary when
hiring" and "carry a raise forward automatically" both actually work.

**Editing pay**: two ways. Individually, `PUT /paylines/:id` (inline in the run's payline table, or
the fuller "Compensation" drawer) edits one employee's figures for one run — including an optional
itemized breakdown (`payline_item`: labelled allowance/deduction lines, e.g. "Housing Allowance",
"PAYE Tax" — when items are present, the payline's flat `allowances`/`deductions` totals are always
kept as the *sum* of their own-kind items, computed server-side, never hand-typed out of sync).
In bulk, `POST /runs/:id/bulk-adjust` applies one pay decision across many people in one call:
- `increment_percent` — raises `basic` directly by a percentage (a base-pay raise).
- `cola` — a Cost-of-Living Adjustment, either a flat amount or a percentage of basic, recorded as
  a new labelled `payline_item` (so the reason stays visible on the payslip, not silently folded
  into a bigger number).
- `bonus` — a flat one-off amount, same item-based mechanism.

Each can target `all` employees in the run, one `department`, or a hand-picked list of
`employee_nos`. One audit row is written per bulk call (with an `affected` count), not one per
payline. Both individual and bulk edits are blocked once a run leaves `draft`/`inputs_locked`.

**Where to actually do this in the UI**: Payroll page → open a run in `draft`/`inputs_locked` →
the payline table has inline editing and a "Compensation" drawer per row for itemized detail, plus
a **"Bulk pay adjustment"** button for the increment/COLA/bonus flow described above. A brand-new
employee's starting salary is set once, at hire time, on the "Add employee" form's Employment
section (`basic_salary` field — only shown to someone with `payroll:create`, see §4) or later via
an employment-versioning update (a raise = a new employment record, same as a promotion).

**Payslips**: itemized, Gross Pay → Net Pay, both as a downloadable PDF
(`GET /paylines/:id/payslip.pdf`, `platform/reportKit.js`'s `buildPayslipPdf`) and an on-screen
breakdown. Shows the employee's own masked bank account and tax number (an employee seeing the
last 4 digits of their own bank account on their own payslip is normal; the full number stays
admin-only). Reachable from the dedicated Payroll page (for anyone with any payroll read access,
resolving to their own paylines) **and** from My Workspace → Payroll tab — the same experience in
both places.

**Accounting write-back**: once a run reaches `approved_ed` internally, the actual disbursement can
happen in an external accounting system, which then calls back via the integration API
(`payroll:update` scope) to mark the run `paid` with its own payment reference — full detail in
INTEGRATION.md; this app's side of it is just that the run's `paid_via` column records whether it
was closed out manually or via that callback.

## 7. Reporting & audit

`platform/reportKit.js` is the one rendering core behind every export in the app: an HTML preview
template (for an `<iframe>`), a PDFKit layout, an ExcelJS workbook builder, and a CSV writer — used
identically by `reports.routes.js` and `audit.routes.js` so every exported document shares the same
letterhead/footer/pagination conventions.

**Reports**: 16 report types (`REPORTS` registry in `reports.routes.js` — workforce, absence,
attendance, payroll, recruitment, training, performance, benefits, succession, certifications,
partners, programme_indicators, voip_activity, asset_declarations, data_feeds, plus combined
multi-section reports). Every person-keyed report applies the same `scopeFilterSql` narrowing as
everywhere else, so exporting is never a way to see more than the UI would show. Reports can be
combined into one multi-section document (PDF/XLSX; CSV stays single-flat-table, exported per
report instead) and saved (name + report set + filters) for one-click re-run later.

**Audit**: every mutating route writes to `audit_event` via `writeAudit()` — actor, action, entity
type/id, before/after JSON diff, IP, and `consumer` (`'web'` or an integration key's name). The
Audit trail page (HR/System admin only) filters by date/actor/action/entity/consumer/free-text and
renders a computed diff rather than a raw JSON dump; exports via the same reportKit machinery,
capped at 50k rows for CSV (which includes full before/after JSON; PDF/XLSX use summary columns).

## 8. Branding & first-run setup

Nothing about this system's identity is hardcoded — `app_setting` holds the organisation name,
logo/favicon URLs, and the employee-number format (`employee_no_prefix`/`employee_no_padding`,
e.g. `EMP-0001`). All of it is set from Settings → Branding, in one "Organisation identity" card —
the employee-number fields were deliberately relocated into this same card (rather than a separate
tab) so they're set at the same time as the org name, before numbering format matters (it only
affects *new* hires going forward, not existing employee numbers). A dismissible setup banner shows
on every page except Settings, to HR/System admins only, until an org name has actually been saved
(`GET /branding`'s `is_configured` flag) — this is what a genuinely first-run install sees.

## 9. Dashboard personalization

Covered in §6's Dashboard entry; noted separately here because it's a cross-cutting mechanism, not
a "module": `user_preference` is a one-row-per-person table holding a JSON blob of display
preferences, replacing an earlier admin-only, browser-`localStorage`-only version. Every role can
hide/show individual KPIs and charts and choose which quick-action shortcuts appear, and it follows
them across devices/browsers since it's server-side, not per-browser.

## See also

**[INTEGRATION.md](./INTEGRATION.md)** — how the smartphone tracking, accounting, and
fleet/logistics systems authenticate (API keys, not sessions), what they can read (a CRUD-style
permission matrix per data category — employees, timesheets, org structure, leave, payroll,
certifications, devices), the one write-back path (timesheet clock-in/out, and payroll mark-paid),
and full endpoint-by-endpoint documentation with examples.
