# Volume 3A — Screen Walkthroughs

[← Volume 3](vol-03-module-catalog.md) · [← Master index](README.md)

Every page in the product (93 routes, verified 2026-07-03), grouped by area. For each screen:
what it shows, what the user can do, and where the data flows. **Drawer** = metadata form
engine slide-over (create/edit); **RP** = record page with tabs + audit; **Print** =
print-formatted document view.

---

## Shell & workspace (10)

| Route | Walkthrough |
|---|---|
| `/` | **My Work** — the landing workspace: assigned/pending items, recent activity, jump-offs. First screen of every session. |
| `/login` | JWT session start; dev mode accepts `u-admin` (Vol 7 §1). |
| `/inbox` | **Universal inbox** — 12 pending kinds (PO approvals, GRN inspections, leave, IRs, PTWs…) aggregated with deep links; the "what needs me" queue. |
| `/search` | Global search across 12 record types; same index feeds ⌘K. |
| `/notifications` | In-app notification feed with read state. |
| `/views` | Saved views manager — persisted filter/column sets per user. |
| `/events` | Event-stream inspector — the outbox made visible; per-event payloads; ops/debug surface. |
| `/documents` | Kernel DMS browser — uploaded documents with metadata. |
| `/intelligence` | AI insights/briefings feed; pipeline commentary; proposal review. |
| `/admin/audit` · `/admin/intelligence` · `/admin/templates` | Admin: immutable audit trail viewer · calibrations/autonomy proposals (execute/reject) · document template management. |

## CRM (5)

| Route | Walkthrough |
|---|---|
| `/crm/accounts` | Account register: status/industry badges, create + edit **drawers**, CSV export. |
| `/crm/accounts/[id]` | **RP:** profile, linked opportunities, activity log, audit entries. |
| `/crm/leads` | Pipeline client: leads + opportunities side by side; stage moves; won ⇒ ⚡tender. Lead/opportunity **drawers** with account `fills`. |
| `/crm/quotations` | Quote register with open/won totals; **metadata-schema drawer** (`crm.quotation`) with live Subtotal/VAT/Grand-total; send/accept/reject row actions. |
| `/crm/quotations/[id]/print` | **Print:** customer-facing quotation with VAT lines. |

## Tendering (2)

| Route | Walkthrough |
|---|---|
| `/tendering/tenders` | Tender register (status lifecycle badges); create/edit **drawers** with account inheritance. |
| `/tendering/tenders/[id]` | **RP:** BOQ lines + rate build-ups, estimates, bid/no-bid scoring, win/loss capture, document uploads, status transitions. |

## Contracts (5)

| Route | Walkthrough |
|---|---|
| `/contracts/contracts` | Contract register; create **drawer** with won-tender inheritance (`fills`/`extra`). |
| `/contracts/contracts/[id]` | **RP:** terms, clauses (from library), obligations register, certificates tab; sign action ⇒ ⚡project. |
| `/contracts/contracts/[id]/print` | **Print:** contract summary document. |
| `/contracts/certificates` | IPC register across contracts; certify action ⇒ ⚡AR invoice. |
| `/contracts/certificates/[id]/print` | **Print:** payment certificate with retention math. |

## Projects (5)

| Route | Walkthrough |
|---|---|
| `/projects/dashboard` | Portfolio aggregates: status counts, values, EVM posture. |
| `/projects/projects` | Project register; create **drawer** with active-contract inheritance. |
| `/projects/projects/[id]` | **RP:** WBS/CBS trees, budget lines, variations, EVM (CPI/SPI), delay/EOT, cash-flow forecast, closeout (handover + DLP). |
| `/projects/schedule` | Gantt client: task bars, planned windows, % complete. |
| `/projects/variations` | Variation register with approval flow. |

## Procurement (7)

| Route | Walkthrough |
|---|---|
| `/procurement/dashboard` | Spend/PO-state aggregates. |
| `/procurement/suppliers` | Supplier master (code, category, licence, TRN, contacts); approval status; **drawer**. |
| `/procurement/purchase-requests` | PR register (manual + ⚡auto from low stock); convert onward. |
| `/procurement/rfqs` | RFQ issue/compare client. |
| `/procurement/purchase-orders` | PO register; create/edit **drawers**; approval (matrix tier), issue, close actions. |
| `/procurement/purchase-orders/[id]` | **RP:** lines, GRN links, 3-way-match state, audit. |
| `/procurement/purchase-orders/[id]/print` | **Print:** PO document. |

## Inventory (6)

| Route | Walkthrough |
|---|---|
| `/inventory/dashboard` | Stock posture: values, low-stock, movement. |
| `/inventory/stock` | Item registry (UoM/barcode fields), reorder levels, on-hand + WAC. |
| `/inventory/grns` | GRN register; created→inspected→accepted actions (accept ⇒ ⚡stock/WAC/GL); **drawer** with issued-PO inheritance. |
| `/inventory/grns/[id]/print` | **Print:** GRN document. |
| `/inventory/transfers` | Location-to-location transfer requests + completion. |
| `/inventory/valuation` | WAC valuation by item — the physical↔financial reconciliation view. |

## Subcontracts (4)

| Route | Walkthrough |
|---|---|
| `/subcontracts/subcontracts` | Agreement register; **metadata-schema drawer** (`subcontracts.subcontract`) with plugin `percent` retention field + ≥1M/<5% warning rule. |
| `/subcontracts/subcontracts/[id]/print` | **Print:** subcontract agreement. |
| `/subcontracts/variations` | Subcontract variation register. |
| `/subcontracts/back-charges` | Back-charge register; raise ⇒ ⚡AP deduction. |

## Site / Engineering / Doc Control (5)

| Route | Walkthrough |
|---|---|
| `/site/control` | **5-tab client:** daily reports (draft→submit), delay logs (log→resolve, impact hours), material consumption, labour allocations (man-hours computed), progress-vs-baseline mapping with slippage tags. All creates are **drawers**. |
| `/site/instructions` | Site instruction register. |
| `/engineering` | Multi-tab: drawing register (revisions), RFIs (raise→answer), submittals, technical queries; BIM/IFC viewer entry. |
| `/documents/control` | Doc-control client: transmittals (+item registers, send), correspondence in/out log. |
| `/doccontrol/submittals` | Submittal register (doc-control side). |

## Quality / HSE (5)

| Route | Walkthrough |
|---|---|
| `/quality/control` | **4-tab client:** NCRs (raise→correct→close), IRs (approve/reject + comments), snags (open→resolved→closed), **ISO audits** — schedule ⇒ clause checklist (compliant/non-compliant/N-A + findings, saved on blur) ⇒ auto-NCR from non-compliances ⇒ complete. All **drawers**. |
| `/quality/itps` | Inspection & Test Plan register. |
| `/quality/material-approvals` | MAR register. |
| `/hse/control` | **4-tab client:** incidents (severity, close w/ investigation), PTWs (5 types, validity windows, approve), CAPAs (source-typed, complete), training matrix (CSV certifications, valid/expired counters). All **drawers**. |
| `/hse/toolbox-talks` | Toolbox talk log. |

## Finance (19)

| Route | Walkthrough |
|---|---|
| `/finance/dashboard` | Cash/AR/AP/GL posture tiles. |
| `/finance/ledger` | GL journal browser; post action (trigger-checked). |
| `/finance/invoices` (+`[id]`) | AP register; **drawer** with received-PO inheritance; approve (3-way gate) → pay. RP shows match state. |
| `/finance/customer-invoices` (+`[id]/print`) | AR register (manual + ⚡from IPC/AMC); VAT-line **drawer**; **print**. |
| `/finance/ap-aging` · `/finance/ar-aging` | Aging buckets, drill to documents. |
| `/finance/budgets` | Budget vs actual (GL fold) per cost object. |
| `/finance/statements` (+`/print`) | P&L, balance sheet, cash flow, trial balance — GL-derived; **print**. |
| `/finance/period-close` | Period lifecycle; close blocks posting. |
| `/finance/revenue-recognition` | IFRS-15 cost-to-cost schedule per project. |
| `/finance/tax` · `/finance/vat-returns` | Tax config · UAE VAT return periods (output−input). |
| `/finance/fx` | FX rate registry (multi-currency base conversion). |
| `/finance/petty-cash` | Petty-cash floats + entries. |
| `/finance/post-dated-cheques` | PDC lifecycle (received→deposited→cleared/bounced). |
| `/finance/bank-guarantees` | BG register with expiry tracking. |
| `/finance/bank-reconciliation` | Statement-line ↔ ledger matching client. |
| `/finance/consolidation` | Multi-company consolidation view (intercompany elimination [Gap]). |

## HR (11)

| Route | Walkthrough |
|---|---|
| `/hr/dashboard` | Headcount/expiry/cost posture. |
| `/hr/control` | **3-tab client:** employees (**metadata-schema drawer** `hr.employee` — Profile/Compliance/Contact tabs, live rules, email/phone validators; visa/permit expiry badges), leave (request **drawer**, approve/reject), payroll (run **drawer**, net computed by API, disburse ⇒ payslip). |
| `/hr/attendance` | Attendance capture; worked-hours fold. |
| `/hr/timesheets` | Timesheet entry + approval. |
| `/hr/eosb` | Gratuity calculator/register (UAE bands). |
| `/hr/expense-claims` | Claim register + approval. |
| `/hr/staff-advances` | Advance issue/recovery. |
| `/hr/document-expiry` | Expiry surveillance across employee documents. |
| `/hr/payroll/[id]/print` | **Print:** payslip. |

## Assets / Fleet / AMC (7)

| Route | Walkthrough |
|---|---|
| `/assets/control` | **3-tab client:** register (6 categories, warranty badges), maintenance (schedule **drawer** → complete w/ actual cost), inspections (pass/fail **drawer**). |
| `/assets/depreciation` | Depreciation schedules. |
| `/fleet/control` | **4-tab client:** vehicles (**drawer**, driver link from HR, Mulkiya badges), fuel logs (**drawer**), maintenance (**drawer** → complete), telematics (GPS webhook simulator + expiry scanner + live positions table). |
| `/fleet/fines` | Traffic fine register per vehicle/driver. |
| `/fleet/salik` | Salik toll cost tracking. |
| `/amc` | AMC contracts + tickets (SLA states) + work orders (complete ⇒ ⚡AR). |
| `/amc/ppm` | PPM schedules with next-due advancing. |

---

## Coverage note

93/93 routes documented. Depth varies with module maturity (Vol 3 health scores); the six
multi-tab control clients (site/quality/HSE/HR/assets/fleet) were rebuilt on the form engine
2026-07-03 and verified in `docs/reports/2026-07-03-edit-forms-and-vertical-drawers.md`.
