# NRU Smart Phone Tracking & Data Collection Monitoring
## System architecture and implementation guide

Version 1.0 · Information Technology Department · United Nations and Religions World Organization

This document describes the architecture behind the prototype in `NRU Tracker.html` and how it should be
built for production. It is written for the implementing engineers, the IT department that will run it, and
the departments whose people and work it monitors.

---

## 1. What the system does

The system tracks every organisation-issued smartphone and the people carrying them, so that data collected
in the field can be trusted. Four claims must hold at all times:

1. **We know where every issued handset is** — field, office, depot and vehicle alike.
2. **A collector cannot start work outside their assigned zone** — location confirmation is the login, not a warning.
3. **Every record carries positional and photographic evidence** taken by the handset, not typed by a person.
4. **Voice is carried on the same data bundle as the forms** — no separate airtime line.

Everything else in the system exists to serve those four claims.

---

## 2. People come from the HRIS — always

**The system never owns employee records.** Every person it displays — employees, enumerators, field data
collectors, drivers, supervisors, department managers, procurement and accounts staff — is pulled from the
**HRIS (Human Resource Information System) database**. The tracking system stores only the *operational*
attributes that HRIS does not hold: the handset assigned, the geofence zone, check-in state, VoIP extension,
and today's activity.

### 2.1 Ownership boundary

| Attribute | System of record |
| --- | --- |
| Employee number, full name, photograph | **HRIS** |
| Job title, role, department, duty station | **HRIS** |
| Employment status (active, on leave, suspended, exited) | **HRIS** |
| Line manager / reporting chain | **HRIS** |
| Grade / band, and the approval limit that follows it | **HRIS** |
| Organisational unit membership — the basis of role assignment and scope | **HRIS** |
| Contact details, next of kin | **HRIS** |
| Assigned handset (IMEI, serial, asset tag) | Tracking system |
| Assigned geofence zone and schedule | Tracking system |
| Role-to-permission mapping — what a role may do | Tracking system |
| Temporary elevation / delegation and its expiry | Tracking system |
| Check-in records, tracks, submissions, photographs | Tracking system |
| VoIP extension and call detail records | Tracking system |

The rule: **if HR would change it on a form, HRIS owns it.** The tracking system must never present an edit
field for an HRIS-owned attribute — it links out to HRIS instead.

### 2.2 How the pull works

- **Nightly full reconciliation** (02:00) — the identity service reads the HRIS employee endpoint and
  reconciles the local `person` projection: new starters appear, changed departments propagate, exited staff
  are deactivated.
- **Event-driven deltas** — where HRIS can emit them, subscribe to `employee.created`,
  `employee.updated`, `employee.transferred`, `employee.terminated` on the message bus and apply within minutes.
  Termination is the critical one: it must revoke the device session, the VoIP extension and the geofence
  assignment in the same transaction.
- **On-demand fetch** — opening a person's profile refreshes that one record, so a supervisor never argues
  with a stale job title.

Integration is read-only over HTTPS with mutual TLS, using an HRIS service account scoped to the employee
directory. If HRIS exposes SCIM 2.0, use `/Users` and `/Groups` and skip a custom adapter entirely.

```
HRIS  ──(nightly full + event deltas)──▶  Identity & Directory Service
                                              │
  person projection (id, name, photo, title, grade, unit, station, status, line manager)
                                              │
        ┌─────────────────────┬───────────────┴───────────────┬──────────────────────┐
   Tracking API          VoIP / PBX                    Accounting system        Reporting
 (device, zone,      (extension per person,          (payroll cost centres,     (aggregates
  check-in, tracks)   presence from device state)     claims, fleet costs)       only)
```

### 2.3 Employee photographs

The staff photograph shown against every list row, map pin popup and profile drawer is the **HRIS ID
photograph**, fetched through the identity service and cached as a resized derivative (256 px and 64 px).
Field officers are recognised by face in the control room — that is the point of showing them. Where HRIS has
no photograph, the interface falls back to an initials monogram (as the prototype does) and raises a
data-completeness item for HR, rather than inventing an avatar.

Retention follows the HRIS record: when HRIS marks an employee exited, the cached photograph is deleted at
the next reconciliation.

### 2.4 Identity and sign-in

Sign-in is **single sign-on against the corporate directory** (Entra ID / Keycloak / whatever NRU standardises
on), not a password table in this system. HRIS supplies who a person *is*; the directory supplies how they
*authenticate*; the tracking system supplies what they may *see*. Roles are **derived** from HRIS job data
rather than assigned by hand — see §3.

---

## 3. Access control — RBAC inherited from HRIS

Access is **role-based**, and **roles are derived from HRIS**, not assigned by hand. Nobody in IT decides who
is a department manager: HRIS already knows, because HR appointed them. The system's job is to turn that HR
fact into a set of permissions, consistently, every night.

### 3.1 The chain

```
HRIS attributes                  Role assignment           Permissions            Scope
───────────────                  ───────────────           ───────────            ─────
job title / grade    ──┐
unit / department    ──┼─▶  mapping rules  ──▶  role  ──▶  permission set  ──▶  data scope
duty station         ──┤      (versioned,                    (fixed per role)      (unit + station)
employment status    ──┘       auditable)
```

Three things stay separate, or the model rots within a year:

- **Role** — what kind of user this is. Seven of them, below. Derived from HRIS.
- **Permission** — one capability, e.g. `location.live.view`. Grouped into a fixed set per role, owned by the
  tracking system, changed only by the Head of IT through a versioned policy.
- **Scope** — which records the permission reaches. Derived from the person's HRIS organisational unit and
  duty station: a WASH manager's `assignment.view` covers WASH assignments and nobody else's.

A permission without a scope is meaningless here. Every authorisation answers two questions together: *may
this role do this?* and *does this record fall inside this person's scope?*

### 3.2 Role mapping rules

Mapping is configuration held in version control, applied at each HRIS reconciliation. Rules evaluate in
order; first match wins.

| # | HRIS condition | Application role |
| --- | --- | --- |
| 1 | Unit = Information Technology, title contains "Head of IT" | `head_of_it` |
| 2 | Unit = Information Technology, title contains "Control room" or "Systems supervisor" | `control_room_supervisor` |
| 3 | Title contains "Data quality" | `data_quality_officer` |
| 4 | Grade ≥ senior management | `executive` |
| 5 | Named as line manager for ≥ 1 active employee in their unit | `department_manager` |
| 6 | Job family = field data collection / enumeration | `field_collector` |
| 7 | Any other active employee | `staff_device_holder` — device enrolled, no console |
| — | Employment status ≠ active | **no role — access revoked** |

Rule 7 carries weight: an accounts clerk or a driver is still an employee device holder. They sit in a
geofence zone and hold a VoIP extension, but they cannot open the console. That is how geofencing covers the
whole organisation without giving the whole organisation a login.

### 3.3 Roles, permissions and scope

| Role | Scope | Key permissions | Explicitly denied |
| --- | --- | --- | --- |
| **Head of IT** | Organisation | Everything, plus `admin.users`, `admin.roles`, `policy.edit` | — |
| **Control-room supervisor** | All field teams | `location.live.view`, `location.history.view`, `checkin.override.grant`, `device.ping`, `alert.manage`, `geofence.manage` | `admin.users` |
| **Department manager** | Own unit(s) | `assignment.manage`, `submission.view`, `quality.resolve`, `evidence.view`, `report.export` | `location.live.view`, `location.history.view` |
| **Data quality officer** | All submissions, read | `submission.view`, `evidence.view`, `quality.flag.raise`, `quality.resolve` | Any location, any assignment change |
| **Executive** | Organisation, aggregate only | `aggregate.view`, `report.export` | Every individual-level read |
| **Field collector** | Self | `assignment.own.view`, `submission.own.create`, `evidence.own.capture`, `checkin.own.submit`, `voice.call` | Anyone else's record |
| **Staff device holder** | Self, device only | `checkin.own.submit`, `voice.call` | Console access entirely |

Two rules sit above the table. **Live location and location history are the most restricted permissions in
the system** — IT and the control room hold them, nobody else by default. And **denial beats grant**: an
explicit deny cannot be overridden by a delegation or a group membership.

### 3.4 Where authorisation is enforced

Server-side, on every request, in a policy layer in front of the services — never in the client.

```
request ──▶ authenticate (SSO token)
        ──▶ load person + role + scope from the identity service (cached 5 min)
        ──▶ permission check              → 403 if the role lacks it
        ──▶ scope check on the record     → 404 (not 403) if outside scope
        ──▶ service
        ──▶ audit entry for every privileged permission
```

**404 rather than 403 for out-of-scope records** is deliberate: a manager probing another department's
assignment ids should learn nothing from the response.

### 3.5 Exceptions, delegation and elevation

Real organisations need exceptions; unrecorded exceptions are how RBAC dies.

- **Delegation** — a manager going on leave delegates in HRIS to a named colleague. Reconciliation grants the
  same permissions over the same scope, with the leave end date as expiry.
- **Temporary elevation** — the Head of IT may add a role for a fixed window, 30 days maximum. It expires by
  itself; there is no permanent manual grant.
- **Break-glass** — one sealed emergency account held by the Head of IT. Every use alerts the executive and
  writes to the audit trail.
- **Check-in override** (§5) is itself a permission, `checkin.override.grant`, held by supervisors and IT, and
  every use carries the granting person's HRIS identity.

Every exception is time-bound, attributed and auditable.

### 3.6 Review and revocation

- **Nightly** — reconciliation re-derives every role from HRIS. A transfer changes scope by the next morning.
- **On event** — a termination or role change invalidates the session token within minutes, so an
  ex-supervisor does not keep live location until their session happens to lapse.
- **Quarterly** — access review: the console produces a permission matrix per department for the manager to
  confirm. Unconfirmed elevations expire rather than persist.

The permission matrix on the prototype's *Users &amp; permissions* screen is this model rendered — capabilities
down the side, roles across the top.

---

## 4. Component architecture

### 4.1 Mobile client (Flutter, Android first)

One codebase, phone and tablet. Responsibilities:

- **Check-in gate** — blocks the form list until a GNSS fix inside the assigned zone is obtained and a
  check-in photograph is taken (§5).
- **Location service** — foreground service with a persistent notification during shift hours only. Fixes at
  an adaptive cadence: 30 s moving, 5 min stationary, immediate on submission.
- **Form runtime** — offline-first. Records and photographs are written to an encrypted local store
  (SQLCipher) and queued.
- **Camera** — proof photographs, stamped at capture with position, accuracy, time and zone. The stamp is
  written by the app into signed EXIF plus a server-verified payload; it is not user-editable.
- **VoIP client** — SIP/WebRTC registration to the PBX, Opus at 16 kbit/s, push-to-talk fallback on weak signal.
- **Sync engine** — resumable, chunked upload; retries with exponential backoff; nothing is deleted from the
  handset until the server acknowledges each item.

Anti-tamper is mandatory: mock-location detection, root/emulator detection, Play Integrity attestation, and
rejection of network-only (cell tower) fixes at check-in.

### 4.2 Backend services

| Service | Responsibility | Notes |
| --- | --- | --- |
| Identity & Directory | HRIS pull, person projection, role mapping, SSO | The only service that talks to HRIS |
| Device & Fleet | Handset registry, assignment to person, health telemetry | Keyed by IMEI + asset tag |
| Location | Fix ingestion, track storage, geofence evaluation | Highest write volume in the system |
| Geofence & Policy | Zone definitions, rules, tolerance, check-in policy | Zones stored as PostGIS geometries |
| Check-in | Login gate decisions, overrides, audit | Every decision is immutable and attributed |
| Collection | Assignments, forms, submissions, offline queue | |
| Evidence | Photographs, stamps, verification, retention | Object storage + signed URLs |
| Quality | GPS mismatch, stale fix, accuracy, duplicate and speed checks | Runs on submission, not nightly |
| Voice (PBX) | Extensions, on-net routing, SIP trunk breakout, CDRs | Presence derived from device state |
| Reporting | Aggregates, scheduled exports, PDF/CSV/XLSX | Reads a separate read-model |
| Notification | Alerts to control room, overrides, missed calls | |

Suggested stack: Flutter (mobile) · React or the delivered HTML/CSS system (web console) · Kotlin/Spring or
Node/NestJS services · **PostgreSQL + PostGIS** · Redis · Kafka or RabbitMQ · MinIO/S3 for evidence ·
Asterisk or FreeSWITCH for the PBX · Keycloak for SSO. Nothing here requires a cloud that NRU cannot host.

### 4.3 Data model — core entities

```
person (from HRIS)      1 ──── n  device_assignment  n ──── 1  device
person                  1 ──── n  check_in
device                  1 ──── n  location_fix          (partitioned by day)
zone (PostGIS polygon)  1 ──── n  zone_assignment  ──▶ person | team | device_class
assignment              1 ──── n  submission        1 ──── n  photograph
submission              1 ──── n  quality_flag
person                  1 ──── n  call_detail_record
```

`location_fix` is the volume table: partition by day, index on `(device_id, captured_at)`, and roll off to
daily distance summaries at 90 days per the data-protection policy.

---

## 5. Enforced check-in — the implementation that matters most

The gate is a **server decision**, never a client one. The client may not grant itself a shift.

```
1. Collector signs in (SSO).
2. App requests a GNSS fix. Network-only fixes are rejected outright.
3. App posts {device, person, lat, lng, accuracy, provider, integrity_token, captured_at} to /check-in.
4. Server evaluates, in order:
     a. Is the person active in HRIS?                      → else refuse
     b. Is the device assigned to this person?             → else refuse
     c. Is integrity attestation valid, mock location off? → else refuse and alert
     d. Is accuracy within the policy ceiling?             → else ask for a better fix
     e. Is the point inside the assigned zone + tolerance? → else refuse with distance
5. On refusal the response carries the distance and the zone name; the app shows them
   and offers exactly one action — request override.
6. An override is granted by a supervisor, stored with the granting person's identity,
   and expires with the shift.
7. On success: shift opens, forms unlock, position is bound to the login record.
```

Policy values are configuration, not code: tolerance radius (default 150 m), accuracy ceiling, selfie
required, re-confirmation interval (default 4 h), and offline behaviour (confirm at next sync).

**Offline login.** A collector with no data connection at 06:00 in a rural ward must still work. The app
evaluates the gate locally against the cached zone, records the fix and the photograph, and marks the shift
*provisionally* open. At the next sync the server re-evaluates; a provisional shift that fails is flagged and
its submissions held for review, not silently accepted.

---

## 6. Geofencing across all employee devices

Geofencing is **not** a field-team feature. Every issued handset belongs to a zone:

| Device class | Zone type | What is recorded |
| --- | --- | --- |
| Field handset | Field zone (team) | Continuous track during shift, entry/exit/dwell, check-in |
| Office handset | Site campus | Zone state and check-in only — no continuous track |
| Vehicle handset | Depot + route corridor | Dwell and exit alerts, distance for fleet costing |

The distinction is deliberate and must be stated in the privacy notice: office staff are confirmed *present*,
they are not *tracked*. Evaluate zone membership server-side on ingestion with PostGIS `ST_DWithin`, and store
transitions as events (`entered`, `exited`, `dwell_exceeded`) rather than recomputing from raw fixes.

---

## 7. Photographic proof

- Minimum one photograph per record; configurable per form.
- Captured in-app only. The gallery picker is disabled — an old photograph cannot be passed off as today's.
- At capture the app embeds position, accuracy, time, zone and device id, and signs the payload with a
  device-held key. The server verifies the signature and cross-checks the stamp against the fix it already
  holds for that moment; a mismatch raises a quality flag.
- Stored in object storage against the *submission*, not the handset — deleting the record on the phone does
  not remove evidence already synced.
- Downscaled on device before upload (long edge 1600 px, WebP) so a rural 2G connection can still deliver.

---

## 8. Voice over IP

VoIP replaces the airtime bundle, not the data bundle. Implementation notes:

- One extension per person, provisioned from the HRIS pull and de-provisioned on termination.
- **On-net** — handset↔handset, handset↔office, team calls — routes internally and costs nothing beyond the
  data already purchased. Opus at 16 kbit/s, roughly 7 MB per hour of talk.
- **Off-net** — public numbers — breaks out through a single SIP trunk, billed centrally to the department
  rather than as airtime on each handset.
- Presence comes from device state already known to the tracking system: online, idle, offline. A call to an
  offline handset queues as a missed-call card delivered at next sync.
- On weak signal the client degrades to push-to-talk, which queues like a form rather than failing.
- Calls are not recorded by default. Where a call is recorded, both parties are notified in-app and the
  recording is retained under the same policy as submissions.
- Every call produces a CDR shown in the person's profile — voice lives with the person, not as a separate
  destination in the menu.

---

## 9. Integration with the other departmental systems

| System | Direction | Payload |
| --- | --- | --- |
| **HRIS** | in | People, photographs, departments, employment status (§2) |
| **Accounting** (`NRU Accounting.html`) | out | Fleet distance and vehicle dwell for fleet costing; field allowances by confirmed shift; departmental cost centres |
| **Procurement** | out | Handset asset register, replacement demand from fleet-health data |
| **Fleet management** | both | Vehicle device assignment, depot zones, distance run |
| **Corporate directory / SSO** | in | Authentication, group membership |

All integrations are asynchronous over the message bus with an outbox pattern; no service reaches into
another's database.

---

## 10. Security, privacy and retention

- Transport: TLS 1.3 everywhere; mutual TLS between services and to HRIS.
- At rest: database and object storage encrypted; the handset store encrypted with a key in the Android keystore.
- **Location data is the most restricted surface in the system.** Only the Head of IT and control-room
  supervisors may see an individual live position or track. Department managers see progress; executives see
  totals.
- Tracking is bounded by shift hours. Outside them the foreground service stops and no fixes are recorded.
- Retention: raw fixes 90 days, then reduced to daily distance totals; submissions and photographs per the
  programme's data-protection schedule; CDRs 12 months; audit trail 7 years.
- Every privileged action — override granted, policy changed, record deleted, report exported — is written to
  an append-only audit trail with the acting person's HRIS identity.
- Publish a plain-language privacy notice to staff before rollout, and have it acknowledged in-app at first
  login. Consent is not a checkbox buried in settings.

---

## 11. Implementation sequence

**Phase 0 — Foundations (weeks 1–3)**
Environments, CI/CD, SSO, the HRIS integration and the person projection, plus the role-mapping rules and the
policy layer (§3). Nothing else starts until people flow in correctly from HRIS — photographs, terminations
and the role each person derives — because every later phase authorises against it.

**Phase 1 — Devices and location (weeks 4–8)**
Device registry and assignment. Flutter shell with the foreground location service. Fix ingestion, PostGIS
zones, the live map and the handset list. Control-room console skeleton.

**Phase 2 — Enforcement (weeks 9–12)**
The check-in gate end to end: server decision, refusal with distance, override with attribution, offline
provisional shifts, re-confirmation interval. Org-wide zone enrolment for office, depot and vehicle devices.

**Phase 3 — Collection and evidence (weeks 13–18)**
Assignments, offline form runtime, sync queue, stamped photograph capture and verification, quality checks,
the photo-proof review queue.

**Phase 4 — Voice (weeks 19–22)**
PBX, extension provisioning from HRIS, on-net calling, trunk breakout, presence, push-to-talk fallback, CDRs
in the person profile.

**Phase 5 — Reporting and handover (weeks 23–26)**
Aggregates, scheduled exports, the accounting and procurement feeds, the executive view, administrator
training, runbooks, and a documented decommissioning of the airtime bundles.

**Pilot before scale.** Run Phase 2 with one team (Manzini North, 4 handsets) for two full weeks before
enrolling the rest. Zone boundaries drawn on a map and zone boundaries walked in a ward are different things,
and only the pilot will tell you where the tolerance radius needs to be.

---

## 12. Acceptance criteria

The build is done when all of the following are demonstrably true:

1. A new starter created in HRIS appears in the console the following morning, with their photograph, and can
   be issued a handset without anyone typing their name.
2. An employee terminated in HRIS loses the device session, the extension and the zone assignment within
   minutes, without IT intervention.
3. A collector standing 2 km outside their zone cannot open a form, sees the distance, and can only proceed
   through an override that carries a supervisor's name.
4. A submission without a stamped photograph is rejected by the server.
5. A photograph whose stamp disagrees with the recorded track raises a quality flag automatically.
6. An office handset shows zone state but produces no continuous track.
7. Two handsets hold a five-minute call with no airtime consumed, and the CDR appears in both profiles.
8. A department manager cannot retrieve any individual's live position through the API, with or without the UI,
   and an out-of-scope record id returns 404 rather than 403.
9. A person promoted to line manager in HRIS holds the department-manager role, scoped to their unit, at the
   next reconciliation — with no ticket raised to IT.
10. A temporary elevation expires on its own and cannot be renewed silently.
11. A collector works a full shift with no network and loses nothing on reconnection.
12. The audit trail can answer, for any day: who was where, who approved what, and who exported which report.

---

## 13. Reference prototype

`NRU Tracker.html` is the interaction and visual reference for this document. It demonstrates the live map,
handset fleet, geofences and alerts, location history playback, shift check-in enforcement, all-employee
device coverage, assignments, offline sync queue, data quality, photo proof, reports, permissions, the role
switcher, and the collector app including the enforced login gate and on-net calling.

Treat it as the specification of *behaviour and layout*, not of data: every person in it stands in for a
record that will arrive from HRIS.
