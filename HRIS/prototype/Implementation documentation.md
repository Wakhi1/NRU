# NRU HRIS — Implementation documentation

United Nations and Religions World Organization · Information Technology Department

This document describes how the HRIS prototype in `NRU HRIS Prototype.dc.html` is intended to be built as the **parent system of record**: the Node.js backend, the permission model, how data is shared with the systems that read from it, and the standalone VoIP service.

The prototype is the specification for screens and behaviour. This document is the specification for the system behind it.

---

## 1. Role of the system

NRU HRIS is the single authoritative record for a person. Every other system — fleet, data collection, payroll processing, access control, partner CRM — reads people, roles, structures and work-time rules from HRIS instead of keeping its own copy.

Three consequences shape the design:

1. **One person record, many consumers.** The person object is deliberately deep (identity, employment, structures, work time, pay, health, compliance, systems access). Consumers request only the sections they are entitled to.
2. **Permissions travel with the data.** Every response carries the caller's effective CRUD scope. A consuming system can never widen what HRIS granted.
3. **External data flows inward.** Partner and ministry feeds are ingested, mapped to HRIS entities, summarised, and surfaced in the CRM module — never stored as unmapped dumps.

---

## 2. Domain model

Core entities, in dependency order.

| Entity | Key fields | Notes |
| --- | --- | --- |
| `person` | `employee_no` (PK), legal name, national id, dob, gender, nationality, languages, address, contact, next of kin | Immutable `employee_no`; all consumers key on it |
| `employment` | person, position, department, duty station, grade, contract type, start, end, reports_to, cost centre | Versioned — history preserved, never overwritten |
| `org_unit` | id, kind (`department` \| `committee` \| `board` \| `group` \| `project_team`), name, lead, parent | One table for every structure kind |
| `membership` | person, org_unit, role_in_unit, from, to | Drives "works with" and committee/board seats |
| `reporting_line` | person, manager, from, to | Derived from `employment.reports_to`; kept separate so dotted lines are possible |
| `shift_pattern` | name, pattern, contracted hours, break rule, grace, overtime rule, rounding, auto clock-out, capture source | The timer configuration |
| `work_timer` | person, shift_pattern, start, end, source (`terminal` \| `mobile_gps` \| `web` \| `vehicle_log`), device, geo | Append-only event log |
| `leave_request`, `leave_balance` | person, type, dates, days, stage, status | Two-stage approval workflow |
| `payline`, `payroll_run` | run period, person, basic, allowances, overtime, deductions, net, approval chain | Run is a state machine (see §6) |
| `partner_org` | name, type, contacts, agreement, status | CRM |
| `programme` | name, partners, lead, indicators, assigned staff | Links HRIS people to collaborative work |
| `indicator_record` | programme, partner, indicator, period, value, source_feed, collected_by | `collected_by` is a `person` — this is the join that makes external data useful |
| `feed` | source, transport, cadence, field map, owner, status | External data intake |
| `role`, `permission` | role, module, crud flags | See §4 |
| `audit_event` | actor, action, entity, before, after, at, ip, consumer | Every write, no exceptions |

Reference data (departments, grades, leave types, indicator definitions) lives in seeded lookup tables so partners and ministries can be mapped against stable codes.

---

## 3. Backend architecture (Node.js)

A modular monolith first. It is one deployable, internally partitioned by module, with a message bus so modules can be split out later without rewriting callers.

```
nru-hris/
  src/
    server.ts                 Fastify bootstrap, plugin registration
    config/                   env schema, secrets loading
    platform/
      db.ts                   Postgres pool, transaction helper
      bus.ts                  event publish/subscribe (Redis Streams)
      auth/                   OIDC verify, service tokens, session
      scope/                  permission resolution + enforcement
      audit/                  audit_event writer
      jobs/                   BullMQ queues (feeds, summaries, payroll, exports)
    modules/
      people/                 person, employment, documents
      org/                    org_unit, membership, reporting_line
      worktime/               shift_pattern, work_timer, reconciliation
      leave/  benefits/  payroll/  recruitment/  performance/
      succession/  training/
      intake/                 feed connectors, field mapping, summariser
      crm/                    partner_org, programme, indicator_record
      access/                 roles, permissions, service accounts
      voip/                   standalone calling service (see §8)
      reporting/              read models, exports
    api/
      v1/                     REST route registration per module
      graphql/                optional single-request composition for consumers
      webhooks/               outbound subscriptions
```

**Stack.** Node.js 20 LTS · TypeScript · Fastify · PostgreSQL 15 (Prisma or Kysely) · Redis (cache, queues, streams) · BullMQ (scheduled work) · S3-compatible object store (documents, payslips, exports) · OpenTelemetry to your APM.

**Per-module shape.** Every module exposes the same four layers, so nothing leaks:

```
modules/<name>/
  routes.ts       HTTP surface, no business logic
  service.ts      use cases, transactions, events published
  repo.ts         SQL only
  policy.ts       who may do what to this module's entities
  events.ts       event names + payload contracts
```

**Request pipeline.** `authenticate → resolve scope → validate (zod) → service → audit → respond`. Scope resolution runs before validation so a caller without read access never learns whether a record exists.

**Events.** Writes publish domain events (`person.updated`, `employment.changed`, `timer.closed`, `leave.approved`, `indicator.ingested`). Consumers subscribe by webhook; internal read models rebuild from the same stream. This is what keeps the fleet and payroll systems current without polling.

---

## 4. Permission model (CRUD per user, per module)

Three layers resolve to one effective scope.

1. **Role** — a named set of module scopes. Shipped roles: HR administrator, Head of Department, Data & CRM officer, Employee, System administrator, Partner (external).
2. **Data scope** — how far the role reaches: `self`, `team` (direct reports), `department`, `organisation`, `programme`.
3. **Per-person override** — a grant or revocation on one module for one person, with a reason and an expiry.

Effective permission = role scope ∩ data scope, then overrides applied. Deny always wins.

```sql
create table permission (
  role_id     uuid references role(id),
  module      text not null,          -- 'people' | 'payroll' | 'crm' | 'voip' | …
  can_create  boolean default false,
  can_read    boolean default false,
  can_update  boolean default false,
  can_delete  boolean default false,
  data_scope  text not null default 'self',
  primary key (role_id, module)
);

create table permission_override (
  person_id   text references person(employee_no),
  module      text not null,
  crud        text not null,          -- 'CRUD' | 'RU' | 'R' | '-'
  reason      text not null,
  expires_at  timestamptz,
  granted_by  text references person(employee_no)
);
```

**Enforcement.** A single guard, applied as a Fastify pre-handler, plus a repository-level scope filter — never one without the other:

```ts
// modules/people/routes.ts
app.get('/v1/people/:id',
  { preHandler: requires('people', 'read') },
  async (req) => peopleService.get(req.params.id, req.scope));

// platform/scope/requires.ts
export const requires = (module: Module, action: Crud) => async (req, reply) => {
  const scope = await resolveScope(req.principal);       // role ∩ data scope ∩ overrides
  if (!scope.allows(module, action)) return reply.code(403).send({ error: 'out_of_scope' });
  req.scope = scope;                                     // repo layer narrows every query with this
};
```

**Field-level masking.** Sections of the person record carry a sensitivity class: `public` (name, position, department), `internal` (contact, structures, work time), `restricted` (pay, banking, tax), `sensitive` (health, disciplinary, next of kin). A scope grants read per class, so a fleet system reading a driver gets licence and duty hours but never banking or health.

**Published with the data.** Every response includes the scope that produced it, so consumers can render correctly and cannot silently exceed it:

```json
{
  "data": { "employee_no": "NRU-0142", "…": "…" },
  "meta": {
    "scope": { "module": "people", "crud": "R", "data_scope": "department",
               "fields": ["public", "internal"] },
    "as_of": "2026-08-23T00:31:00Z",
    "etag": "W/\"p-142-88\""
  }
}
```

---

## 5. Sharing data with other systems

Four mechanisms, chosen by the consumer's need.

**a. REST, scoped by service account.** Each consuming system gets its own account, its own role, and its own rate limit. Read paths are the same ones the UI uses.

```
GET  /v1/people?department=Logistics&fields=public,internal
GET  /v1/people/NRU-0044                     # driver record, masked by scope
GET  /v1/people/NRU-0044/worktime?from=…     # duty hours for the fleet system
GET  /v1/org/units/{id}/members
GET  /v1/shift-patterns
POST /v1/work-timers                         # a device or app writes a timer event
GET  /v1/programmes/{id}/indicators
GET  /v1/access/effective/{employee_no}       # what this person may do, per module
```

**b. Webhooks for change.** Consumers subscribe to events; HRIS signs each delivery (HMAC-SHA256 over the raw body, `X-NRU-Signature`), retries with exponential backoff, and exposes a replay endpoint for gap recovery. Delivery is at-least-once — consumers must be idempotent on `event_id`.

**c. GraphQL for composition.** Optional read-only endpoint for consumers that need a person plus employment, structures and work time in one round trip. Same scope guard; field resolvers apply the same masking.

**d. Batch export.** Signed, expiring S3 URLs for statutory returns and partner reconciliation. Every export is an `audit_event` naming the requester and the row count.

**Intake (data flowing in).** Each `feed` has a connector (`api_pull`, `sftp`, `csv_upload`, `webhook_push`), a declared field map, and a quarantine. The pipeline is:

```
fetch → validate schema → map fields → resolve entities → stage → summarise → publish
                                    ↓ unmapped / ambiguous
                                 quarantine (human review in the UI)
```

Entity resolution is what makes external data usable: `submitted_by → person.employee_no`, `facility_code → org_unit`, `driver_id → person`. Records that cannot be resolved are held rather than guessed. The nightly summariser writes the plain-language lines the External data screen shows, alongside the numbers.

**Contracts.** OpenAPI 3.1 generated from the zod schemas, published per version. `/v1` is stable; additive changes only. Breaking changes ship as `/v2` with both live for two release cycles.

---

## 6. Work time and payroll as state machines

Work timers are append-only events, never edited rows. A day's attendance is a projection over those events plus the person's `shift_pattern`: grace period decides *late*, contracted hours decide *overtime*, rounding is applied at projection time. Corrections are new events with a `correction_of` pointer, so the original capture survives audit.

A payroll run moves `draft → inputs_locked → in_review → approved_finance → approved_ed → paid → closed`. Transitions are guarded by permissions (`payroll:update` to advance to review, `payroll:approve` for the chain) and each one writes an audit event. Once `inputs_locked`, timesheets for the period become read-only — the reconciliation the prototype's Time & Attendance screen runs must complete before that lock.

---

## 7. Non-functional requirements

- **Auth.** OIDC (Entra ID or Keycloak) for people; client-credentials service accounts for systems; MFA mandatory for any role holding `update` on payroll, people or access.
- **Audit.** Every write, every export, every permission change. Append-only, retained seven years.
- **Data protection.** Encryption in transit and at rest; `restricted` and `sensitive` columns additionally encrypted at application level; consent recorded per person; retention seven years after exit, then anonymise.
- **Availability.** Two application instances behind a load balancer; Postgres streaming replica; RPO 15 min, RTO 4 h.
- **Testing.** Contract tests per API version, permission-matrix tests as a table-driven suite (every role × every module × every action), and a seeded demo dataset matching the prototype.
- **Observability.** Structured logs with correlation ids, traces across intake jobs, alerts on feed lag and webhook failure rate.

---

## 8. VoIP — standalone feature

**Noted as a standalone feature.** VoIP calling is a separate service with its own datastore and its own deployment. HRIS is only its directory. If the calling service is down, HRIS is unaffected; if HRIS is down, calling continues from its cached directory.

- **Availability.** Enabled for every user. The `voip` module appears in the permission matrix so the scope is explicit and auditable, but the default for all roles is full CRUD over their own calls.
- **Architecture.** SIP/WebRTC. An SBC or a hosted provider (Twilio, Vonage, or self-hosted Asterisk/FreeSWITCH) terminates media; the Node service handles registration, presence, routing and CDR. Media never traverses HRIS.
- **Integration surface.** HRIS publishes `person.contact.updated` and `person.presence.hint`; the calling service consumes them to keep extensions current. It writes back only call detail records: `caller`, `callee`, `started_at`, `duration`, `direction`, `outcome`. No call content, no recordings, unless a separate consent flag is set per participant.
- **In the UI.** Every person record, every reporting-line row and every "works with" card carries a Call action; the call panel is a standalone overlay, independent of the screen behind it.
- **Compliance.** Emergency-calling location handling, per-country number provisioning, and CDR retention are configured in the calling service, not in HRIS.

---

## 9. Build order

1. Platform: auth, scope resolution, audit, migrations.
2. `people` + `org` + `access` — the record and its permission model. Nothing else is meaningful before this.
3. `worktime` — shift patterns, timer events, projections.
4. `leave`, then `payroll` (needs work time locked).
5. `intake` + `crm` — feeds, entity resolution, summariser, partner and programme records.
6. Outbound sharing: service accounts, webhooks, OpenAPI publication.
7. `voip` as a separate service, once the directory is stable.
8. `recruitment`, `performance`, `succession`, `training`, `benefits`, `reporting`.
