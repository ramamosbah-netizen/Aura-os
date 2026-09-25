-- ============================================================
-- 0389 — CORRECTIVE ACTION ON A COMMISSIONING DEFECT (TC-08), enforced by the database.
--
-- The programme owner's decision (2026-09-25): when a defect needs a design correction, T&C ROUTES
-- it to a named Design / Technical Engineer, who receives it in My Work and RECORDS the corrective
-- action — what changed, and the revised drawing or RFI it rests on. Only T&C closes the defect, and
-- only after the retest passes. This holds those rules where no service can route around them:
--
--   1. a routing is complete (to, by, when, why) and, once made, immutable;
--   2. a correction is complete (what, by, when), needs a routing, and is the ASSIGNEE's — recorded
--      by the engineer the defect was routed to and nobody else;
--   3. a routed defect closes only with a correction recorded and, when it came from a test point,
--      with that point's latest run a pass — the retest, not the correction, is what closes it;
--   4. a closed defect keeps its closure, routing and correction as they were.
--
-- An unrouted defect is untouched: it closes with a resolution exactly as before.
-- ============================================================

alter table public.aura_commissioning_punch_items
  add column if not exists routed_to            text,
  add column if not exists routed_by            text,
  add column if not exists routed_at            timestamptz,
  add column if not exists routing_reason       text,
  add column if not exists routing_receipt_id   text,
  add column if not exists corrective_action    text,
  add column if not exists correction_reference text,
  add column if not exists corrected_by         text,
  add column if not exists corrected_at         timestamptz;

alter table public.aura_commissioning_punch_items
  drop constraint if exists aura_punch_routing_complete,
  add constraint aura_punch_routing_complete check (
    (routed_to is null and routed_by is null and routed_at is null and routing_reason is null)
    or (routed_to is not null and routed_by is not null and routed_at is not null and length(btrim(routing_reason)) > 0)
  ),
  drop constraint if exists aura_punch_correction_complete,
  add constraint aura_punch_correction_complete check (
    (corrective_action is null and corrected_by is null and corrected_at is null and correction_reference is null)
    or (length(btrim(corrective_action)) > 0 and corrected_by is not null and corrected_at is not null)
  ),
  drop constraint if exists aura_punch_correction_by_assignee,
  add constraint aura_punch_correction_by_assignee check (
    corrective_action is null or (routed_to is not null and corrected_by = routed_to)
  );

-- The latest result of the test point a defect came from — read fail-closed, as 0388's lookups are.
create or replace function public.aura_commissioning_point_result(p_test_item_id uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $fn$
  select t.result from public.aura_commissioning_test_items t where t.id = p_test_item_id
$fn$;
revoke all on function public.aura_commissioning_point_result(uuid) from public;
do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant execute on function public.aura_commissioning_point_result(uuid) to aura_app;
  end if;
end $grant$;

-- AN UPSERT IS NOT A NEW ROW (see 0388): the store saves with INSERT … ON CONFLICT DO UPDATE, and
-- PostgreSQL fires BEFORE INSERT for the proposed row before it finds the conflict. The INSERT branch
-- steps aside for a row that exists; the UPDATE branch that follows judges it.
create or replace function public.aura_commissioning_punch_guard() returns trigger
language plpgsql as $fn$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.aura_commissioning_punch_items p where p.id = new.id) then
      return new;
    end if;
    if new.routed_to is not null or new.corrective_action is not null then
      raise exception using errcode = '23514', message =
        'a defect is raised open — routing and correction are acts recorded against it afterwards';
    end if;
    return new;
  end if;

  if old.status = 'closed' then
    if new.status is distinct from old.status or new.resolution is distinct from old.resolution
       or new.closed_by is distinct from old.closed_by or new.closed_at is distinct from old.closed_at
       or new.routed_to is distinct from old.routed_to or new.corrective_action is distinct from old.corrective_action
       or new.correction_reference is distinct from old.correction_reference or new.corrected_by is distinct from old.corrected_by then
      raise exception using errcode = '23514', message = 'a closed defect is immutable';
    end if;
    return new;
  end if;

  if old.routed_to is not null and (
       new.routed_to is distinct from old.routed_to or new.routed_by is distinct from old.routed_by
    or new.routed_at is distinct from old.routed_at or new.routing_reason is distinct from old.routing_reason) then
    raise exception using errcode = '23514', message =
      'a defect''s routing to Engineering is immutable once made';
  end if;

  if new.status = 'closed' and new.routed_to is not null then
    if new.corrective_action is null then
      raise exception using errcode = '23514', message =
        'a defect routed to Engineering can only be closed once its corrective action is recorded';
    end if;
    if new.test_item_id is not null
       and public.aura_commissioning_point_result(new.test_item_id) is distinct from 'pass' then
      raise exception using errcode = '23514', message =
        'a defect routed to Engineering can only be closed once the retest of its test point has passed';
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_commissioning_punch_guard on public.aura_commissioning_punch_items;
create trigger aura_commissioning_punch_guard
  before insert or update on public.aura_commissioning_punch_items
  for each row execute function public.aura_commissioning_punch_guard();

-- @DOWN
drop trigger if exists aura_commissioning_punch_guard on public.aura_commissioning_punch_items;
drop function if exists public.aura_commissioning_punch_guard();
drop function if exists public.aura_commissioning_point_result(uuid);
alter table public.aura_commissioning_punch_items
  drop constraint if exists aura_punch_correction_by_assignee,
  drop constraint if exists aura_punch_correction_complete,
  drop constraint if exists aura_punch_routing_complete,
  drop column if exists corrected_at,
  drop column if exists corrected_by,
  drop column if exists correction_reference,
  drop column if exists corrective_action,
  drop column if exists routing_receipt_id,
  drop column if exists routing_reason,
  drop column if exists routed_at,
  drop column if exists routed_by,
  drop column if exists routed_to;
