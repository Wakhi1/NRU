# Integrated Digital Systems Proposal

**Prepared for:** United Nations and Religions World Organization (NRU)
**Prepared by:** Docsecure
**Date:** 27 August 2026

*This document summarises the functionality of four systems built for NRU — HRIS, EDMS, SPTS, and FLMS (Logistics) — as a proposal overview. Screenshots are to be inserted manually at the marked placeholders.*

---

## Executive Summary

NRU's operations span people management, records and document control, field-staff supervision, and vehicle fleet operations — historically four separate concerns, each prone to duplicated records, stale access lists, and paperwork that has to be re-typed from one department into another. This proposal covers four systems built to close that gap:

- **HRIS** — Human Resource Information System — the organisation's single source of truth for people, structure, and employment.
- **EDMS** — Electronic Document Management System — centralised, secure document capture, workflow, and records retention.
- **SPTS** — Smart Phone Tracking & Data Collection Monitoring — location-assured field operations and device management.
- **FLMS** — Fleet & Logistics Management System — vehicle, driver, fuel, and maintenance control.

The defining design decision across all four is that **HRIS is the only place a person's identity, role, and organisational unit are ever entered.** EDMS, SPTS, and FLMS each synchronise from HRIS rather than keeping their own user tables — so a new hire, a transfer, or a termination in HRIS propagates automatically everywhere, with no separate deprovisioning step to forget. This is what turns four applications into one coherent suite instead of four silos.

---

## 1. The Suite at a Glance

| System | Full Name | Core Purpose | Status |
|---|---|---|---|
| **HRIS** | Human Resource Information System | People, org structure, payroll, leave, performance, recruitment | Production — in active use, verified end-to-end |
| **EDMS** | Electronic Document Management System | Document capture, versioning, workflow, retention, records compliance | Built — core modules functional |
| **SPTS** | Smart Phone Tracking & Data Collection Monitoring | Field-staff location assurance, geofenced check-in, device fleet, internal calling | Built — core modules functional |
| **FLMS** | Fleet & Logistics Management System | Vehicle registry, driver management, fuel control, maintenance, dispatch | Built — core modules functional |

*[📷 Placeholder — suite overview / login screens montage]*

---

## 2. Why One Suite, Not Four Applications

- **Single identity backbone.** EDMS, SPTS, and FLMS all authenticate against HRIS-sourced identity — roles, job titles, and organisational units are pulled in (nightly and on demand), never re-entered. A person who leaves the organisation in HRIS loses access to every other system automatically.
- **Consistent access model.** All four use role-based access control scoped to organisational unit — not a blanket admin/everyone-else split — so a department head only ever sees their own department's people, documents, patrols, or vehicles.
- **Shared audit discipline.** Every privileged action across the suite — a permission change, an approval, a fuel transaction, a document access — is logged with a full before/after trail, not just a "something happened" line.
- **Shared internal calling.** SPTS and FLMS both ship the same peer-to-peer voice-calling module, so field and fleet staff can reach each other directly from the app with no telephony contract or per-minute cost.
- **Financial continuity.** FLMS fuel transactions are built to flow directly into the organisation's accounting ledger once verified by a fleet officer, rather than being re-keyed from paper fuel logs.

---

## 3. HRIS — Human Resource Information System

HRIS is the organisation's system of record for its people: every employee's profile, employment history, reporting line, and access rights live here, and every other system in the suite treats it as authoritative.

*[📷 Placeholder — HRIS dashboard]*

**People & Organisation**
- Full employee profiles with photo, contact, and next-of-kin details
- Versioned employment history (position, grade, department changes tracked over time, not overwritten)
- Teams-style interactive org chart with manager/peer/direct-report views, independently audited manager-reassignment trail
- Self-service profile editing with field-level restrictions (employees edit their own contact details; HR/managers retain full access)

**Time, Leave & Benefits**
- Self-service clock-in/out and worktime tracking
- Leave request, approval, and balance tracking
- Benefits administration

**Payroll**
- Full pay-run lifecycle (draft → processed → closed), bulk payline generation
- Self-service payslip access, scoped so employees only ever see their own pay

**Talent**
- Recruitment pipeline, performance reviews (self-rating and manager-rating on the same record, each editable only by the correct party), succession planning, training records

**Partner & Programme Management**
- Partner organisation and programme intake, lightweight CRM for external relationships

**Security & Access**
- Role × module permission matrix with per-field data scope (self / team / department / organisation / programme)
- Multi-factor authentication — authenticator app (TOTP), email one-time codes, single-use backup codes, account lockout after repeated failures
- Field-level encryption at rest for sensitive data (national ID, next-of-kin phone, bank account, tax number)
- HTTPS-ready with security headers on by default

**Internal Calling (VoIP)**
- Extension provisioning, department routing, hunt groups, call-handling preferences, directory-integrated dialling

**Reporting & Audit**
- 14 report types (workforce, attendance, leave, payroll, recruitment, training, performance, benefits, succession, certifications, partners, programme indicators, calling activity, declarations)
- Combined multi-report exports (PDF, Excel, CSV) with a formal letterhead layout, plus saved/reusable report configurations
- Full audit trail with readable before → after change comparisons, exportable

**Configuration**
- Company-configurable identity (organisation name, logo, employee numbering scheme) — not hardcoded to any one deployment
- Admin-manageable roles and dashboards with 9–10 live interactive charts (headcount, hiring trend, leave, attendance, payroll, recruitment funnel, training completion)

*[📷 Placeholder — org chart / payroll / reports screens]*

**Status:** Production-ready. Verified end-to-end against a running instance — login, every module, payroll state machine, permission matrix, mobile responsiveness, and scope-correctness (a department-scoped user was confirmed to see only their own department's data across reports and dashboards).

---

## 4. EDMS — Electronic Document Management System

EDMS is a centralised, secure home for the organisation's documents and records — replacing scattered shared drives and email attachments with a single governed repository that captures, versions, routes, and eventually retires every document under a consistent policy.

*[📷 Placeholder — EDMS repository / document viewer]*

**Document Management**
- Folder hierarchy with document registration, upload, and metadata
- Full version history with restore to any prior version
- "Declare final" record-locking to freeze a document once it's official
- Duplicate detection via content hashing
- In-app document viewer

**Automated Capture**
- Manual upload, watched-folder intake, email intake, and FTP intake — documents can flow in automatically from scanners, shared inboxes, or file drops, not just manual upload
- Batch capture with live connector-status monitoring and exportable capture summaries

**Intelligent Processing**
- Automatic OCR text extraction on every upload, feeding full-text search across the repository
- Smart Upload: rules-based classification suggests a document type from its OCR text for a human to confirm before filing

**Workflow & Approvals**
- Visual workflow designer for building approval routes
- Workflow instances started directly against a document
- Approvals inbox (approve/reject) and an access-request flow for permission grants

**Security & Access**
- Role-based access control combined with per-folder and per-document permissions (view / comment / edit / approve / full control)
- Document classification levels — public, internal, restricted, confidential
- Multi-factor authentication (authenticator app, SMS, email, backup codes)
- Google and Microsoft single sign-on for provisioned accounts
- Envelope encryption at rest (AES-256-GCM) with a rotatable master key — documents are never written to storage unencrypted

**Records & Compliance**
- Configurable retention classes and a disposal queue for end-of-life records
- Hash-chained, tamper-evident audit log with a built-in chain-verification check — not just a log table, but one that can prove it hasn't been altered

**Sharing**
- Internal sharing plus public share links that are time-bound and permission-scoped

**Administration & Operations**
- Multi-tenant-ready architecture, department/user/group management, branding customisation
- Licensing module (trial / standard / enterprise tiers, activation and validation)
- Scheduled jobs for backup, workflow processing, and capture batches; built-in backup and restore
- Integrations hub with status dashboard for Active Directory, HRIS, email, SMS, and cloud storage
- Storage is provider-agnostic — AWS S3, Azure Blob, Google Cloud Storage, or local disk, switchable without code changes

**Cross-Platform Access**
- One Flutter codebase delivers the same application as a web app, a Windows desktop app, and a mobile app
- A companion developer documentation and live API sandbox site is available for technical integration partners

*[📷 Placeholder — workflow designer / mobile & desktop client]*

**Status:** Core modules (capture, versioning, workflow, security, retention, audit) are built and functional. A small number of advanced items are earmarked for the next phase rather than complete today: WebAuthn/security-key sign-in, Microsoft SSO token verification, on-premise Active Directory bind, and a dedicated redaction/watermarking interface.

---

## 5. SPTS — Smart Phone Tracking & Data Collection Monitoring

SPTS gives NRU provable assurance over its field operations: it confirms exactly where an organisation-issued handset and the staff member carrying it are, before that person can begin recording field data, and keeps a defensible record of every check-in, zone, and device.

*[📷 Placeholder — SPTS live map]*

**Enforced Presence & Check-In**
- Server-side geofence gate — a field worker cannot access the app's work screens until their GPS position is confirmed inside their assigned zone; a failed check shows exactly how far outside the zone they are
- Photo/selfie proof required at check-in
- Periodic re-confirmation of location (configurable interval), always re-checked on a fresh login
- Supervisor override for exceptional out-of-zone check-ins, fully attributed and audited
- Shift-hour gating — check-ins are blocked outside configured working hours

**Live Map & History**
- Real-time map of on-shift staff and devices with geofence boundaries overlaid
- Historical shift playback — the full GPS track of any past shift, rendered on a map
- Zone entry, exit, and dwell events logged and searchable

**Zones, Devices & Staff**
- Zone management — create, assign, and manage geofenced areas with configurable rules (check-in required, exit alert, dwell alert, entry log)
- Handset registry — asset tag, IMEI, model, live status, battery and signal level, assignment to employees
- Organisation-wide staff directory synchronised from HRIS

**Alerts & Reporting**
- Severity-tiered alerts tied to staff, devices, or zones, with a resolution workflow
- CSV export of check-ins and alerts, automatically scoped to the viewer's department

**Executive Oversight**
- An executive dashboard showing aggregate KPIs only (headcount on shift, active zones, open alerts, device status) — individual staff locations are deliberately never exposed at this level, a privacy safeguard built into the system rather than a policy relying on user discretion

**Internal Calling (VoIP)**
- Genuine peer-to-peer voice calling between staff over the data connection, with no telephony contract
- Automatic online/idle/offline presence, full call history per person

**Status:** Core system — enforced check-in, geofencing, live map, device/staff/zone management, alerts, reporting, and internal calling — is built and functional today as a browser-based application. A native offline-first mobile app (with anti-tampering and cryptographically verified location photos) is the defined next phase for areas with unreliable connectivity.

---

## 6. FLMS — Fleet & Logistics Management System

FLMS brings the same discipline to NRU's vehicle fleet that HRIS brings to its people — one register for every vehicle and driver, controlled fuel issuance, tracked maintenance, and trip authorisation that leaves a paper trail.

*[📷 Placeholder — FLMS fleet register / tracking map]*

**Fleet & Drivers**
- Full vehicle registry — registration, model, category (work or executive), assigned driver, department, odometer, fuel level, efficiency against target, next service due, and live status (available / on trip / in workshop / grounded)
- Driver profiles layered on HRIS identity, with licence tracking and an internal safety score

**Trip Authorisation**
- Self-service trip requests from any employee, routed through approval to completion, with distance, purpose, and cost captured throughout

**Fuel Control**
- Fuel transaction capture (station, litres, rate, odometer) with automatic exception flagging — overfills against tank capacity and implausible refill intervals are caught before they're approved
- Fleet-officer verification step before a transaction is treated as final

**Maintenance**
- Workshop work orders with priority levels and a scheduled → in-workshop → completed lifecycle
- A vehicle with an open high-priority work order is automatically blocked from being dispatched

**Live Tracking**
- Real-time map of the operational (work-category) fleet
- Executive vehicles are deliberately excluded from live tracking as a governance safeguard

**Policy & Administration**
- Configurable dispatch and fuel policy — off-hours fuel blocking, mandatory odometer photo, station geofencing, automatic overfill flagging, variance thresholds, and a fuel price ceiling
- Admin-editable role permission matrix and on-demand HRIS reconciliation

**Financial Integration**
- Fuel transactions are designed to post directly into the organisation's accounting ledger once verified, with a held "exceptions" queue for anything flagged, so nothing questionable reaches the books unreviewed

**Internal Calling (VoIP)**
- The same internal calling module used in SPTS, for dispatchers and drivers to reach each other directly

**Status:** Built to the same standard as HRIS and SPTS — every module has working CRUD, permission gates, and a complete data model. As the newest of the four systems, it has not yet been load-tested under live operational traffic, and the fuel-to-ledger posting integration is wired for but should be confirmed end-to-end before go-live.

---

## 7. Common Security & Governance Model

The same principles run through all four systems, by design rather than by coincidence:

- **One identity source.** HRIS provisions and revokes access everywhere else — one join or leave event, not four.
- **Scoped access control.** Every role is bounded to an organisational unit; nobody sees more than their role and department justify.
- **Full audit trails.** Every privileged action is logged with before/after detail across all four systems; EDMS additionally makes its log tamper-evident via hash-chaining.
- **Multi-factor authentication** available across the suite.
- **Encryption at rest** for the most sensitive data — national IDs and bank details in HRIS, entire documents in EDMS.
- **Privacy-by-design carve-outs** — SPTS executives see aggregate numbers only, never an individual's location; FLMS excludes executive vehicles from live tracking.

---

## 8. Technology Summary

| System | Backend | Database | Frontend | Notable Technology |
|---|---|---|---|---|
| HRIS | Node.js / Express | MySQL | Web (HTML/JS) | Field-level AES-256-GCM encryption, PDFKit/ExcelJS reporting |
| EDMS | Node.js / Express | MySQL | Flutter — Web, Windows desktop, Mobile | Multi-cloud storage (AWS/Azure/GCP/local), envelope encryption |
| SPTS | Node.js / Express | MySQL | Web (HTML/JS) | WebRTC peer-to-peer calling, geofencing |
| FLMS | Node.js / Express | MySQL | Web (HTML/JS) | WebRTC calling, live map tracking (Leaflet) |

All four share the same architectural philosophy: no ORM, direct SQL for transparency and performance, and a consistent role/scope permission model implemented the same way in every codebase — which keeps the systems maintainable as one family rather than four unrelated products.

---

## 9. Roadmap — Next Phase

| System | Planned next |
|---|---|
| EDMS | WebAuthn/security-key sign-in, verified Microsoft SSO, on-premise Active Directory integration, dedicated redaction & watermarking interface |
| SPTS | Native offline-first mobile app, anti-tampering and mock-location detection, cryptographically verified location photos, polygon (not just circular) geofences |
| FLMS | Load testing under live operational traffic, end-to-end confirmation of the fuel-to-ledger posting integration |
| HRIS | Optional blank-install mode for future deployments beyond NRU |

---

## 10. Closing

Together, HRIS, EDMS, SPTS, and FLMS give NRU a single coherent operating layer: one place people are managed, one place documents are governed, one place field presence is verified, and one place the vehicle fleet is controlled — all drawing from the same identity source and held to the same security and audit standard. Each system stands on its own today; together, they remove the re-keying, stale-access, and paper-trail gaps that come from running separate, disconnected tools.
