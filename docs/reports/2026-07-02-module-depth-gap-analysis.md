# AURA OS — Module Vertical-Depth Gap Analysis (2026-07-02)

Source of truth: current codebase (branch `feat/module-depth-verticals-jun30`). Verified by file
inspection + grep, not memory. 17 L2 modules · 90+ domain entities · 15 cross-module reactors · DB @ migration 0124.

Legend: ✅ present · ◐ partial · ❌ missing.

---

## 1. Per-module functional gaps (verified)

| Module | Depth | Remaining gaps to fix |
|---|:--:|---|
| CRM | ✅ high | MS-Graph **email seam** (contacts ✅, activities/tasks ✅, pagination ✅) |
| Tendering | ✅ high | Estimate engine ✅ (0121); competitor win/loss analytics ✅ (0126: outcomes + win-rate/head-to-head/loss-reason roll-up); bid-scoring ✅ |
| Contracts | ✅ high | (clause library ✅, obligations+due-soon ✅, IPC ✅) — none material |
| Projects | ✅ high | **Revenue recognition** UI polish; resource histogram viz (CPM reschedule + levelling ✅) |
| Procurement | ✅ high | Framework/blanket agreements ✅ (rate card, ceiling drawdown, call-off→PO, 0122); approval matrix ✅, 3-way ✅, MAR gate ✅ |
| Inventory | ✅ | FIFO cost layers→COGS ✅ (per-item WAC\|FIFO); barcode + multi-UOM ✅ (scan lookup, alt-unit movements, 0124) |
| Finance | ✅ high | ✅ **Intercompany eliminations** (reversing entries; group nets intra-group to zero) |
| HR | ✅ high | ✅ **Performance appraisal** + ✅ **org-chart** (attendance ✅, WPS SIF ✅, payroll ✅) |
| HSE | ◐ | **Training-matrix** ✅ + risk-assessment ✅ present; audit-trail depth ◐; pagination ✅ (incidents, PTWs) |
| Quality | ✅ high | calibration ✅ + audit schedules ✅; pagination ✅ (NCR/IR/snag/ITP/MAR); store split per-entity ✅; ITP release gate feeds Projects ✅ |
| Site | ✅ | labour-by-trade ✅ + progress% ✅; resource histograms ◐ |
| Subcontracts | ◐ | Pagination ✅ (head list); back-charges ✅, retention-release ✅ |
| Doc-Control | ✅ | Transmittal↔drawing revision history ✅ (transmittal items snapshot rev conveyed; `GET register/:id/history`, 0123); register ✅, distribution matrix ✅ |
| Engineering | ✅ high | In-browser IFC/BIM viewer ✅ (`/engineering/bim`: web-ifc WASM + three.js, registry UI + revision bumps, Playwright-verified); registry backend ✅, TQ ✅, submittal→drawing ✅ |
| Fleet | ✅ | telemetry ✅ + Mulkiya-renewal ✅ + Salik/fines ✅; geofencing ◐ |
| Assets | ✅ | disposal→GL reactor ✅, pagination ✅, QR-tag generation ✅ (deep-link payload + SVG, single/batch/raw-SVG endpoints) |
| AMC | ✅ | ✅ **SLA status + escalation + breach→notification**; pagination ✅ (work-orders, tickets) |

---

## 2. Cross-module integration gaps

Reactors present (15): opportunity→tender, tender.awarded→contract, contract.signed→project(+WBS/CBS seed),
ipc.certified→AR, invoice.paid→…, grn.created→…, stock.movement→(COGS/low-stock), po.created→…,
subcontract.claim→AP, backcharge.recovered→…, **asset.disposed→GL ✅**, amc.workorder.completed→AR ✅.

| Loop | Status | Fix |
|---|:--:|---|
| Asset disposal → GL journal | ✅ | done |
| Subcontract claim → AP invoice | ✅ | done |
| MAR/Quality → PO issue hard-gate | ✅ | done (service gate) |
| AMC SLA breach → escalation/notification | ✅ | done (0118: sweep + escalation + breach→notification) |
| ITP/WIR approved → project milestone release gate | ✅ | done — `ITP_GATE` in WbsService (mirrors MAR gate); WBS node can't complete while active ITPs have pending points |
| Low-stock → auto-PR | ✅ | confirmed wired (reactor existed); reorder-crossing E2E coverage added |

---

## 3. Cross-cutting / infrastructure gaps

| Gap | State | Fix |
|---|---|---|
| **Pagination rollout (#22)** | ✅ | Finance ✅; subcontracts ✅; AMC ✅; HSE ✅; **Quality ✅ (NCRs, IRs, snags, ITPs + MAR endpoint exposed)**. (WBS/CBS trees + lookup tables intentionally exempt.) |
| **DTO validation (#23)** | ✅ | Global pipe ✅; spine + **all module controllers decorated** (~75 DTOs; complex nested DTOs deliberately left interface-typed — whitelist would strip undecorated fields). Rollout surfaced + fixed a real PATCH spread-wipe bug (`useDefineForClassFields:false`). |
| **Soft-delete** | ✅ | 0125 — assets, HR employees, fleet vehicles, budgets get `deleted_at` + `POST :id/restore`; partial live indexes; extends 0116 customer-invoice pattern. |
| **Notifications delivery** | ✅ | Relay wired end-to-end: `NOTIFY_CHANNELS` (csv) + `NOTIFY_FALLBACK_RECIPIENT` deliver event-raised (tenant-broadcast) records via the env-gated channel endpoints (SMTP_RELAY_URL / SMS_RELAY_URL / Slack / Teams). |
| **Aggregate-store bottleneck** | ✅ | HR + Quality postgres stores split into per-entity files (8 + 7); old paths remain as re-export barrels. |
| **Object storage (DMS bytes)** | ✅ | `SupabaseDocumentStorage` behind the existing `DOCUMENT_STORAGE` port (env-gated: `DMS_STORAGE_PROVIDER=supabase`); local disk stays default. `GET documents/:id/content?version=` streams bytes back. |

---

## 4. Test & verification gaps

| Area | State | Fix |
|---|---|---|
| Thin unit coverage | ✅ | Engineering (TQ + BIM registry), HSE (risk assessment + training matrix), Site (labour-by-trade + instructions), Doc-Control (register + submittal codes) — service-workflow tests added. |
| DB-integration tests | ❌ | Still in-memory doubles only (needs a live Postgres in CI — deferred with RLS work). |
| HTTP E2E | ✅ | `chains.e2e-spec.ts`: deal chain (opp won→tender→award→contract→sign→project+WBS) + P2P (PO issued→GRN→received) over real HTTP; invalid-payload 400s. |
| Coverage gate | ◐ | `test:coverage` runs in CI; no hard % threshold enforced (set once baseline stabilises). |

---

## 5. Priority ranking

**P1 — correctness / commercial-blocking** — ✅ ALL DONE
1. ✅ Inventory FIFO cost layers → COGS posting (per-item WAC|FIFO).
2. ✅ Finance intercompany eliminations (true group consolidation).
3. ✅ AMC SLA escalation + breach reactor + notification.
4. ✅ DTO validation rollout — spine create-DTOs done (remaining ~30 controllers = P2).

**P2 — depth completeness** — ✅ ALL DONE
5. ✅ Pagination on remaining transactional lists — Tier-1 #22 closed (+ Quality).
6. ✅ HR appraisal + ✅ org-chart + ✅ Tendering estimate engine + ✅ Procurement framework agreements.
7. ✅ Doc-Control transmittal↔drawing revision history + ✅ Assets QR tags + ✅ Inventory barcode/multi-UOM.
8. ✅ Soft-delete standardization (0125) + ✅ notifications delivery wiring + ✅ DTO decoration rollout — Tier-1 #23 closed.

**P3 — assurance / architecture**
9. ✅ Per-chain HTTP E2E + ✅ thin-module unit coverage; ❌ DB-integration tests (needs live Postgres in CI — deferred with RLS).
10. ✅ HR/Quality aggregate stores split; ✅ object-storage adapter (Supabase Storage behind DOCUMENT_STORAGE).
11. ✅ ITP→milestone release gate; ✅ Tendering win/loss analytics (0126); ✅ Engineering in-browser IFC viewer (`/engineering/bim` — web-ifc/three.js, verified in-browser via Playwright).

---

## 6. Progress log (2026-07-02)

| Done | Item | Migration |
|:--:|---|--:|
| ✅ | Inventory FIFO→COGS (per-item costing method) | 0112 |
| ✅ | Finance intercompany eliminations | 0117 |
| ✅ | AMC SLA status + escalation + breach→notification | 0118 |
| ✅ | DTO validation on spine create-DTOs (8 controllers) | — |
| ✅ | HR performance appraisals | 0120 |
| ✅ | HR org-chart (employee managerId) | 0119 |
| ✅ | Pagination: subcontracts, AMC (work-orders, tickets), HSE (incidents, PTWs) — `GET .../paged` | — |
| ✅ | Pagination: finance long-tail (bank-transactions, petty-cash, bank-guarantees, PDCs, budgets) — Tier-1 #22 closed | — |
| ✅ | Tendering estimate engine: rate build-ups (`POST tendering/estimates`, apply-to-BOQ, tender summary) | 0121 |
| ✅ | Procurement framework agreements: rate card + ceiling, activate/terminate, call-off→PO (approved-vendor + idempotent) | 0122 |
| ✅ | Doc-Control transmittal items: transmittal↔register linkage + per-document revision history endpoint | 0123 |
| ✅ | Assets QR tags: `GET assets/:id/qr-tag` (+`/svg`, `POST qr-tags/batch`) — derived, `qrcode` dep in @aura/assets | — |
| ✅ | Inventory barcode + multi-UOM: `GET stock/by-barcode/:barcode`, `PATCH stock/:id/uom`, movements accept `unit` (qty + unitCost convert to base) | 0124 |
| ✅ | Soft-delete standardization: assets/HR/fleet/budgets `deleted_at` + `POST :id/restore`, partial live indexes | 0125 |
| ✅ | Notifications delivery: `NOTIFY_CHANNELS` + `NOTIFY_FALLBACK_RECIPIENT` route event-raised records to the env-gated relays | — |
| ✅ | Low-stock → auto-PR reactor confirmed + reorder-crossing test coverage | — |
| ✅ | ITP release gate: WBS completion blocked while project has active ITPs with pending points (`ITP_GATE`, mirrors MAR gate) | — |
| ✅ | Quality pagination: `GET quality/{ncrs,irs,snags,itps,material-approvals}/paged` | — |
| ✅ | Tendering competitor win/loss: outcomes (our bid, competitors, winner, reason) + `GET tendering/outcomes/analytics` (win rate, head-to-head, loss reasons) | 0126 |
| ✅ | Object storage: `SupabaseDocumentStorage` adapter (env-gated) + `GET documents/:id/content` download | — |
| ✅ | HR + Quality postgres stores split into per-entity files (barrels keep imports working) | — |
| ✅ | DTO validation rollout completed across all module controllers (~75 DTOs) — Tier-1 #23 closed | — |
| ✅ | **Fix:** DTO class-field PATCH spread-wipe bug — `useDefineForClassFields:false` (caught by new chain e2e; PATCH was wiping unsent fields) | — |
| ✅ | Business-chain HTTP e2e (deal chain + P2P) + service-workflow tests for Engineering/HSE/Site/Doc-Control | — |

| ✅ | **Engineering in-browser IFC/BIM viewer** — `/engineering/bim`: model registry UI + revision bumps over the bim-models API; web-ifc (WASM) streams meshes into a three.js scene (orbit, auto-fit); loads registered file URLs or local .ifc; Playwright-verified end-to-end in a real browser | — |

**Remaining (deliberately deferred):**
- DB-integration tests + RLS enforcement — last task, needs live Postgres (per project decision).
- CRM MS-Graph email send, fleet geofencing evaluation, site resource-histogram viz, coverage % gate — UI/infra polish items, none block commercial flows.

---
*Verified from source 2026-07-02. Gap-closure pass executed same day — all P1/P2 and structural P3 items closed on `feat/module-depth-verticals-jun30`.*
