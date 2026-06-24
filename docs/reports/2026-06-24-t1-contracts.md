# Report — T1.3: Contracts module (Contracts v1) — the third deal-chain module

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** T1 step 3 — the third link (CRM → Tender → **Contract** → Project), cloned from the CRM/Tendering template. First module that references **two** prior links.

> A Contract is awarded from a **won tender**, so it carries the tender *and* account references by snapshot — the deal chain composing all the way down, still with no cross-module join.

---

## What was built

**`modules/contracts` — the `@aura/contracts` package:**
- `src/domain/contract.ts` — framework-free `Contract` model + `makeContract` + `CONTRACT_EVENT`. Holds `tenderId`+`tenderTitle` **and** `accountId`+`accountName` (two reference+snapshot pairs). 4 vitest tests.
- store port + `in-memory` + `postgres` impls (filters: tenant/status/account/**tender**), picked from `DATABASE_URL`.
- `src/contract.service.ts` — `ContractService`: owns its data, access seam (`assert('contracts.contract.create')`), emits `contracts.contract.created` carrying **both** the tender and account references in the payload.
- `src/contracts.module.ts` — imports `CoreModule`, provides store (factory on `PG_POOL`) + service.

**API** (`apps/api`): `ContractsController` (`POST/GET /api/contracts/contracts`, `GET /:id`, list filters incl. `?tenderId`). Wired into `AppModule`. Migration `0007_contracts_contracts.sql` (`aura_contracts_contracts`, indexed on tenant/status/account/tender, RLS).

**Web** (`apps/web`): **Contracts** added to the Deal-chain nav → `/contracts/contracts` page (Server Component) + BFF route handler + `components/contract-create.tsx`. The page fetches contracts **and won tenders in parallel** (`/api/tendering/tenders?status=won`); the create form's dropdown is those won tenders, and **picking one inherits its account + value** — three modules composing in the UI through the contract.

## Verified

- `pnpm build` → **7/7** (shared → core → **contracts** + crm + tendering → api → web). Web routes now include `/contracts/contracts` + `/api/contracts/contracts`.
- `pnpm test` → **61/61** (57 + **4 new contracts**).
- `pnpm db:migrate` → applied **`0007`** (skipped 0001–0006).
- **Live, full deal chain**: CRM account `Globex MEP` → **won** tender `Airport BMS Package` (3.4M, in the `?status=won` feed carrying its account snapshot) → contract `Airport BMS Delivery` raised from it, inheriting tender + account + value → persisted → `contracts.contract.created` on the spine with `payload.tender {id,title}` **and** `payload.account {id,name}`. Chain-integrity check (contract→tender→account ids) **matched**. `[Tendering] … → [Contracts] Contract created`.

## Decisions

- **Two-hop references.** A contract snapshots both the won tender and the account, so it reads correctly on its own and the chain stays join-free. The event payload carries both, so downstream consumers (intelligence layer, webhooks) get the whole chain in one message.
- **The won-tender feed is the composition proof.** The form sources options from the Tendering API filtered to `status=won`; each won tender already carries its CRM account, so the contract inherits the account transitively — CRM ← Tender ← Contract, all over HTTP, no shared package, no shared table.
- **Template held a third time** — same package shape, store pattern, access seam, controller/BFF/page. Adding a deal-chain link is now a known, low-risk move.
- **Access seam wired, enforcement awaits auth** — `actorId = null` in dev passes through, as with CRM/Tendering. The one shared honest gap.

## Next

The final link — **Project** (Contract → Project) — completes the chain end to end. Or deepen any link (line items, status transitions via the Workflow engine). Or the cross-cutting **auth** work that flips every module's access seam from wired to enforced.
