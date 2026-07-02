# AURA OS — Module Vertical-Depth Gap Analysis (2026-07-02)

Source of truth: current codebase (branch `feat/module-depth-verticals-jun30`). Verified by file
inspection + grep, not memory. 17 L2 modules · 90+ domain entities · 15 cross-module reactors · DB @ migration 0123.

Legend: ✅ present · ◐ partial · ❌ missing.

---

## 1. Per-module functional gaps (verified)

| Module | Depth | Remaining gaps to fix |
|---|:--:|---|
| CRM | ✅ high | MS-Graph **email seam** (contacts ✅, activities/tasks ✅, pagination ✅) |
| Tendering | ✅ | Estimate engine ✅ (rate build-ups mat+lab+plant+subcon → OH → profit, tender summary, 0121); competitor win/loss analytics ❌ (bid-scoring ✅) |
| Contracts | ✅ high | (clause library ✅, obligations+due-soon ✅, IPC ✅) — none material |
| Projects | ✅ high | **Revenue recognition** UI polish; resource histogram viz (CPM reschedule + levelling ✅) |
| Procurement | ✅ high | Framework/blanket agreements ✅ (rate card, ceiling drawdown, call-off→PO, 0122); approval matrix ✅, 3-way ✅, MAR gate ✅ |
| Inventory | ◐ | ✅ FIFO cost layers→COGS (per-item WAC\|FIFO); remaining: **barcode + multi-UOM** |
| Finance | ✅ high | ✅ **Intercompany eliminations** (reversing entries; group nets intra-group to zero) |
| HR | ✅ high | ✅ **Performance appraisal** + ✅ **org-chart** (attendance ✅, WPS SIF ✅, payroll ✅) |
| HSE | ◐ | **Training-matrix** ✅ + risk-assessment ✅ present; audit-trail depth ◐; pagination ✅ (incidents, PTWs) |
| Quality | ✅ high | calibration ✅ + audit schedules ✅; **no pagination**; consolidated store large (524 ln) |
| Site | ✅ | labour-by-trade ✅ + progress% ✅; resource histograms ◐ |
| Subcontracts | ◐ | Pagination ✅ (head list); back-charges ✅, retention-release ✅ |
| Doc-Control | ✅ | Transmittal↔drawing revision history ✅ (transmittal items snapshot rev conveyed; `GET register/:id/history`, 0123); register ✅, distribution matrix ✅ |
| Engineering | ◐ | **In-browser IFC/BIM viewer (frontend)** — registry backend ✅, TQ ✅, submittal→drawing ✅ |
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
| **ITP/WIR approved → project milestone release gate** | ❌ | add gate so milestones can't close on open ITPs |
| **Low-stock → auto-PR** | ◐ | event emitted; auto-PR draft reactor not confirmed wired |

---

## 3. Cross-cutting / infrastructure gaps

| Gap | State | Fix |
|---|---|---|
| **Pagination rollout (#22)** | ✅ | Finance (journals, payments, bank-transactions, petty-cash, bank-guarantees, PDCs, budgets) ✅; subcontracts ✅; AMC work-orders + tickets ✅; HSE incidents + PTWs ✅. (WBS/CBS trees + lookup tables intentionally exempt.) |
| **DTO validation (#23)** | ◐ | `ValidationPipe` global ✅; spine create-DTOs decorated ✅ (finance, CRM accounts+contacts, tendering, contracts, projects, PO, GRN); remaining ~30 controllers still interface-typed. |
| **Soft-delete** | ❌ | Only 1 table has `deleted_at` (customer-invoices reference). Standardize audit-safe soft-delete + restore across modules. |
| **Notifications delivery** | ◐ | In-app center ✅; email/SMS/push relay **not wired** (SMTP/SMS relay seam only). |
| **Aggregate-store bottleneck** | ◐ | HR (511 ln) + Quality (524 ln) consolidated `postgres-*-store.ts` — split into per-entity stores (attendance, calibration, …). |
| **Object storage (DMS bytes)** | ❌ | No S3/object-store seam; BIM/model files + attachments reference keys with no backing store. |

---

## 4. Test & verification gaps

| Area | State | Fix |
|---|---|---|
| Thin unit coverage | ◐ | Engineering **1** test file, HSE/Site/Doc-Control **2** each — add domain + service tests. |
| DB-integration tests | ❌ | Almost all tests use in-memory doubles; Postgres triggers/constraints/tx-rollback unchecked (only finance journal-store has a live test). |
| HTTP E2E | ◐ | Supertest spine e2e (3) + Playwright smoke (2) exist; no per-chain E2E (P2P, O2C, deal-chain, service). |
| Coverage gate | ◐ | `test:coverage` runs in CI; no hard % threshold enforced. |

---

## 5. Priority ranking

**P1 — correctness / commercial-blocking** — ✅ ALL DONE
1. ✅ Inventory FIFO cost layers → COGS posting (per-item WAC|FIFO).
2. ✅ Finance intercompany eliminations (true group consolidation).
3. ✅ AMC SLA escalation + breach reactor + notification.
4. ✅ DTO validation rollout — spine create-DTOs done (remaining ~30 controllers = P2).

**P2 — depth completeness**
5. ✅ Pagination on remaining transactional lists (finance/inventory/subcontracts/AMC/HSE) — Tier-1 #22 closed.
6. ✅ HR appraisal + ✅ org-chart + ✅ Tendering estimate engine + ✅ Procurement framework agreements.
7. ✅ Doc-Control transmittal↔drawing revision history + ✅ Assets QR tags. Remaining: Inventory barcode/UOM.
8. Soft-delete standardization; notifications email/SMS delivery; remaining DTO decoration.

**P3 — assurance / architecture**
9. DB-integration + per-chain HTTP E2E tests; raise thin-module unit coverage.
10. Split HR/Quality aggregate stores; object-storage seam for DMS/BIM bytes.
11. Engineering in-browser IFC viewer (frontend); ITP→milestone release gate.

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

**Next:** Inventory barcode/UOM (last of P2 item 7), then soft-delete standardization / notifications delivery / remaining DTOs (item 8).

---
*Verified from source 2026-07-02. No files modified by this analysis.*
