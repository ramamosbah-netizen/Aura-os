# AURA OS — Gap-Closure Progress Report (2026-06-30)

> Follow-up to the three June-29 due-diligence audits. This documents the gaps **closed and
> verified** in this session, **issues corrections** to the audits where they were stale, and
> restates the remaining backlog. Everything below was source-verified against the live tree
> and exercised end-to-end (build/typecheck/test green + live HTTP), not chat-only.
>
> Whole-workspace gates after each gap: **build 22/22 · typecheck 42/42 · tests 41/41**.
> Migrations now **77** (latest `0076`). Security/RLS hardening remains intentionally deferred.
>
> **Shipping status:**
> - **[PR #10](https://github.com/ramamosbah-netizen/Aura-os/pull/10) — MERGED** (3 commits): §B1 deal-chain hardening + opportunity→account · §B2 AMC persistence · §B3 financial statements · §B4 period close.
> - **[PR #11](https://github.com/ramamosbah-netizen/Aura-os/pull/11) — OPEN** (2 commits): §B5 budgeting · §B6 revenue recognition (+ this report).

---

## A. CORRECTIONS TO THE JUNE-29 AUDITS

The audits were a strong inside-out + outside-in read, but two load-bearing claims were **wrong or stale**. Recording them here so the audit files aren't taken at face value:

| # | Audit claim | Reality (verified 2026-06-30) |
|---|---|---|
| C1 | "Deal chain is **manual re-entry**, chain automation ≈ **20%**, saga not wired" (all three reports, the headline functional finding) | **Wrong.** The chain is auto-orchestrated by `apps/api/src/events/cross-module-subscriber.ts` (a registered provider). It reacts to `opportunity.won → tender`, `tender.awarded → contract`, `contract.signed → project`, plus `ipc.certified → AR` and the operate loop. Events reach it in **both** runtimes — in-memory (`InMemoryEventStore.append → bus.publish`) and Postgres (`OutboxRelay` polls `aura_events → bus.publish`). The auditor read modules in isolation and missed the reactor in `apps/api`. The saga orchestrator is genuinely unwired, but the reactor does the job. |
| C2 | "AMC in-memory only — needs Postgres stores + migration" (true) — but root cause not identified | The deeper reason AMC could **never** have persisted: `genId()` emitted `amc-00001` counter ids, **type-incompatible** with the `uuid` PKs/FKs already in migration `0038`. Wiring a Postgres store alone would still have failed on insert. Fixed at the source. |

The audit reference to `apps/api/tenant-scoping.test.ts` also does not exist at that path (only `search` + `templates` service tests live under `apps/api`).

---

## B. GAPS CLOSED THIS SESSION

### B1. Deal-chain reactor hardening + opportunity→account link  ·  `feat(deal-chain)`
The chain was wired (per C1) but had three real defects:
- **Idempotency** — the reactor created downstream drafts with no idempotency key, so the at-least-once outbox (`bus.publish` over `Promise.all`) could **duplicate** drafts on retry. Now passes deterministic keys (`contract-from-tender:<id>`, `project-from-contract:<id>`, …); the AR path guards on a deterministic invoice number (no command-bus cache there).
- **Shallow seeding** — `contract.signed → project` now seeds a **root WBS node + CBS from the source tender BOQ** (reusing `cbs.syncFromBoq`), guarded on "no WBS yet" so retries don't double-seed.
- **Account carry-down broken at link 1** — `opportunity.stage_changed` dropped `title` (auto-tenders were named "Tender: Opportunity"), and the `Opportunity` domain had **no account link**, so the client snapshot couldn't propagate from the first link. Added `accountId`/`accountName` to the domain, Postgres store, both event payloads, the API DTO, and the web form (account picker + column). **Migration `0073`.**
- **Proof:** new in-memory E2E `cross-module-subscriber.test.ts` (4 tests). Verified live: account "Emaar Properties" flowed opportunity → tender → contract → project, every link auto-created.

### B2. AMC persistence  ·  `feat(amc)`  ·  (audit P0)
- Root-cause fix: `genId()` → `randomUUID()`.
- New `PostgresAmcStore` for all 4 entities (contracts, work orders, tickets, PPM). AMC domain entities are **classes**, so rehydration = construct + `Object.assign` of persisted/read-only fields; `date` columns read via `::text` to dodge TZ drift.
- **Migration `0074`** — the PPM-schedules table `0038` lacked, plus the `sla_response_hours`/`sla_resolution_hours` columns the tickets table was missing (faithful round-trip).
- `amc.module` now DI-swaps `AMC_STORE` on `PG_POOL` like every other module.
- **Proof:** `postgres-amc-store.test.ts` (6 mock-pool tests — rehydration + upsert SQL). In-memory path unchanged; AMC package 13 → **19 tests**.

### B3. Financial statements (GL-derived)  ·  `feat(finance)`  ·  (audit's #1 "system of record" gap)
Built the three primary statements + trial balance from the **double-entry GL** (chart of accounts × journal lines), **not** the old event-heuristic `profit-loss.projection.ts`:
- `domain/statements.ts` — `buildTrialBalance` (ties debits = credits), `buildIncomeStatement` (revenue − expense per period), `buildBalanceSheet` (assets = liabilities + equity + **retained earnings**, where retained closes the P&L into equity), `buildCashFlow` (direct method off cash accounts, opening → in/out → closing, attributed by counterpart). Sign convention: asset/expense debit-normal; liability/equity/revenue credit-normal.
- `StatementsService` + `StatementsController` → `GET /finance/statements/{trial-balance,income-statement,balance-sheet,cash-flow}` (`?asOf` / `?from&to`); read-only `/finance/statements` web page.
- **Proof:** `statements.test.ts` (6 hand-verified tests). Verified live: a 5-account CoA + 4 journals → P&L net **42,000**, balance sheet **`balanced: true`** (142,000 = 142,000), cash flow closing **122,000**.

### B5. Budgeting / budget-vs-actual  ·  `feat(finance)`
GL-grounded — reuses the statements fold so actuals always reconcile to the books:
- `domain/budget.ts` — a Budget is a name + date range + a budgeted amount per GL account (`makeBudget` validates); `buildBudgetVsActual` folds GL actuals over the range and computes variance = budget − actual. Exposed a shared `accountBalances()` helper from `statements.ts`.
- Budget store (in-memory/postgres, lines as jsonb) + **migration `0076`**; `BudgetService` (CRUD + `vsActual`, which loads accounts+journals and folds live — **actuals are never stored**).
- `BudgetController` → `/finance/budgets` (GET/POST/DELETE) + `/:id/vs-actual`; `/finance/budgets` web page (create form with dynamic account/amount lines + inline budget-vs-actual table).
- **Proof:** `budget.test.ts` (2 tests). Verified live: a 20,000 Q1 rent budget vs two posted rent journals (16,000) → variance **4,000 (20% under)**.

### B6. Revenue recognition (IFRS-15 cost-to-cost)  ·  `feat(finance)`  ·  (first cross-module feature)
Composed at the **app layer** so no module depends on another (the same pattern as the cross-module reactor):
- `domain/revenue-recognition.ts` — pure `recognizeRevenue()`: % complete = cost incurred ÷ EAC (capped at 100%); recognised revenue = contract value × %; over-billing (billed > recognised → contract **liability**) / under-billing (recognised > billed → contract **asset**).
- `apps/api/src/finance/revenue-recognition.controller.ts` injects `ProjectService` + `CbsService` (Projects) and `CustomerInvoiceService` (Finance). Cost + EAC from the CBS, contract value from the project, billing = net (ex-VAT) of non-cancelled AR matched by `projectId` **or** `contractRef` (catches IPC-generated invoices). `GET /finance/revenue-recognition` (all) + `/:projectId`; read-only web page.
- **Proof:** `revenue-recognition.test.ts` (4 tests). Verified live: project value 1M, CBS actual 400k / forecast 800k (50%), AR net 300k → recognised **500k**, gross profit **100k**, **under-billing 200k** (contract asset).

### B4. Period close  ·  `feat(finance)`  ·  (completes the financial close)
- `domain/period-close.ts` + store (in-memory/postgres) + `PeriodCloseService` (close/reopen/isClosed/list, idempotent close, emits `finance.period.{closed,reopened}`). **Migration `0075`** (unique `tenant_id + period`).
- **The guard:** `JournalService.post` now consults the period-close store and **rejects posting into a closed period**. `makeJournal`/`NewJournal` gained an optional `postedAt`, so backdated entries into a closed prior month are blocked too. The journal endpoint maps the closed-period/balance error to a clean **400** (was 500).
- `PeriodCloseController` + `/finance/period-close` web page (close/reopen).
- **Proof:** `period-close.test.ts` (5 tests). Verified live: close `2026-05` → a `2026-05` journal returns `HTTP 400 "Period 2026-05 is closed"`; `2026-06` still posts; reopen restores. Finance package now **14 files / 86 tests**.

---

## C. REMAINING BACKLOG (feature gaps; security/ops still deferred)

Ranked by value, unchanged from the audits minus what's now done:

1. **Multi-currency** + FX revaluation. *(next)*
2. **Pagination contract** — cursor + total-count across all list endpoints (cross-cutting).
3. Inventory valuation (FIFO/WAC) + COGS; procurement approval matrix; group consolidation; notifications delivery.

**Deferred by explicit project decision (not regressions):** DB-enforced RLS / FORCE RLS / least-priv app role, auth-on-by-default, secrets rotation, CI/CD, containerization, observability, backups. These remain the Tier-0 production blockers to close **last**, after the feature surface is complete.

---

## D. VERIFICATION POSTURE

- Every gap: workspace **build 22/22 · typecheck 42/42 · tests 41/41**, plus a dedicated test file, plus a **live HTTP** check against the booted in-memory API.
- **Caveat (honest):** migrations `0073`/`0074`/`0075` were **not** run against a live Postgres this session (no `DATABASE_URL`). The Postgres adapters are proven by mock-pool/unit tests + the established DI-swap pattern; the in-memory path is exercised end-to-end. They apply on the next `pnpm db:migrate`.

*End of report. Source-verified against the working tree; shipped across PR #10 (merged) and PR #11 (open). No audit files were modified — corrections are recorded here per the dated-report convention.*
