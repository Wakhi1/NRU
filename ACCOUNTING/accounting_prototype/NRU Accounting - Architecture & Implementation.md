# NRU Accounting Management System
## System architecture and implementation guide

Version 1.0 · Accounts Department with Information Technology · United Nations and Religions World Organization

This document describes the architecture behind the prototype in `NRU Accounting.html` and how it should be
built for production. It is the companion to *NRU Tracking — Architecture & Implementation*; the two systems
share an identity layer, an HRIS source and the same access-control model.

---

## 1. What the system does

The Accounts department runs a customised accounting system that **links to the other departments rather than
waiting for their paperwork** — procurement and fleet management above all. Four claims must hold:

1. **One ledger.** Every financial event in the organisation lands in the same general ledger, whoever raised it.
2. **Source documents flow in automatically.** A purchase order raised in procurement and a fuel issue recorded
   in fleet become journal entries without re-keying.
3. **Nothing is approved by the person who raised it**, and every approval carries an HRIS-derived limit.
4. **The period closes on evidence**, not on assertion — unmatched bank lines and unapproved claims block the lock.

---

## 2. People and access come from HRIS

Identical in principle to the tracking system, and served by the **same identity service** — one HRIS
integration for the organisation, not two.

### 2.1 Ownership boundary

| Attribute | System of record |
| --- | --- |
| Employee number, full name, job title | **HRIS** |
| Unit / department, cost-centre ownership | **HRIS** |
| **Grade or band** — which determines the approval limit | **HRIS** |
| Line manager, employment status | **HRIS** |
| Bank details for salary and claims reimbursement | **HRIS / Payroll** |
| Role-to-permission mapping | Accounting system |
| Approval-limit schedule per grade | Accounting system (agreed with Finance) |
| Delegations and their expiry | Accounting system |
| Ledger, documents, postings, audit trail | Accounting system |

The pattern to keep hold of: **HRIS says what grade a person holds; Finance policy says what a grade may
approve; the system multiplies the two.** Nobody types an approval limit against a name.

### 2.2 RBAC — roles derived, not granted

```
HRIS: title + unit + grade + status
        │
        ▼
  mapping rules (versioned, first match wins)
        │
        ▼
  role  ──▶  permission set  ──▶  scope (cost centre / unit)  ──▶  approval limit (from grade)
```

| # | HRIS condition | Role | Limit |
| --- | --- | --- | --- |
| 1 | Unit = Accounts, title contains "Head of Finance" | `head_of_finance` | E 2 000 000 |
| 2 | Unit = Accounts, job family = accounting | `accountant` | E 250 000 |
| 3 | Unit = Accounts, title contains "clerk" | `ap_clerk` | E 50 000 |
| 4 | Named in HRIS as cost-centre owner for a department | `budget_holder` | E 100 000 |
| 5 | Unit = Governance, title contains "auditor" | `internal_auditor` | None — read only |
| 6 | Grade ≥ senior management | `executive` | None — summary only |
| — | Employment status ≠ active | **no role — access revoked** | — |

Permissions are namespaced capabilities (`journal.post`, `ap.payment.release`, `coa.amend`, `period.close`,
`audit.read`, `admin.roles`), fixed per role and enforced server-side on every endpoint. Scope narrows each
one to the holder's HRIS unit: a budget holder approves claims against **their own** cost centre only.

**Segregation of duties sits above the matrix.** No user may approve a document they raised, whatever their
role or limit. This is a hard rule in the service layer, not a configurable option — the check compares the
raising identity to the approving identity before any limit is consulted.

Delegation (a Head of Finance on mission), temporary elevation (quarter-end), and break-glass follow the same
time-bound, attributed pattern as the tracking system. Nothing renews silently; quarterly access review is a
report each cost-centre owner confirms.

---

## 3. Component architecture

### 3.1 Services

| Service | Responsibility |
| --- | --- |
| Identity & Directory | Shared with tracking: HRIS pull, roles, scope, limits, SSO |
| General Ledger | Chart of accounts, journals, double-entry posting, trial balance, period close |
| Payables | Vendor invoices, three-way match, approval routing, payment runs |
| Receivables | Donor and partner invoices, receipts, ageing |
| Banking | Statement import, reconciliation, matching rules |
| Expenses | Staff claims, receipts, approval by cost-centre owner |
| Budgeting | Budget versions, commitments, budget-versus-actual |
| Integration | Procurement, fleet, tracking and payroll adapters (outbox pattern) |
| Reporting | Management packs, statutory outputs, donor reports, exports |
| Audit | Append-only trail of every posting, approval, amendment and export |

Suggested stack: same as the tracking system — PostgreSQL, Kafka or RabbitMQ, Keycloak for SSO, a Kotlin or
Node service tier, the delivered HTML/CSS design system for the console, Flutter for the mobile claim capture.
Shared infrastructure, separate databases; the two systems talk over the bus, never through each other's tables.

### 3.2 Core data model

```
account (chart of accounts)  1 ── n  journal_line
journal_entry   1 ── n  journal_line          (sum of debits = sum of credits, enforced in the DB)
purchase_order  1 ── n  goods_receipt  1 ── n  vendor_invoice   (three-way match)
vendor_invoice  1 ── n  payment_allocation  n ── 1  payment_run
receivable_invoice 1 ── n  receipt
bank_statement_line  1 ── 1?  reconciliation_match ──▶ journal_entry | payment | receipt
expense_claim   1 ── n  claim_line   1 ── n  receipt_image
budget (dept, period)  ── commitments (from PO) + actuals (from GL)
vehicle  1 ── n  fleet_cost_event   ──▶ journal_entry
```

Two invariants worth writing into the schema itself: **a journal entry cannot be saved unbalanced**, and
**a posted entry is never updated** — corrections are reversing entries, so the trail stays intact.

---

## 4. Departmental links — the point of the system

### 4.1 Procurement

| Event in procurement | Effect in accounting |
| --- | --- |
| Purchase order approved | Commitment raised against the department's budget; PO appears in the matching queue |
| Goods received note captured | Accrual posted; PO marked received-not-invoiced |
| Vendor invoice received | **Three-way match** — PO ↔ GRN ↔ invoice. Clean match posts automatically; a price or quantity variance beyond tolerance is held as a query |
| PO cancelled | Commitment released back to the budget |

Tolerance is configuration (default 2% or E 500, whichever is lower). The prototype's *Procurement* screen is
this queue: order, vendor, department, value, and which of the three documents have arrived.

### 4.2 Fleet management

| Event in fleet | Effect in accounting |
| --- | --- |
| Fuel issued | Expense posted to the vehicle's cost centre |
| Maintenance completed | Expense posted; against budget for the owning department |
| Odometer reading synced | Cost per kilometre recalculated |
| Vehicle assigned to a department | Cost centre for subsequent charges |

**Distance comes from the tracking system**, not from a logbook: vehicle handsets report distance run, which
becomes the denominator in cost per kilometre. This is the clearest reason the two systems belong together.

### 4.3 Tracking system

- Confirmed shifts (§5 of the tracking document) substantiate field allowances — a claim for a day with no
  confirmed check-in is flagged before it reaches an approver.
- Vehicle distance and depot dwell feed fleet costing.
- Handset assets feed the fixed-asset register and depreciation.

### 4.4 Payroll and HR

Payroll posts its monthly journal to the ledger. Staff bank details for claim reimbursement are read from
HRIS/Payroll — the accounting system stores a reference, never a second copy of an account number.

All integrations are asynchronous, with an **outbox pattern** on the sending side and idempotent consumers on
the receiving side. Every inbound document carries the source system, source id and a hash, so a replayed
message cannot double-post.

---

## 5. Control model

- **Approval routing** — a document routes to the lowest role whose limit covers its value and whose scope
  covers its cost centre. Above E 2 000 000 it goes to the Board, outside the system, and returns as a minute
  reference recorded against the document.
- **Segregation of duties** — raiser ≠ approver, always. Payment release requires a second identity from the
  Accounts unit.
- **Period close** — a checklist, not a button: bank lines matched, claims resolved, procurement accruals
  posted, fleet costs allocated, inter-departmental balances agreed. The lock is refused while any step is
  outstanding, and the refusal names the step.
- **Audit trail** — append-only, seven-year retention, capturing every posting, approval, amendment, deletion
  and export with the acting person's HRIS identity. A deletion removes a record from the working view; it
  never removes it from the trail.
- **Reversals over edits** — posted documents are corrected by reversal, so the ledger reads as a history
  rather than a current state.

---

## 6. Reporting

Management packs (budget versus actual, cash position, ageing, cost per kilometre), donor and grant reports,
and statutory outputs. All exports are PDF, CSV or XLSX; each export is logged against the requesting
department, because a donor report leaving the building is a governance event.

Reports read from a separate read-model refreshed from the ledger, so a heavy month-end pack cannot slow
posting.

---

## 7. Implementation sequence

**Phase 0 — Foundations (weeks 1–3)**
Environments, CI/CD, SSO, and the **shared** identity service with the HRIS pull, role-mapping rules and the
grade-to-limit schedule agreed with Finance. If the tracking system is being built in parallel, this phase is
done once for both.

**Phase 1 — Ledger core (weeks 4–9)**
Chart of accounts, journal entry and posting with the balance invariant, trial balance, opening balances
migrated and reconciled against the current system. Nothing integrates until the ledger is trusted.

**Phase 2 — Transactions (weeks 10–16)**
Payables with approval routing, receivables, bank import and reconciliation, expense claims with mobile
receipt capture.

**Phase 3 — Departmental links (weeks 17–22)**
Procurement three-way match, fleet cost events, tracking feeds for distance and confirmed shifts, payroll
journal. Each adapter goes live behind a reconciliation report that proves both sides agree for a full month.

**Phase 4 — Budgets, close and reporting (weeks 23–28)**
Commitments, budget versus actual, the period-close checklist, management packs, donor reports, exports.

**Phase 5 — Parallel run and handover (weeks 29–34)**
Run one full quarter in parallel with the existing process. Sign-off is the auditor's, not IT's. Then
training, runbooks and decommissioning of the spreadsheets the system replaces.

**Migrate balances, not history.** Bring in opening balances and open documents; leave closed years in the
old system, archived and readable. A migration that tries to carry ten years of transactions will fail on
data quality and take the project with it.

---

## 8. Acceptance criteria

1. An unbalanced journal entry cannot be saved, by any route including the API.
2. A posted entry cannot be edited — only reversed — and both appear in the audit trail.
3. A purchase order approved in procurement raises a commitment against the right budget within minutes.
4. An invoice matching its PO and GRN within tolerance posts without human intervention; one outside tolerance
   is held with the variance stated.
5. A person promoted in HRIS holds the correct role and approval limit at the next reconciliation, without a
   ticket to IT.
6. A user cannot approve a document they raised, in any workflow, with any limit.
7. A budget holder cannot see or approve another department's claims; an out-of-scope id returns 404.
8. Fleet cost per kilometre reconciles to distance reported by the tracking system for the same period.
9. The period cannot be locked while a bank line is unmatched, and the refusal names the outstanding step.
10. The audit trail can answer, for any document: who raised it, who approved it, under what limit, and what
    changed afterwards.

---

## 9. Reference prototype

`NRU Accounting.html` is the interaction and visual reference. It demonstrates the dashboard, chart of
accounts, journal entries, receivables, payables, bank reconciliation, expense claims, procurement matching,
fleet costs, budgets, reports, and the governance screen showing HRIS-derived roles, the permission matrix,
approval limits by grade, live delegations, the audit trail and the period-close checklist. Full create, edit
and delete is wired across every ledger collection, with validation and audit logging.

Treat it as the specification of *behaviour and layout*, not of data: the people in it stand in for records
that will arrive from HRIS, and the figures for balances that will arrive from the migration.
