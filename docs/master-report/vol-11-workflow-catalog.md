# Volume 11 — Workflow Catalog

[← Master index](README.md)

Every workflow the platform executes today, grouped per the charter. Engine mechanics are in
Volume 4 §4 (workflow service + saga orchestrator + approval matrix). Notation:
`state → state` transitions are domain-guarded; **⚡** marks automatic event-driven steps
(reactors); **👤** marks human decisions.

---

## 1. Approval workflows (cross-cutting)

| Workflow | Route | Mechanics |
|---|---|---|
| PO approval matrix | PO value → tier → approver role | `approval-matrix.service` — threshold bands; 👤 approve ⇒ `procurement.po.approved` |
| Leave approval | requested → 👤 approved/rejected | `hr.leave.*` events |
| Expense claim approval | submitted → 👤 approved → paid | HR claims |
| Invoice approval | created → 👤 approved (3-way match gate) → paid | server-side match before approve |
| IR decision | requested → 👤 approved/rejected + comments | quality |
| PTW issue | draft → requested → 👤 approved → expired/closed | HSE |
| Universal inbox | all pending 👤 decisions aggregate into one queue (12 kinds) | `apps/api/src/inbox` |

## 2. Tender workflow

```
crm.opportunity.stage_changed[won] ⚡→ tender registered
registered → 👤 bid/no-bid (bid-score) → submitted → 👤 awarded | lost
awarded ⚡→ contract created          lost → win/loss record
```
Sub-flows: BOQ build → rate build-ups → estimate; document uploads on the tender record.

## 3. Procurement workflow

```
PR (👤 or ⚡ from inventory.stock.low) → RFQ → PO draft
→ 👤 approval (matrix tier) → issued → GRN(s) received → closed
Supplier gate: PO only against approved vendors (server-enforced)
3-way match: PO ↔ GRN ↔ invoice before finance approval
Framework agreements: call-offs against blanket terms
```

## 4. Finance workflows

| Flow | States |
|---|---|
| Supplier invoice | created → matched → 👤 approved → paid (`finance.invoice.*`) |
| Customer invoice | created (👤 or ⚡ from IPC/AMC) → sent → paid |
| Journal | draft → posted (DB trigger validates balance; blocked in closed periods) |
| Period close | open → 👤 closed (posting lock) → next period |
| PDC | received → deposited → cleared/bounced |
| Bank reconciliation | statement lines ↔ ledger matching |
| Revenue recognition | IFRS-15 cost-to-cost per period |
| VAT return | period aggregation → 👤 filed |

## 5. HR workflows

Leave (requested→approved/rejected) · payroll run (draft → 👤 approved → paid ⇒ payslips +
WPS SIF) · expense claims · staff advances (issue → recover) · timesheet approval ·
document-expiry surveillance ⚡→ notifications · appraisal cycle (0120, UI pending).

## 6. Assets workflows

Register → maintenance scheduled → 👤 complete (actual cost) · inspection recorded (pass/fail)
· depreciation schedule run · status lifecycle active→maintenance→inactive→disposed.

## 7. Maintenance workflows (Fleet + AMC)

| Flow | States |
|---|---|
| Fleet maintenance | scheduled → 👤 complete (actual cost) |
| Registration expiry | ⚡ scan (30-day window) → notifications + renewal tasks |
| AMC ticket | open → SLA timers → ⚡ escalation (0118) → resolved |
| AMC work order | created → 👤 completed ⚡→ AR invoice |
| PPM | schedule → ⚡ next-due advance → visit → complete |

## 8. Inventory workflows

GRN: created → 👤 inspected → 👤 accepted ⚡→ (stock + WAC re-average + GL posting) ·
transfer: request → complete · issue ⚡→ COGS at WAC → GL ·
low-stock threshold crossing ⚡→ single idempotent PR.

## 9. Projects workflows

```
contracts.contract.signed ⚡→ project created + WBS/CBS seeded
created → started → completed
variations: raised → 👤 approved → contract value adjustment
delay/EOT: logged → 👤 assessed
closeout: handover → DLP end date computed
cost events ⚡→ EVM fold (CPI/SPI); overrun ⚡→ projects.budget.overrun
```

## 10. The end-to-end master chain (verified 2026-07-01, extended since)

```
Lead → Opportunity → Quotation
   won ⚡→ Tender → submitted → awarded ⚡→ Contract → signed ⚡→ Project(+WBS/CBS)
   Project → PR→RFQ→PO(matrix)→GRN ⚡→ Stock/WAC/COGS→GL
   Site: diaries/labour/materials/delays          Quality: IR/NCR/snags/audits
   IPC certified ⚡→ AR · Subcontractor IPC ⚡→ AP · Back-charge ⚡→ AP deduction
   AMC WO complete ⚡→ AR · Payroll ⚡→ WPS
   Closeout → DLP
Remaining manual seams: Quotation→Tender link; warranty-claim workflow [Gap]
```

## 11. Authoring [Planned]

Workflow definitions are data (kernel workflow store); the visual designer + per-tenant
overrides belong to the Administration Center (Volume 15). Saga orchestration covers
compensating multi-step chains (tested); adoption beyond the spine is roadmap.

---

*Next: [Volume 12 — Business Rules Library](vol-12-business-rules-library.md)*
