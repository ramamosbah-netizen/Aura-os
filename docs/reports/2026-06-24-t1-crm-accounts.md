# Report — T1.1: CRM module (Accounts v1) — the first business module

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** T1 begins — the first business module on the completed kernel + shell. This establishes the **template** for the remaining T1 modules.

---

## What was built

**`modules/crm` — the `@aura/crm` package** (the first thing in `modules/*`):
- `src/domain/account.ts` — framework-free `Account` model (the head of the deal chain) + `makeAccount` + `CRM_EVENT`. Module-owned, so it lives in the package, **not** `@aura/shared`. 3 vitest tests.
- `src/account-store.ts` + `in-memory-account-store.ts` + `postgres-account-store.ts` — the store port + both impls (chosen from `DATABASE_URL`, the kernel pattern).
- `src/account.service.ts` — `AccountService`: **owns its data**, goes through the kernel **access seam** (`AccessService.assert('crm.account.create')`), and emits `crm.account.created` on the **event spine**. No cross-module DB access.
- `src/crm.module.ts` — `CrmModule` imports `CoreModule` (for the event store, access platform, shared pg pool) and provides the store + service.

**Kernel change:** `CoreModule` now **exports `PG_POOL`** so modules can build their own stores on the one shared pool.

**API** (`apps/api`): `CrmAccountsController` (`POST/GET /api/crm/accounts`, `GET /:id`) — stamps tenant/actor from context, delegates to `AccountService`. `CrmModule` wired into `AppModule`. Migration `0005_crm_accounts.sql` (`aura_crm_accounts`, RLS-locked).

**Web** (`apps/web`): a **CRM** nav group → `/crm/accounts` page (Server Component: list + inline create form) + `components/account-create.tsx` (`'use client'`) posting to a BFF route handler `app/api/crm/accounts/route.ts`. The web defines its **own** `Account` shape — the web↔API boundary is the HTTP contract, not a shared-type dependency.

## Verified

- `pnpm build` → **5/5** (shared → core → **crm** → api → web). Web routes now include `/crm/accounts` + `/api/crm/accounts`.
- `pnpm test` → **53/53** (50 + **3 new CRM**).
- `pnpm db:migrate` → applied `0005` (skipped 0001–0004).
- **Live, full vertical**: created `Globex MEP 9739` via the web form → BFF → Nest → `AccountService` → persisted (API list count=1), web `/crm/accounts` renders it, and `crm.account.created` rode the outbox (`[CRM] Account created` → `▶ crm.account.created` → `Relayed 1 event(s)`).

## Decisions (the module template)

- **A module is its own package** (`@aura/crm`), depending on `@aura/core` + `@aura/shared`. Domain lives in the module, not the kernel.
- **Owns its data; talks via events + API** — `aura_crm_*` tables, no cross-module joins. Other modules learn about accounts from `crm.account.*` events or the API.
- **Same store pattern as the kernel** — port + Postgres/in-memory, picked from `DATABASE_URL` (boot-safe).
- **Web decoupled from module packages** — the page declares the JSON shape it needs; web never imports `@aura/crm`.
- **Access seam wired, enforcement awaits auth** — `AccountService` calls `assert('crm.account.create')` when an actor is present; dev has `actorId = null` (no auth yet), so it passes through. Real enforcement turns on when authentication populates the actor (the [[finance-cashflow-and-db-authority]]-style staged hardening). This is the one honest gap.

## Next

Extend CRM (Contacts, Opportunities) **or** the next T1 module — **Tendering** (the deal chain: CRM → Tender → Contract → Project), cloning this template. Plus the cross-cutting **auth** work that turns the access seam from wired to enforced.
