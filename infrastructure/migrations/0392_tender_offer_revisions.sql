-- ============================================================
-- AURA OS — migration 0392: a tender has one offer, and its submitted revisions do not move
-- ------------------------------------------------------------
-- EST-16, the owner's decision of 2026-09-25 — "(a), (a), (a)":
--   "One logical offer per tender with immutable, linked revisions after first submission. An
--    unsubmitted draft may refresh in place. Revising a submitted tender offer requires a permanent
--    reason and regenerates the new revision from the current governed estimate. Preserve previous
--    revision figures and decisions."
--
-- The domain enforces each rule. This migration makes the database refuse the same things, so a
-- second writer that skips the domain is refused too:
--
--   1. ONE NUMBER PER TENDER. A new quotation row for a tender must carry the number its tender's
--      offer already has. Generating used to mint a new QUO number on every press; tenders that
--      forked that way before this migration keep their rows, and cannot fork further.
--   2. A SUPERSEDED REVISION IS HISTORY. A `revised` row keeps its figures, terms and status for good.
--   3. FIGURES MOVE ONLY IN A DRAFT — and, for a tender offer, only in a draft nobody has been asked
--      to decide on. Once a revision has been submitted (a return is the trace it leaves), its lines,
--      totals and cost build-up change only by raising the next revision.
--   4. THE REVIEW DECISIONS ARE APPEND-ONLY, with a closed set of outcomes: `returned` (the
--      reviewer's reason) and `revised` (the reviser's reason, recorded against the revision it
--      supersedes). A reason is never blank.
-- ============================================================

-- ── 4. Review decisions: closed outcomes, non-blank reasons, append-only ─────────────────────────
alter table public.aura_crm_quotation_review_decisions
  drop constraint if exists aura_crm_quotation_review_outcome;
alter table public.aura_crm_quotation_review_decisions
  add constraint aura_crm_quotation_review_outcome check (outcome in ('returned', 'revised'));
alter table public.aura_crm_quotation_review_decisions
  drop constraint if exists aura_crm_quotation_review_reason;
alter table public.aura_crm_quotation_review_decisions
  add constraint aura_crm_quotation_review_reason check (coalesce(length(btrim(reason)), 0) > 0);

create or replace function public.aura_crm_quotation_review_append_only() returns trigger
language plpgsql as $fn$
begin
  raise exception using errcode = '23514',
    message = 'a quotation review decision is immutable — a later decision is recorded beside it, never over it';
end
$fn$;

drop trigger if exists aura_crm_quotation_review_append_only on public.aura_crm_quotation_review_decisions;
create trigger aura_crm_quotation_review_append_only
  before update or delete on public.aura_crm_quotation_review_decisions
  for each row execute function public.aura_crm_quotation_review_append_only();

-- ── 1–3. The offer and its revisions ────────────────────────────────────────────────────────────
create or replace function public.aura_crm_quotation_revision_guard() returns trigger
language plpgsql as $fn$
declare
  existing_number text;
begin
  if tg_op = 'INSERT' then
    -- The stores UPSERT, so BEFORE INSERT fires on every save: only a genuinely new row is judged.
    if exists (select 1 from public.aura_crm_quotations q where q.id = new.id) then
      return new;
    end if;
    if new.source_tender_id is not null then
      -- Two first generations arriving together must not both see "no offer yet".
      perform pg_advisory_xact_lock(hashtext('aura-tender-offer:' || new.tenant_id || ':' || new.source_tender_id));
      select q.quote_number into existing_number
        from public.aura_crm_quotations q
       where q.tenant_id = new.tenant_id and q.source_tender_id = new.source_tender_id
         and q.quote_number <> new.quote_number
       order by q.created_at desc
       limit 1;
      if existing_number is not null then
        raise exception using errcode = '23514',
          message = format('a tender has one offer — %s already is this tender''s offer; a change is its next revision, not a new number', existing_number);
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status = 'revised' and (
       new.status is distinct from old.status or new.revision is distinct from old.revision
    or new.quote_number is distinct from old.quote_number
    or new.lines is distinct from old.lines or new.subtotal is distinct from old.subtotal
    or new.vat_total is distinct from old.vat_total or new.total is distinct from old.total
    or new.estimation is distinct from old.estimation or new.pricing is distinct from old.pricing
    or new.terms is distinct from old.terms or new.exclusions is distinct from old.exclusions
    or new.payment_conditions is distinct from old.payment_conditions
    or new.delivery_terms is distinct from old.delivery_terms or new.valid_until is distinct from old.valid_until) then
    raise exception using errcode = '23514',
      message = format('%s Rev %s is immutable — it was superseded by its next revision, and keeps its figures and decisions', old.quote_number, old.revision);
  end if;

  if new.lines is distinct from old.lines or new.subtotal is distinct from old.subtotal
     or new.vat_total is distinct from old.vat_total or new.total is distinct from old.total
     or new.estimation is distinct from old.estimation or new.pricing is distinct from old.pricing then
    if old.status <> 'draft' then
      raise exception using errcode = '23514',
        message = format('the figures of %s Rev %s are immutable once it has left draft — raise its next revision to change them', old.quote_number, old.revision);
    end if;
    if old.source_tender_id is not null and exists (
      select 1 from public.aura_crm_quotation_review_decisions d
       where d.tenant_id = old.tenant_id and d.quotation_id = old.id and d.revision = old.revision
    ) then
      raise exception using errcode = '23514',
        message = format('the figures of %s Rev %s are immutable — it was submitted for review, so a change is its next revision', old.quote_number, old.revision);
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_crm_quotation_revision_guard on public.aura_crm_quotations;
create trigger aura_crm_quotation_revision_guard
  before insert or update on public.aura_crm_quotations
  for each row execute function public.aura_crm_quotation_revision_guard();

-- @DOWN
drop trigger if exists aura_crm_quotation_revision_guard on public.aura_crm_quotations;
drop function if exists public.aura_crm_quotation_revision_guard();
drop trigger if exists aura_crm_quotation_review_append_only on public.aura_crm_quotation_review_decisions;
drop function if exists public.aura_crm_quotation_review_append_only();
alter table public.aura_crm_quotation_review_decisions drop constraint if exists aura_crm_quotation_review_reason;
alter table public.aura_crm_quotation_review_decisions drop constraint if exists aura_crm_quotation_review_outcome;
