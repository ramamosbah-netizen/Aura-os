# Volume 12 — Business Rules Library

[← Master index](README.md)

All business rules enforced by the platform, in three tiers: **metadata rules** (form-engine
JSON, live in the UI), **service rules** (domain code, enforced on the API), and **database
rules** (constraints/triggers — cannot be bypassed). This volume is the living registry; new
rules are added here with their tier and location.

---

## 1. Metadata rules (form-engine `rules[]` — Volume 5 §5)

Shipped in registered schemas:

| ID | Schema | Rule |
|---|---|---|
| `camp-needs-visa-tracking` | `hr.employee` | labor camp filled **AND** visa expiry empty ⇒ **require** visaExpiry |
| `permit-follows-visa` | `hr.employee` | visa expiry filled AND permit expiry empty ⇒ **warn** (data-entry gap) |
| `high-value-retention-floor` | `subcontracts.subcontract` | value ≥ 1,000,000 AND retention < 5% ⇒ **warn** (standard terms) |
| retention ceiling | `subcontracts.subcontract` | validation: retention ≤ 20% ⇒ error message (UAE standard terms) |
| email/phone format | `hr.employee` | plugin validators `email`, `phone` |
| computed-totals read-only | `crm.quotation` | formula fields render read-only, excluded from payload (`transient`) |

Vocabulary available to every future rule: conditions `all/any/not` over 11 operators;
actions `show hide enable disable require unrequire clear set warn error`.

## 2. Service-tier rules (domain code — cannot be skipped by UI)

| Rule | Module | Location/mechanism |
|---|---|---|
| Approved-vendor gate | Procurement | PO creation rejects non-approved suppliers |
| Approval matrix threshold | Procurement | value band → required approver tier |
| 3-way match | Finance/Procurement | invoice approve verifies PO ↔ GRN ↔ invoice server-side |
| Period-close posting lock | Finance | journals rejected into closed periods |
| Budget-vs-actual overrun | Projects | cost fold emits `projects.budget.overrun` |
| WAC re-averaging | Inventory | receipt recomputes moving weighted average |
| COGS at WAC on issue | Inventory | issue values at current WAC |
| Low-stock single-PR | Inventory | threshold crossing raises exactly one PR (idempotent) |
| IPC ⇒ AR / Sub-IPC ⇒ AP / Back-charge ⇒ AP | Contracts/Subcontracts | certified events post financial documents |
| EOSB bands | HR | UAE gratuity calculation per service years |
| WPS SIF structure | HR | SCR/EDR record validation |
| IFRS-15 cost-to-cost | Finance | rev-rec percentage from cost progress |
| PTW validity window | HSE | approval before validity; expiry closes permit |
| NCR-from-audit idempotency | Quality | one NCR per non-compliant checklist item |
| Registration-expiry scan | Fleet | 30-day window ⇒ notifications + tasks |
| Status transition guards | all modules | domain functions validate lifecycle moves |
| Idempotent creates | spine | Idempotency-Key store rejects replays |

## 3. Database-tier rules (constraints — final line)

| Rule | Mechanism |
|---|---|
| Double-entry balance | **trigger** on journal post (debits = credits) — verified by live-pg test |
| Status enums | CHECK constraints |
| Non-negative amounts | CHECK constraints |
| Tenant presence | NOT NULL `tenant_id` |
| Migration monotonicity | duplicate-number fail-fast in runner |
| Row-level tenancy | RLS policies authored (enforcement pending — Vol 7) |

## 4. Rule placement doctrine

1. **UX guidance** (warnings, dynamic visibility, convenience defaults) → metadata rules.
2. **Business invariants** (money, approvals, lifecycle legality) → service tier, evented.
3. **Existential invariants** (balance, tenancy, enum domains) → database tier.
A rule may appear at two tiers (metadata for UX + service for enforcement); it must never
exist *only* in metadata if money or compliance depends on it.

## 5. Roadmap

- Server-side execution of metadata rules on submit (same `evaluateForm` — designed, Volume 5).
- Rule builder UI in the Administration Center (condition-tree editor) [Planned].
- Per-tenant rule overrides stored via the kernel builder [Planned].

---

*Next: [Volume 13 — Formula Library](vol-13-formula-library.md)*
