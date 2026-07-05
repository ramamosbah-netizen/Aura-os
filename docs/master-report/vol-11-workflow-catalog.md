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

## 12. State diagrams (reference)

Verified against domain transition guards. `[E]` = event emitted; `⚡` = reactor consequence.

### 12.1 Opportunity → Tender → Contract → Project (the spine)

```
 OPPORTUNITY: prospect ──► qualified ──► proposal ──► won [E stage_changed]
                                   └──► lost                │
                                                            ⚡ registers
 TENDER:   registered ──► submitted ──► awarded [E awarded] ─⚡ creates─┐
              │              └────────► lost [E lost] → win/loss       │
              └ bid/no-bid score gate                                  ▼
 CONTRACT: created ──► signed [E signed] ─⚡ creates project + WBS/CBS──┐
              └────────► completed                                     ▼
 PROJECT:  created ──► started ──► completed
              (cost events fold EVM; overrun ⇒ [E budget.overrun])
```

### 12.2 Purchase Order

```
 draft ──► pending-approval (matrix tier by value) ──► approved [E] ──► issued [E]
   ▲              │ reject                                                 │
   └──────────────┘                                        GRN(s) received │
                                                        ──► closed [E]
 gates: approved-vendor check at create · 3-way match before invoice approval
```

### 12.3 GRN (Inventory)

```
 created [E] ──► inspected [E] ──► accepted [E]
                                      │
        ⚡ stock qty + WAC re-average + GL (Dr Inventory / Cr GRNI)
 issue path:  stock issue ──⚡ COGS at WAC (Dr COGS / Cr Inventory)
 low-stock:   onhand < reorder ──⚡ one idempotent PR
```

### 12.4 Supplier Invoice (AP)

```
 created [E] ──► matched (PO↔GRN↔invoice, server-side) ──► approved [E] ──► paid [E]
                       │ mismatch ⇒ blocked with reason
 period gate: posting rejected into closed periods (DB-level trigger on journals)
```

### 12.5 Journal / Period

```
 JOURNAL: draft ──► posted [E]   (trigger: Σdebit = Σcredit, period open)
 PERIOD:  open ──► closed        (blocks all posting into it)
```

### 12.6 Payment Certificate (IPC) / Subcontractor claim

```
 draft ──► certified [E ipc.certified] ──⚡ AR invoice (main contract)
 sub-IPC:  certified ──⚡ AP invoice · back-charge raised ──⚡ AP deduction
 retention: withheld per certificate ──► released [E retention.released]
```

### 12.7 Leave / Payroll (HR)

```
 LEAVE:   requested [E] ──► approved [E] | rejected
 PAYROLL: draft run ──► approved ──► paid [E payroll.run]
             └ payslips + WPS SIF (SCR/EDR) generated
```

### 12.8 NCR / IR / Snag (Quality)

```
 NCR:  raised [E] ──► corrected ──► closed     (audit checklist non-compliance ⇒ auto-raise, idempotent)
 IR:   requested ──► approved [E] | rejected   (+inspector comments)
 SNAG: open ──► resolved ──► closed [E]
 AUDIT: scheduled ──► in_progress (checklist) ──► completed | cancelled
```

### 12.9 Incident / PTW / CAPA (HSE)

```
 INCIDENT: reported [E] ──► investigating ──► closed
 PTW:      draft ──► requested ──► approved [E issued] ──► expired | closed
 CAPA:     pending [E raised] ──► in_progress ──► completed
```

### 12.10 AMC ticket / Work order

```
 TICKET: open ──► (SLA timers) ──► escalated ⚡ ──► resolved
 WO:     created ──► completed ──⚡ AR invoice
 PPM:    schedule ──⚡ next-due advance ──► visit ──► complete
```

### 12.11 Asset / Fleet maintenance

```
 scheduled [E] ──► completed [E] (actual cost captured at completion)
 vehicle registration: scan (≤30d) ──⚡ notification + renewal task
```

### 12.12 Daily report / Delay (Site)

```
 REPORT: draft ──► submitted
 DELAY:  logged (type, impact hours) ──► resolved
```

---

*Next: [Volume 12 — Business Rules Library](vol-12-business-rules-library.md)*
