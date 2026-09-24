-- ============================================================
-- AURA OS — migration 0387: a requisition that prices a bid and buys nothing
-- ------------------------------------------------------------
-- The tender pricing journey needs real supplier quotations, compared technically and commercially,
-- on the supply scope of a bid. Procurement already owns every authority that does that — RFQ,
-- supplier quotation revisions, per-line technical evaluation, governed commercial comparison — and
-- every one of them is keyed to a PURCHASE REQUISITION LINE. A BOQ item is not one.
--
-- So a pricing exercise is expressed AS a requisition, and this migration is what stops it being one
-- in any other sense. Measured before writing it:
--
--   * Approving a requisition AUTOMATICALLY DRAFTS A PURCHASE ORDER, and a created order posts
--     committed cost and ordered quantity. A requisition with no project escapes the ledgers only
--     because the ledger reactors happen to skip orders without one — the order itself still exists.
--   * Only approval and award put a requisition on an order HEADER. But order LINES carry
--     `source_pr_line_id` / `source_quote_line_id`, and the line route takes them from the request
--     body — so an ordinary order could have a line naming pricing quotations and a header check
--     would never see it.
--
-- Every service that could cross the line refuses to. THIS makes the database refuse too, so neither
-- a code path nobody has written yet nor a direct write can. The lookups below are SECURITY DEFINER
-- on purpose: they answer one yes/no question, return no data, and must never be told "no" merely
-- because a row-level policy hid the row — a check that fails open is not a boundary.
--
-- Cross-module reads (procurement → tendering) are confined to validating that a pricing requisition
-- names a real tender BOQ basis. They are stated here rather than hidden in application code.
-- ============================================================

-- ── 1. What a requisition is FOR ────────────────────────────────────────────────────────────
alter table public.aura_procurement_purchase_requests
  add column if not exists purpose                  text not null default 'operational',
  add column if not exists source_tender_id         uuid,
  add column if not exists source_basis_revision_id text;

alter table public.aura_procurement_purchase_requests
  drop constraint if exists aura_pr_purpose,
  add constraint aura_pr_purpose check (purpose in ('operational', 'tender_pricing'));

-- A pricing requisition names its tender and BOQ basis, and has NO project to commit money against.
alter table public.aura_procurement_purchase_requests
  drop constraint if exists aura_pr_tender_pricing_shape,
  add constraint aura_pr_tender_pricing_shape check (
    purpose = 'operational'
    or (source_tender_id is not null and source_basis_revision_id is not null and project_id is null)
  );

-- An operational requisition carries no tender reference, so the two can never be mistaken.
alter table public.aura_procurement_purchase_requests
  drop constraint if exists aura_pr_operational_shape,
  add constraint aura_pr_operational_shape check (
    purpose = 'tender_pricing' or (source_tender_id is null and source_basis_revision_id is null)
  );

-- It has no approval lifecycle: approval is the act that drafts a purchase order.
alter table public.aura_procurement_purchase_requests
  drop constraint if exists aura_pr_tender_pricing_is_draft,
  add constraint aura_pr_tender_pricing_is_draft check (purpose = 'operational' or status = 'draft');

create index if not exists idx_aura_pr_source_tender
  on public.aura_procurement_purchase_requests (tenant_id, source_tender_id)
  where source_tender_id is not null;

-- ── 2. What a pricing line prices, and who said so ──────────────────────────────────────────
alter table public.aura_procurement_purchase_request_lines
  add column if not exists source_boq_item_id  uuid,
  add column if not exists material_mapped_by  text,
  add column if not exists material_mapped_at  timestamptz;

-- ── 3. Fail-closed lookups ──────────────────────────────────────────────────────────────────
create or replace function public.aura_is_tender_pricing_pr(p_pr_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $fn$
  select exists (
    select 1 from public.aura_procurement_purchase_requests
     where id = p_pr_id and purpose = 'tender_pricing'
  )
$fn$;

create or replace function public.aura_is_tender_pricing_pr_line(p_line_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $fn$
  select exists (
    select 1 from public.aura_procurement_purchase_request_lines l
      join public.aura_procurement_purchase_requests p on p.id = l.pr_id
     where l.id = p_line_id and p.purpose = 'tender_pricing'
  )
$fn$;

-- A quotation line answers a requisition line; follow it back to the requisition's purpose.
create or replace function public.aura_is_tender_pricing_quote_line(p_quote_line_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $fn$
  select exists (
    select 1 from public.aura_procurement_quotation_lines q
      join public.aura_procurement_purchase_request_lines l on l.id = q.pr_line_id
      join public.aura_procurement_purchase_requests p on p.id = l.pr_id
     where q.id = p_quote_line_id and p.purpose = 'tender_pricing'
  )
$fn$;

-- `aura_procurement_rfqs.pr_id` is TEXT, the requisition id is UUID.
create or replace function public.aura_is_tender_pricing_rfq(p_rfq_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $fn$
  select exists (
    select 1 from public.aura_procurement_rfqs r
      join public.aura_procurement_purchase_requests p on p.id::text = r.pr_id
     where r.id = p_rfq_id and p.purpose = 'tender_pricing'
  )
$fn$;

revoke all on function public.aura_is_tender_pricing_pr(uuid) from public;
revoke all on function public.aura_is_tender_pricing_pr_line(uuid) from public;
revoke all on function public.aura_is_tender_pricing_quote_line(uuid) from public;
revoke all on function public.aura_is_tender_pricing_rfq(uuid) from public;
do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant execute on function public.aura_is_tender_pricing_pr(uuid) to aura_app;
    grant execute on function public.aura_is_tender_pricing_pr_line(uuid) to aura_app;
    grant execute on function public.aura_is_tender_pricing_quote_line(uuid) to aura_app;
    grant execute on function public.aura_is_tender_pricing_rfq(uuid) to aura_app;
  end if;
end $grant$;

-- ── 4. The requisition's identity, and its lifecycle ───────────────────────────────────────
create or replace function public.aura_pr_tender_pricing_guard() returns trigger
language plpgsql as $fn$
begin
  if tg_op = 'UPDATE' and (
       new.purpose is distinct from old.purpose
    or new.source_tender_id is distinct from old.source_tender_id
    or new.source_basis_revision_id is distinct from old.source_basis_revision_id) then
    raise exception using errcode = '23514', message =
      'a requisition''s purpose is immutable: a tender-pricing requisition never becomes an operational one, and an operational one never becomes a pricing exercise';
  end if;
  if new.purpose = 'tender_pricing' and new.status <> 'draft' then
    raise exception using errcode = '23514', message =
      'a tender-pricing requisition can only be a draft — it prices a bid, and approving it would draft a purchase order';
  end if;
  -- The tender and BOQ basis must be real, and must belong together. Checked when the requisition is
  -- written; after that they cannot change (above).
  --
  -- Only when BOTH are present. A missing one is `aura_pr_tender_pricing_shape`'s refusal to make,
  -- under its own name: this test running on a NULL reported "belongs to a different tender" for a
  -- requisition that named no tender at all — refused, but for a reason that was not true.
  if tg_op = 'INSERT' and new.purpose = 'tender_pricing'
     and new.source_tender_id is not null and new.source_basis_revision_id is not null
     and not exists (
    select 1 from public.aura_tendering_boqs b
     where b.tenant_id = new.tenant_id
       and b.tender_id = new.source_tender_id
       and b.source_basis_revision_id = new.source_basis_revision_id
  ) then
    raise exception using errcode = '23514', message =
      'the tender-pricing requisition names a BOQ basis that belongs to a different tender, or one that tender''s BOQ was never projected from';
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_pr_tender_pricing_guard on public.aura_procurement_purchase_requests;
create trigger aura_pr_tender_pricing_guard
  before insert or update on public.aura_procurement_purchase_requests
  for each row execute function public.aura_pr_tender_pricing_guard();

-- ── 5. A pricing line prices a BOQ item of ITS OWN tender and basis ─────────────────────────
create or replace function public.aura_pr_line_tender_pricing_guard() returns trigger
language plpgsql as $fn$
declare
  v_tender uuid;
  v_basis  text;
begin
  if not public.aura_is_tender_pricing_pr(new.pr_id) then
    return new;
  end if;
  if new.source_boq_item_id is null or new.material_mapped_by is null or new.material_mapped_at is null then
    raise exception using errcode = '23514', message =
      'a tender-pricing requisition line must name its BOQ item and who confirmed its material — a line with no confirmed mapping prices something nobody agreed to';
  end if;
  if tg_op = 'UPDATE' and (
       new.source_boq_item_id is distinct from old.source_boq_item_id
    or new.material_id is distinct from old.material_id) then
    raise exception using errcode = '23514', message =
      'a tender-pricing line''s mapping is immutable: quotations were asked against it — remove the line and add the right one';
  end if;
  select p.source_tender_id, p.source_basis_revision_id into v_tender, v_basis
    from public.aura_procurement_purchase_requests p where p.id = new.pr_id;
  if not exists (
    select 1 from public.aura_tendering_boq_items i
      join public.aura_tendering_boqs b on b.id = i.boq_id
     where i.id = new.source_boq_item_id
       and b.tender_id = v_tender
       and b.source_basis_revision_id = v_basis
  ) then
    raise exception using errcode = '23514', message =
      'the BOQ item belongs to a different tender or BOQ basis than this tender-pricing requisition';
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_pr_line_tender_pricing_guard on public.aura_procurement_purchase_request_lines;
create trigger aura_pr_line_tender_pricing_guard
  before insert or update on public.aura_procurement_purchase_request_lines
  for each row execute function public.aura_pr_line_tender_pricing_guard();

-- ── 6. No purchase order from a pricing source — by the HEADER door ─────────────────────────
create or replace function public.aura_po_tender_pricing_guard() returns trigger
language plpgsql as $fn$
begin
  if (new.pr_id is not null and public.aura_is_tender_pricing_pr(new.pr_id))
     or (new.rfq_id is not null and public.aura_is_tender_pricing_rfq(new.rfq_id)) then
    raise exception using errcode = '23514', message =
      'a purchase order is not allowed for a tender-pricing requisition — pricing a bid is not buying for it';
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_po_tender_pricing_guard on public.aura_procurement_purchase_orders;
create trigger aura_po_tender_pricing_guard
  before insert or update of pr_id, rfq_id on public.aura_procurement_purchase_orders
  for each row execute function public.aura_po_tender_pricing_guard();

-- ── 7. …and by the LINE door, which a header check never sees ───────────────────────────────
create or replace function public.aura_po_line_tender_pricing_guard() returns trigger
language plpgsql as $fn$
begin
  if (new.source_pr_line_id is not null and public.aura_is_tender_pricing_pr_line(new.source_pr_line_id))
     or (new.source_quote_line_id is not null and public.aura_is_tender_pricing_quote_line(new.source_quote_line_id)) then
    raise exception using errcode = '23514', message =
      'a purchase order line is not allowed for a tender-pricing source — its requisition or quotation line prices a bid and buys nothing';
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_po_line_tender_pricing_guard on public.aura_procurement_purchase_order_lines;
create trigger aura_po_line_tender_pricing_guard
  before insert or update of source_pr_line_id, source_quote_line_id on public.aura_procurement_purchase_order_lines
  for each row execute function public.aura_po_line_tender_pricing_guard();

-- ── 8. No recommendation on a pricing RFQ ───────────────────────────────────────────────────
-- The COMPARISON stays open — it is how a bid gets its supplier prices. A recommendation exists to
-- authorise an award, and an award raises orders; that is the step a pricing exercise never takes.
create or replace function public.aura_recommendation_tender_pricing_guard() returns trigger
language plpgsql as $fn$
begin
  if public.aura_is_tender_pricing_rfq(new.rfq_id) then
    raise exception using errcode = '23514', message =
      'a sourcing recommendation is not allowed for a tender-pricing RFQ — its comparison prices a bid, and a recommendation authorises a purchase';
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_recommendation_tender_pricing_guard on public.aura_procurement_sourcing_recommendations;
create trigger aura_recommendation_tender_pricing_guard
  before insert or update of rfq_id on public.aura_procurement_sourcing_recommendations
  for each row execute function public.aura_recommendation_tender_pricing_guard();

-- ── 9. Estimate sourcing names a GOVERNED quotation line, not a quote header (BID-01) ───────
alter table public.aura_tendering_estimate_sources
  alter column rfq_id drop not null,
  alter column quote_id drop not null,
  add column if not exists quotation_revision_id uuid,
  add column if not exists quotation_line_id     uuid,
  add column if not exists pr_line_id            uuid,
  add column if not exists material_id           uuid,
  add column if not exists currency              text,
  add column if not exists technical_verdict     text,
  add column if not exists comparison_date       date;

-- Exactly one lineage: the legacy header (older rows, unchanged) or a governed line.
alter table public.aura_tendering_estimate_sources
  drop constraint if exists aura_estimate_source_one_lineage,
  add constraint aura_estimate_source_one_lineage check ((quote_id is not null) <> (quotation_line_id is not null));

-- A governed lineage is complete or it is not a lineage.
alter table public.aura_tendering_estimate_sources
  drop constraint if exists aura_estimate_source_governed_complete,
  add constraint aura_estimate_source_governed_complete check (
    quotation_line_id is null or (
      quotation_revision_id is not null and pr_line_id is not null and material_id is not null
      and currency is not null and technical_verdict is not null and comparison_date is not null
    )
  );

-- @DOWN
-- A governed row has no legacy quote header and cannot exist under the old NOT NULL columns, so it
-- is removed before they are restored. That is the whole of what the down direction can honestly do.
delete from public.aura_tendering_estimate_sources where quotation_line_id is not null;
alter table public.aura_tendering_estimate_sources
  alter column rfq_id set not null,
  alter column quote_id set not null;
alter table public.aura_tendering_estimate_sources
  drop constraint if exists aura_estimate_source_governed_complete,
  drop constraint if exists aura_estimate_source_one_lineage,
  drop column if exists comparison_date,
  drop column if exists technical_verdict,
  drop column if exists currency,
  drop column if exists material_id,
  drop column if exists pr_line_id,
  drop column if exists quotation_line_id,
  drop column if exists quotation_revision_id;
drop trigger if exists aura_recommendation_tender_pricing_guard on public.aura_procurement_sourcing_recommendations;
drop trigger if exists aura_po_line_tender_pricing_guard on public.aura_procurement_purchase_order_lines;
drop trigger if exists aura_po_tender_pricing_guard on public.aura_procurement_purchase_orders;
drop trigger if exists aura_pr_line_tender_pricing_guard on public.aura_procurement_purchase_request_lines;
drop trigger if exists aura_pr_tender_pricing_guard on public.aura_procurement_purchase_requests;
drop function if exists public.aura_recommendation_tender_pricing_guard();
drop function if exists public.aura_po_line_tender_pricing_guard();
drop function if exists public.aura_po_tender_pricing_guard();
drop function if exists public.aura_pr_line_tender_pricing_guard();
drop function if exists public.aura_pr_tender_pricing_guard();
drop function if exists public.aura_is_tender_pricing_rfq(uuid);
drop function if exists public.aura_is_tender_pricing_quote_line(uuid);
drop function if exists public.aura_is_tender_pricing_pr_line(uuid);
drop function if exists public.aura_is_tender_pricing_pr(uuid);
alter table public.aura_procurement_purchase_request_lines
  drop column if exists material_mapped_at,
  drop column if exists material_mapped_by,
  drop column if exists source_boq_item_id;
drop index if exists public.idx_aura_pr_source_tender;
alter table public.aura_procurement_purchase_requests
  drop constraint if exists aura_pr_tender_pricing_is_draft,
  drop constraint if exists aura_pr_operational_shape,
  drop constraint if exists aura_pr_tender_pricing_shape,
  drop constraint if exists aura_pr_purpose,
  drop column if exists source_basis_revision_id,
  drop column if exists source_tender_id,
  drop column if exists purpose;
