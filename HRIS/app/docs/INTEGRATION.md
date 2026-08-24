# Integrating with the HRIS

This HRIS is the organisation's single source of truth for employee and timesheet data. Rather
than each of the following systems keeping its own copy of employee records, they should pull
what they need from here:

- **Smartphone tracking system** — needs to know who an active employee is (to match a device/app
  login to a real person) and may want to cross-check timesheets against GPS activity.
- **Accounting system** — needs employee details (for expense/payment references) and timesheets
  (for cost allocation, billing, or payroll reconciliation).
- **Fleet / logistics management system** — needs to know which employees are active/eligible to
  be assigned a vehicle or route, and their attendance/timesheet hours for scheduling.

This document describes the read-only integration API built for exactly this. It is separate from
the interactive web application — no login, no cookies, no session — and is meant to be called by
a server-side process in each of those systems, not by an end user's browser.

## Why API keys, not a shared login

The HRIS's normal authentication is session/cookie-based and modelled around a human logging in
through a browser (including MFA). A batch job or backend service in another system has no
browser and no human to complete an MFA prompt. Instead, each integrating system is issued its own
**API key** — a long random secret, scoped to only the data it actually needs, that it sends with
every request. Keys can be revoked individually and instantly if a system is decommissioned or a
key leaks, without affecting anyone else's access or any human user's password.

## Getting a key

An HR administrator or System administrator issues keys from **Integrations** in the HRIS sidebar
(admin-only). When creating a key they choose:

- a **name** (e.g. "Fleet & Logistics system") — this name is what shows up in the audit trail
  every time the key is used, so pick something that identifies the calling system, not a person.
- an **access matrix** — a genuine Create/Read/Update/Delete grid per data category, the same shape
  as the internal permission matrix in Settings, just applied to this key instead of a role. Grant
  only what the system actually needs.
- an optional **expiry date**.

An existing key's access matrix can be changed later too, via **Edit access** on that key's row —
this updates what the credential is allowed to do without rotating the secret, so a live
integration doesn't need a new key re-distributed just to widen its access.

### The access matrix

Only the cells below actually exist — the UI never offers a checkbox for a capability that doesn't
have a real endpoint behind it. There is deliberately no Delete anywhere on this API, and no
Create/Update on `employees`/`org`/`leave`/`certifications`/`devices`: HRIS stays the system of
record for that data, and an external system amends attendance by adding a *new* timesheet row,
never by deleting history.

| Category | Create | Read | Update | Delete |
|---|---|---|---|---|
| `employees` | — | ✅ | — | — |
| `timesheets` | ✅ clock in | ✅ | ✅ clock out | — |
| `org` | — | ✅ | — | — |
| `leave` | — | ✅ | — | — |
| `payroll` | — | ✅ | ✅ mark paid | — |
| `certifications` | — | ✅ | — | — |
| `devices` | — | ✅ | — | — |

Each granted cell becomes one `category:action` scope string under the hood (e.g. `timesheets:create`)
— the endpoint reference below groups by category and tells you which action each one needs.

### Suggested access per named system

These are starting points, not a fixed rule — an admin can grant any combination:

| System | Recommended access | Why |
|---|---|---|
| Smartphone tracking | Employees: R · Devices: R · Timesheets: CRU | Match a tracked device to a person; push clock-in/out events from the device (`timesheets:create`/`:update`) and read history back. |
| Accounting | Employees: R · Timesheets: R · Org: R · Payroll: RU | Cost allocation by department/cost centre, payroll GL posting from run/line totals, and confirming back once a run is actually disbursed — never bank or tax details. |
| Fleet / logistics | Employees: R · Timesheets: R · Leave: R · Certifications: R · Org: R | Don't roster someone who's on leave or whose driving/safety certification has lapsed; route by duty station. Grant Timesheets: CU too if the fleet system itself captures clock events via vehicle logs (`source: "vehicle_log"`). |

Payroll's Update cell is deliberately not suggested for smartphone tracking or fleet/logistics —
neither has a legitimate reason to touch payroll state, so there's no reason to grant it even
though the matrix doesn't stop an admin from doing so. Grant it only to the system that actually pays people.

The full key is shown **exactly once**, immediately after creation, in a one-time reveal (the same
pattern used for MFA backup codes elsewhere in this system). Only a hash of it is stored — if it's
lost, revoke it and issue a new one. Treat it as a credential: store it in the other system's
secrets manager / environment configuration, never in source control.

## Authenticating requests

Send the key as a bearer token on every request:

```
GET /api/v1/integration/employees?status=active HTTP/1.1
Host: <hris-host>
Authorization: Bearer hris_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

```bash
curl -H "Authorization: Bearer hris_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \
  "https://<hris-host>/api/v1/integration/employees?status=active"
```

A missing or invalid key returns `401`. A key that doesn't carry the scope a given endpoint
requires returns `403`. A revoked or expired key returns `401` just like an invalid one.

**In production, only call this over HTTPS.** This dev/local instance runs plain HTTP; a real
deployment should terminate TLS (either in the app itself via `SSL_KEY_PATH`/`SSL_CERT_PATH`, or
in a reverse proxy in front of it) before any real API key is used against it.

## Managing keys

From the **Integrations** page, each key row has:

- **Revoke** — deactivates the key immediately (any request with it starts returning `401`). Not
  permanent — a revoked key can be **Reactivated** later without issuing a new one, so pausing a
  system's access (e.g. during maintenance, or while investigating something) doesn't force you to
  re-distribute a new secret afterward.
- **Reactivate** — undoes a revoke. Only shown on an inactive key.
- **Renew** — rotates the credential: same key row (same `id`, name, scopes, creator, audit
  history), brand new secret. The old secret stops working the moment you renew; the new plaintext
  is shown exactly once, the same one-time reveal as creation. Use this for routine rotation or
  after a suspected leak, when you want to keep the same key identity rather than create a new one.
- **Delete** — permanently removes the row. Unlike revoke, there is no way back — use Revoke if
  there's any chance you'll want this key again, Delete only for a system that's genuinely gone.

## The join key: `employee_no`

Every table in this system's data model hangs off `employee_no` (e.g. `NRU-0001`) — it is the
stable identifier for a person, independent of their name, email, or job title, all of which can
change. **Store `employee_no` as the foreign key back to HR data in your own system**, rather than
matching people by name or email (names have duplicates and change on marriage/etc.; emails get
reissued). If your system doesn't already have a field for this, add one — it's the single most
important integration decision, since everything else (timesheets, future endpoints) is keyed off
it too.

## Endpoints

### `GET /api/v1/integration/employees`

Scope required: `employees:read`.

Query parameters (all optional):
- `status` — filter to one status (`active`, `on_leave`, `suspended`, `exited`).
- `updated_since` — ISO 8601 timestamp; only returns people whose record changed after this time,
  for incremental sync instead of pulling the full list every time.

Example response:

```json
{
  "data": [
    {
      "employee_no": "NRU-0009",
      "full_legal_name": "Andile Ngwenya",
      "email": "employee@nru.org",
      "status": "active",
      "updated_at": "2026-08-23 22:50:25",
      "position_title": "Field Enumerator",
      "contract_type": "permanent",
      "start_date": "2023-01-16",
      "department": "Field Operations"
    }
  ]
}
```

### `GET /api/v1/integration/employees/:employeeNo/timesheets`

Scope required: `timesheets:read`. Query parameters: `from`, `to` (dates, both optional — omit
both for full history, which can be large).

### `GET /api/v1/integration/timesheets`

Scope required: `timesheets:read`. An org-wide pull across all employees for a window — useful for
the accounting or fleet system reconciling hours in bulk rather than one employee at a time. Query
parameters: `from`, `to`, `department` (all optional). Capped at 5,000 rows per call — page by
narrowing the date range if you need more.

Example response (both timesheet endpoints share this shape, the org-wide one adds
`full_legal_name`/`department`):

```json
{
  "data": [
    {
      "id": 81,
      "employee_no": "NRU-0009",
      "full_legal_name": "Andile Ngwenya",
      "department": "Field Operations",
      "clock_in": "2026-08-23 10:58:44",
      "clock_out": "2026-08-23 10:58:44",
      "source": "web",
      "device": "Browser"
    }
  ]
}
```

`source` tells you how the clock event was captured (`terminal`, `mobile_gps`, `web`,
`vehicle_log`).

### `POST /api/v1/integration/employees/:employeeNo/clock-in`

Scope required: `timesheets:create`. Records a new open timer for that employee, exactly like the
internal "Clock in" button does for a logged-in user — including the same guard against clocking in
twice in one day without clocking out first (`409` if already clocked in).

Body (all fields optional):
```json
{ "source": "mobile_gps", "device": "iPhone 13 — Andile N.", "geo": "-26.3054,31.1367" }
```
`source` defaults to `mobile_gps` and accepts `terminal`, `mobile_gps`, or `vehicle_log` — `web` is
rejected here (`400`), that value is reserved for a clock-in made through the HRIS browser UI
itself. `geo` is free text (typically `"lat,lon"`) for a location-aware clock-in.

Response: `{ "data": { "id": 142, "employee_no": "NRU-0009", "source": "mobile_gps" } }`.

### `POST /api/v1/integration/employees/:employeeNo/clock-out`

Scope required: `timesheets:update`. Closes that employee's currently open timer (`404` if they
don't have one) — mirrors the internal "Clock out" button exactly. No body required.

Response: `{ "data": { "id": 142, "employee_no": "NRU-0009" } }`.

### `GET /api/v1/integration/org-units`

Scope required: `org:read`. Full department/committee hierarchy — `id`, `kind`, `name`,
`parent_id`, `cost_centre`, `duty_station`, `lead_employee_no`, and `current_headcount`. Use
`parent_id` to reconstruct the tree; a `null` parent is a top-level unit.

### `GET /api/v1/integration/employees/:employeeNo/leave` and `GET /api/v1/integration/leave`

Scope required: `leave:read`. Same per-employee/org-wide pairing as the timesheet endpoints.
Query parameters: `status` (`pending`/`approved`/`declined`/`cancelled`), `from`, `to`
(overlap-filtered against each request's date range), and (org-wide only) `department`. Returns
`leave_type`, `start_date`, `end_date`, `days`, `status` — the free-text `reason` field is
deliberately excluded; a scheduling system needs to know *that* someone is unavailable, not why.

### `GET /api/v1/integration/payroll/runs` and `GET /api/v1/integration/payroll/runs/:id/lines`

Scope required: `payroll:read`. The first lists every payroll run (`period`, `status`, `paid_at`,
`employee_count`, `net_total`); the second returns that run's per-employee breakdown
(`basic`, `allowances`, `overtime`, `deductions`, `net`, plus `department`) for GL posting.
**`bank_account` and `tax_number` are never returned by this API, at any scope** — an accounting
integration reconciles by `employee_no` and period; it does not originate the actual bank payment.

### `GET /api/v1/integration/employees/:employeeNo/certifications` and `GET /api/v1/integration/certifications`

Scope required: `certifications:read`. `name`, `issued_at`, `expires_at`, `issuing_body`. The
org-wide endpoint accepts `?expiring_within_days=N` to pull only what's about to lapse — the
typical use case for a fleet/logistics system checking driver or safety certifications before
dispatch.

### `GET /api/v1/integration/employees/:employeeNo/device` and `GET /api/v1/integration/devices`

Scope required: `devices:read`. `extension`, `status`, `device_assigned` (and, org-wide,
`full_legal_name`/`department`) — enough to correlate a tracked device back to a person. SIP
credentials, voicemail PIN, and emergency/forwarding numbers are never returned here.

## Two-way payroll (accounting write-back)

Most of this API is read-only; payroll is one of the two places (alongside timesheet clock-in/out
above) with a deliberate, narrow write capability, because the real workflow needs it: **HRIS runs
the payroll approval chain, the accounting system executes the actual payment, and then HRIS needs
to know it happened.**

1. HR/Finance manage the run inside HRIS as normal, through its existing approval chain: `draft` →
   `inputs_locked` → `in_review` → `approved_finance` → `approved_ed`.
2. Once a run reaches `approved_ed`, HRIS's own approval work is done — the accounting system picks
   it up from there (via `GET /payroll/runs` / `GET /payroll/runs/:id/lines`, scope `payroll:read`)
   and actually disburses the money in its own system.
3. When that's complete, the accounting system calls back:

   ### `POST /api/v1/integration/payroll/runs/:id/mark-paid`

   Scope required: `payroll:update`. Body (both fields optional):
   ```json
   { "payment_reference": "ACCT-2026-08-0091", "paid_at": "2026-08-25T09:00:00Z" }
   ```
   `paid_at` defaults to the moment of the call if omitted. On success the run's `status` becomes
   `paid`, `paid_via` is recorded as `accounting_integration` (distinguishing it from a run someone
   advanced manually inside HRIS), and `payment_reference` is stored for reconciliation. The same
   payslip-ready email every employee in the run gets from a manual "Advance to Paid" click inside
   HRIS is sent here too — the notification doesn't depend on which path completed the run.

   **This only works from `approved_ed`.** Calling it on a run in any other state (including
   already `paid`) returns `400` — it cannot be used to skip HRIS's own approval chain, and it
   cannot fire twice for the same run.

The manual path — an HR/Finance admin clicking "Advance" inside HRIS itself once they've confirmed
payment some other way — still exists exactly as before. This callback is an *additional* way to
reach `paid`, not a replacement; an organisation without an accounting integration yet keeps
working exactly as it always has.

## What is deliberately NOT exposed, and why

This API returns a narrower field set than even a fully-scoped internal HR administrator sees in
the main application, on purpose — an external system integration is a bigger blast radius than an
internal role, so it gets the minimum necessary by default:

- **No bank account or tax number, ever, at any scope.** `payroll:read` returns gross/net figures
  for GL posting, deliberately stopping there — the actual bank payment origination stays inside
  this app's own payroll module, never the integration API.
- **No national ID, date of birth, or next-of-kin details.**
- **No performance reviews, succession plans, or disciplinary/asset-declaration records** — none
  of the three named integrating systems have a legitimate need for these, so there is no scope
  that exposes them. A future integration that genuinely needs one of these should get its own
  new, narrowly-scoped endpoint and a deliberate decision, not a broadened existing grant.
- **No SIP credentials, voicemail PIN, or call-forwarding numbers** — `devices:read` returns only
  what's needed to correlate a tracked device to a person, not how to operate their phone line.
- **No leave `reason` text** — `leave:read` returns dates and status only.
- **Write access is limited to exactly the matrix above.** `payroll:update` can only flip an
  already-`approved_ed` run to `paid` with a payment reference — it cannot create or delete a run.
  `timesheets:create`/`timesheets:update` can only clock an employee in or out — they cannot edit or
  remove an existing timesheet row, cross into any other employee's data, or touch anything outside
  attendance. There is no Delete on any category, anywhere on this API. A future integration that
  needs a genuinely new write capability gets a new, deliberately-scoped matrix cell and endpoint —
  never a broadened existing one.

## Every call is audited

Every request to these endpoints writes a row to the HRIS's own audit trail (visible to HR/System
administrators under **Audit trail**), attributed to the calling key's name via the `consumer`
column — so "which system pulled what, and when" is always answerable, the same way every human
action in the app already is.

## Operational notes

- **Rotate keys periodically** and whenever staff who know a key change roles or leave.
- **One key per system**, not one shared key across all three integrations — this keeps the audit
  trail meaningful and means revoking one system's access never affects another's.
- **Revoke unused keys.** A key with no traffic for a long time is a bigger risk than benefit.
- If a key is ever suspected compromised, revoke it from the Integrations page immediately —
  revocation takes effect on the very next request, there is no caching/propagation delay.
