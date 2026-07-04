---
id: adr_b8d5ddaa
number: 0001
title: Foreign-Key Policy: snapshot-by-reference, not referential joins
status: Accepted
category: Architecture
owner: Architecture
date: 2026-07-01
supersedes: []
related: []
---

# ADR-0001 — Foreign-Key Policy: snapshot-by-reference, not referential joins

**Status:** Accepted · **Date:** 2026-07-01 · Closes TIER-2 #51.

## Decision
Cross-**module** relationships are stored as **reference-id + denormalised snapshot**, not as
database foreign keys. In-**module** relationships (a parent and its own child rows) MAY use FKs.

- **Cross-module (no FK):** e.g. a Contract carries `tenderId` + `tenderTitle`; a Project carries
  `contractId` + `accountName`; an AP invoice carries `poId` + supplier snapshot. The consumer can
  reconstruct the chain from ids/snapshots and from the event payloads — **never a `JOIN` across
  another module's tables.**
- **Intra-module (FK allowed):** e.g. `aura_finance_journal_lines.journal_id → aura_finance_journals.id`,
  `aura_amc_work_orders.contract_id → aura_amc_service_contracts.id`, PPM/tickets → contracts.

## Why
1. **Module isolation.** Modules own their tables; a cross-module FK would couple schemas and
   break independent deploy/migration. Composition happens via events + the HTTP API, not the DB.
2. **Read resilience.** A snapshot (name/value at time of reference) survives edits/deletes of the
   source and needs no join to render lists.
3. **Tenancy.** Cross-tenant integrity is enforced in app code + RLS (`tenant_id` on every table),
   not by FK graphs.

## Consequences / trade-offs
- **No DB-level referential integrity across modules** — orphan references are possible; the app
  and the event reactor are responsible for consistency (idempotent, reference-keyed creates).
- **Snapshots can go stale** — mitigated where it matters by reactors (e.g. `tender.updated → CBS
  re-sync`) and by carrying the id so a fresh read is always possible.
- FK count is intentionally **low relative to table count** — this is by design, not an omission.

## Verification
`git grep "references public.aura_"` — matches are intra-module only (journal lines, AMC children,
etc.); no cross-module FKs exist.
