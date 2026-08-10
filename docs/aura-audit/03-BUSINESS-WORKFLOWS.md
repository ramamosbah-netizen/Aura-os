# 03 — End-to-End Business Workflows

Workflows were traced through **event subscriptions** in `apps/api/src/events/cross-module-subscriber.ts` (line numbers cited) plus service-level state transitions. Status: the cross-module spine is **`VERIFIED_IMPLEMENTED`** as an event-reactor mesh, in-process, durable via the outbox.

## Verified cross-module reactors (event → effect)

| # | Event (subscribed) | Line | Downstream effect |
|--:|---|--:|---|
| 1 | `tendering.tender.created` | 150 | seed commercial/opportunity linkage |
| 2/3 | `projects.project.completed` | 175/194 | contract completion + closeout loop |
| 4 | `contracts.contract.completed` | 218 | propagate completion |
| 5/6 | `tendering.tender.awarded` | 239/289 | create/link contract from award |
| 7 | `tendering.tender.lost` | 298 | close opportunity as lost |
| 8 | `contracts.contract.signed` | 307 | downstream project/finance setup |
| 9 | `engineering.document.submitted` | 411 | doc-control / transmittal linkage |
| 10 | `contracts.ipc.certified` | 444/945 | finance recognition + progress |
| 11 | `subcontracts.backcharge.recovered` | 489 | finance recovery |
| 12/13 | `procurement.po.created` | 523/570 | commitment ledger + budget |
| 14/15 | `procurement.po.updated` | 546/592 | commitment reversal/adjust |
| 16/17 | `inventory.grn.created` | 618/714 | 3-way match + actual cost |
| 18 | `projects.variation.approved` | 693 | budget/commitment adjust |
| 19 | `site.installation.recorded` | 896 | progress / quantity ledger |
| 20 | `quality.ir.approved` | 922 | progress gating |
| 21 | `site.labour.logged` | 971 | actual cost (labour) |
| 22 | `site.plant.logged` | 995 | actual cost (plant) |
| 23 | `amc.workorder.completed` | 1052 | finance billing |
| 24 | `finance.invoice.paid` | 1083 | cash / receivable update |
| 25 | `tendering.tender.updated` | 1112 | commercial sync |
| 26 | `assets.asset.disposed` | 1169 | finance disposal |
| 27 | `procurement.rfq.awarded` | 1248 | PO / supplier linkage |

Plus dedicated subscribers: `commissioning-handover-subscriber.ts`, `handover-amc-subscriber.ts`, `notifications-subscriber.ts`, `poison-subscriber.ts` (dead-letter).

## Canonical enterprise lifecycle (traced)

```
Lead ─▶ Opportunity ─▶ Tender ─▶ BOQ/Estimate ─▶ Quotation ─▶ (approve) ─▶ Contract
                                                                    │
Award ──────────────────────────────────────────────────────────▶ Contract (signed)
   │                                                                │
   ▼                                                                ▼
Procurement (PO) ─▶ GRN/Inventory ─▶ 3-way match ─▶ Finance (actual cost)
                                                                    │
Project (created) ─▶ Site execution (labour/plant/installation) ─▶ Progress
   │                         │                                      │
   ▼                         ▼                                      ▼
Engineering/Doc-control   QA/QC (IR approved)                 Contracts (IPC certified)
   │                                                                │
   ▼                                                                ▼
Commissioning ─▶ Handover ─▶ AMC (work orders) ─▶ Finance (billing) ─▶ Invoice ─▶ Payment
```

Each labelled transition maps to at least one reactor above or a service transition. **This is a coherent, closed loop** — the acquisition→delivery→cash cycle reconnects (invoice.paid, project.completed→contract.completed→closeout).

## Transition anatomy (per ADR-0004 / outbox)

For each transition: **trigger** = domain method on a module service → **transaction** via `TX_RUNNER` (tenant-GUC-bound) → **event** appended to `aura_events` (outbox) → **relay** (`OutboxRelay`) publishes to `EventBus` → **subscriber** in the host runs the downstream effect → **notification** via `notifications-subscriber`. Idempotency is enforced by `core/src/commands/idempotency.service.ts` and per-reactor idempotency keys.

## Findings

- **`VERIFIED_IMPLEMENTED`** — the spine is genuinely event-wired end-to-end; this is the platform's strongest functional asset.
- **`PARTIALLY_IMPLEMENTED` — durability across instances.** The bus is in-process. The outbox guarantees at-least-once *within* the deployment, but multi-instance ordering/coordination is not addressed. Acceptable single-instance; a scale-out concern (`16`).
- **`PARTIALLY_IMPLEMENTED` — back-half UI.** The *events* for site/QA/commissioning fire, but the **UI to drive them** is thin (`02`), so some transitions are reachable only via API, not via a completable in-app journey. This is the key "journey integrity" gap.
- **Risk — reactor failure visibility.** Dead-letter exists (`poison-subscriber`), but there is no verified operator UI to inspect/replay dead events beyond metrics (`outbox_dead_letter`). See `13`, `19`.
