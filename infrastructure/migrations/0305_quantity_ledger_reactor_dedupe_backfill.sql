-- ============================================================
-- AURA OS — migration 0305: dedupe keys for the reactor-written quantity rows (TC-GATE-20)
-- ------------------------------------------------------------
-- Migration 0255 added `dedupe_key` and its partial unique index so that `QuantityLedgerService.post`
-- could be idempotent — in its own words, "so those reactors can propagate failures to the outbox
-- again". The mechanism shipped. Three reactors never adopted it and kept posting unkeyed rows:
--
--   * procurement.po.updated (cancelled)  → the ORDERED reversal
--   * inventory.grn.created               → the RECEIVED quantity
--   * inventory.stock.movement_recorded   → the ISSUED quantity
--
-- TC-GATE-20 gives all three a key. This backfills the same key onto the rows they have already
-- written, which closes the one window the change would otherwise open: an event sitting in the
-- outbox with attempts > 0 is re-delivered after deploy, finds no conflicting key because the row it
-- wrote last time has none, and posts the quantity a second time.
--
-- ONLY THE FIRST ROW OF EACH GROUP IS KEYED. If a group already holds more than one row, that is a
-- historical double-post — the very thing the key prevents — and keying them all would violate the
-- unique index and fail the deploy. Keying the earliest leaves any duplicate visible and unkeyed,
-- which is the correct outcome: this migration is not the place to decide what to do about a
-- quantity that was counted twice, and it must not paper over one.
--
-- Data-only and additive. No schema change.
-- ============================================================

-- ── ORDERED reversal from a cancelled PO ──────────────────────────────────────
with ranked as (
  select id,
         'po-ordered-reversal:' || (dimensions ->> 'poId') as key,
         row_number() over (
           partition by tenant_id, dimensions ->> 'poId'
           order by occurred_at, id
         ) as rn
    from public.aura_projects_quantity_ledger
   where dedupe_key is null
     and source = 'reversal'
     and dimensions ->> 'reverses' = 'po'
     and dimensions ->> 'poId' is not null
)
update public.aura_projects_quantity_ledger t
   set dedupe_key = r.key
  from ranked r
 where t.id = r.id
   and r.rn = 1;

-- ── RECEIVED quantity from a goods receipt ────────────────────────────────────
with ranked as (
  select id,
         'grn-received:' || (dimensions ->> 'grnId') as key,
         row_number() over (
           partition by tenant_id, dimensions ->> 'grnId'
           order by occurred_at, id
         ) as rn
    from public.aura_projects_quantity_ledger
   where dedupe_key is null
     and source = 'grn'
     and dimensions ->> 'grnId' is not null
)
update public.aura_projects_quantity_ledger t
   set dedupe_key = r.key
  from ranked r
 where t.id = r.id
   and r.rn = 1;

-- ── ISSUED quantity from a stock movement (issue or return) ───────────────────
with ranked as (
  select id,
         'stock-movement:' || (dimensions ->> 'movementId') as key,
         row_number() over (
           partition by tenant_id, dimensions ->> 'movementId'
           order by occurred_at, id
         ) as rn
    from public.aura_projects_quantity_ledger
   where dedupe_key is null
     and source in ('material_issue', 'material_return')
     and dimensions ->> 'movementId' is not null
)
update public.aura_projects_quantity_ledger t
   set dedupe_key = r.key
  from ranked r
 where t.id = r.id
   and r.rn = 1;

-- @DOWN
-- Returns the backfilled rows to unkeyed. Scoped by key prefix, so keys written at post time by the
-- reactors after this migration are reverted too — which is correct: `down` is the bad-deploy escape
-- hatch for this change, and this change is what put those keys there.
update public.aura_projects_quantity_ledger
   set dedupe_key = null
 where dedupe_key like 'po-ordered-reversal:%'
    or dedupe_key like 'grn-received:%'
    or dedupe_key like 'stock-movement:%';
