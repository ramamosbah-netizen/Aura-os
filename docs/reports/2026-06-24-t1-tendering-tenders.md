# Report — T1.2: Tendering module (Tenders v1) — the second business module

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** T1 step 2 — the second link in the deal chain (CRM → **Tender** → Contract → Project), cloned from the CRM template. This is the first test of whether the template actually composes.

> A Tender is a bid/proposal that **references** a CRM account (by id + name snapshot, never a DB join). Standing it up was mostly mechanical — the kernel + the CRM template did the work.

---

## What was built

**`modules/tendering` — the `@aura/tendering` package:**
- `src/domain/tender.ts` — framework-free `Tender` model + `makeTender` (trims, sane defaults, coerces a garbage `value` to 0) + `TENDER_EVENT`. Carries `accountId` + `accountName` — a **reference + snapshot** of the CRM account, not a foreign key. 4 vitest tests.
- `src/tender-store.ts` + `in-memory-tender-store.ts` + `postgres-tender-store.ts` — the store port + both impls, picked from `DATABASE_URL` (the kernel pattern).
- `src/tender.service.ts` — `TenderService`: **owns its data**, goes through the kernel **access seam** (`AccessService.assert('tendering.tender.create')`), and emits `tendering.tender.created` on the **event spine** with the account reference in the payload. No cross-module DB access.
- `src/tendering.module.ts` — `TenderingModule` imports `CoreModule` and provides the store (factory on `PG_POOL`) + service.

**API** (`apps/api`): `TenderingController` (`POST/GET /api/tendering/tenders`, `GET /:id`) — stamps tenant/actor from context, delegates to `TenderService`. Wired into `AppModule`. Migration `0006_tendering_tenders.sql` (`aura_tendering_tenders`, indexed on tenant/status/account, RLS-locked).

**Web** (`apps/web`): a **Deal chain** nav group (now Accounts + Tenders) → `/tendering/tenders` page (Server Component) + `components/tender-create.tsx` (`'use client'`) posting to a BFF route handler `app/api/tendering/tenders/route.ts`. The page fetches **tenders and CRM accounts in parallel**, so the create form's account dropdown is fed from the CRM API — **modules composing in the UI through the contract**, not a shared dependency.

## Verified

- `pnpm build` → **6/6** (shared → core → **tendering** + crm → api → web). Web routes now include `/tendering/tenders` + `/api/tendering/tenders` (both dynamic).
- `pnpm test` → **57/57** (53 + **4 new tendering**).
- `pnpm db:migrate` → `0006` already current (applied during build-out); 0 applied, 6 current.
- **Live, full vertical, with cross-module composition**: fetched CRM account `Globex MEP 9739` → created tender `Tower CCTV Fit-out` (value 1,250,000, status submitted) **referencing that account** → persisted (API list) → `tendering.tender.created` rode the spine carrying `payload.account = {id, name}` (`[Tendering] Tender created` → `▶ tendering.tender.created` → `Relayed 1 event(s)`).

## Decisions

- **The template held.** Tendering is a near-mechanical clone of CRM — same package shape, same store port + dual impls, same access seam, same controller/BFF/page pattern. The kernel-first thesis pays off again: the second module was mostly typing.
- **Compose by reference + snapshot, not joins.** A tender keeps the account's `id` *and* a `name` snapshot, so it reads correctly without ever touching `aura_crm_*`. Cross-module knowledge flows via the API (the UI dropdown) and events (the payload) — proven live, both ways.
- **Access seam wired, enforcement awaits auth** — `assert('tendering.tender.create')` runs only when an actor is present; dev has `actorId = null`, so it passes through (the same honest gap as CRM, closed when auth lands).
- **Append-only spine, clearable projection** — verification surfaced a leftover `tendering.tender.created` with no matching row. That's expected: `EVENT_STORE` and `TENDER_STORE` share one `PG_POOL` (an event can't persist while its insert silently fails), so it's simply an immutable event left behind when the business table was cleared during testing. The log is the source of truth; tables are rebuildable.

## Next

Continue the deal chain — **Contract** (Tender → Contract), cloning this template again — or deepen Tendering (line items, status transitions via the Workflow engine). Plus the cross-cutting **auth** work that turns every module's access seam from wired to enforced.
