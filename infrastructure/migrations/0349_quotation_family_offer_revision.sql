-- ============================================================
-- AURA OS — migration 0349: the supplier quotation family (QC-01)
-- ------------------------------------------------------------
-- A supplier quotation was a single mutable row. A revision overwrote it: Rev 0 at AED 100 followed
-- by Rev 1 at AED 92 left one row saying 92 and no evidence that 100 was ever offered. Commercial
-- history is exactly what a buyer needs when a supplier moves from "92 plus freight" to "95 with
-- free freight", and it was being destroyed.
--
-- THE FROZEN MODEL, in three levels because they answer three different questions:
--
--   FAMILY    — this supplier, against this RFQ. One identity, however many times they re-quote.
--   OFFER     — a base offer, or a technical ALTERNATIVE. A Bosch equivalent beside a Hikvision one
--               is a different thing being offered, NOT a cheaper version of the same thing, and
--               modelling it as a revision would let it silently replace what it was offered beside.
--   REVISION  — an immutable commercial snapshot. It is never updated; a change creates the next one.
--
-- EXACTLY ONE CONFIRMED REVISION PER OFFER, enforced below by a partial unique index on
-- status = 'confirmed'. Note what it does NOT say: draft, received, withdrawn and rejected revisions
-- may coexist freely, because none of them is the effective offer. The transition is a DEMOTE then a
-- PROMOTE inside one transaction — confirmed → superseded first, then received → confirmed — which
-- sidesteps the insert-ordering trap that SUP-01 hit against this same kind of index.
--
-- EXPIRY IS NOT A STATUS. It is derived from validity_date against the comparison date, because a
-- revision expired today was live on a June comparison and one stored flag cannot say both. Storing
-- it would also give two sources for one fact.
--
-- STAGED, as frozen: this migration only ADDS. Nothing is dropped, `aura_procurement_rfq_quotes`
-- keeps every column, and quotation lines keep `quotation_id` and `is_alternate` alongside the new
-- `revision_id`. Retiring the legacy fields is the LAST step, after the backfill is verified and
-- SUP-01 and SUP-06 have been switched over and proved.
-- ============================================================

create table if not exists public.aura_procurement_quotation_families (
  id                      uuid        primary key default gen_random_uuid(),
  tenant_id               text        not null,
  company_id              uuid,
  rfq_id                  uuid        not null,
  -- Canonical supplier. NULL is a legacy quotation that named its supplier in free text only, and is
  -- never backfilled by matching names: two suppliers share a name, one supplier gets typed three ways.
  supplier_id             uuid,
  supplier_name           text        not null,
  -- The SUPPLIER'S own reference for the quotation ("Q-1001"), as they wrote it. Not ours.
  supplier_quotation_ref  text,
  created_by              text,
  created_at              timestamptz not null default now()
);

-- One family per supplier per RFQ. NULL supplier_id compares as distinct in Postgres, which is the
-- behaviour we want: legacy free-text quotations are not silently merged into one family.
create unique index if not exists aura_quotation_family_one_per_supplier
  on public.aura_procurement_quotation_families (tenant_id, rfq_id, supplier_id)
  where supplier_id is not null;

create index if not exists idx_aura_quotation_families_rfq
  on public.aura_procurement_quotation_families (tenant_id, rfq_id);

create table if not exists public.aura_procurement_quotation_offers (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   text        not null,
  family_id   uuid        not null references public.aura_procurement_quotation_families (id) on delete cascade,
  -- 'base' | 'alternative'. Alternatives live HERE and not on the line: a supplier offering two
  -- variants for one requisition line had nowhere to put the second, because a line is unique per
  -- requisition line per quotation. Scoped to the revision, each offer answers that line separately.
  kind        text        not null default 'base',
  -- What the alternative IS, in the supplier's terms ("Bosch equivalent"). Null for a base offer.
  label       text,
  created_by  text,
  created_at  timestamptz not null default now(),
  constraint aura_quotation_offers_kind check (kind in ('base','alternative'))
);

-- A family has at most one base offer; alternatives are unbounded.
create unique index if not exists aura_quotation_offer_one_base
  on public.aura_procurement_quotation_offers (tenant_id, family_id)
  where kind = 'base';

create index if not exists idx_aura_quotation_offers_family
  on public.aura_procurement_quotation_offers (tenant_id, family_id);

create table if not exists public.aura_procurement_quotation_revisions (
  id                      uuid        primary key default gen_random_uuid(),
  tenant_id               text        not null,
  offer_id                uuid        not null references public.aura_procurement_quotation_offers (id) on delete cascade,
  revision_no             integer     not null,
  -- The supplier's own name for this revision ("Rev B", "issue 2"). NULL when they gave none, and
  -- NULL on a migrated row — see `origin`.
  supplier_revision_ref   text,
  -- 'captured' | 'legacy_migration'. A migrated Rev 0 is AURA's internal marker for a quotation that
  -- predates this model; it must never read as though the supplier called it Rev 0.
  origin                  text        not null default 'captured',
  received_at             timestamptz,
  quotation_date          date,
  validity_date           date,
  -- The commercial facts. NULL is UNKNOWN throughout and never a default: whether tax sits inside or
  -- outside a price changes what the price MEANS, and a guessed currency makes offers look comparable.
  currency                text,
  tax_treatment           text,
  tax_rate_pct            numeric(9,4),
  freight_amount          numeric(18,4),
  freight_terms           text,
  payment_terms           text,
  notes                   text,
  status                  text        not null default 'draft',
  supersedes_revision_id  uuid        references public.aura_procurement_quotation_revisions (id),
  -- The document this revision was captured from, in the DMS. No FK: modules do not reach across
  -- each other, and the composition root owns that binding. NULL = captured with no source document.
  source_attachment_id    uuid,
  created_by              text,
  created_at              timestamptz not null default now(),
  constraint aura_quotation_revisions_status
    check (status in ('draft','received','confirmed','superseded','withdrawn','rejected')),
  constraint aura_quotation_revisions_origin
    check (origin in ('captured','legacy_migration')),
  constraint aura_quotation_revisions_tax_treatment
    check (tax_treatment is null or tax_treatment in ('exclusive','inclusive','exempt')),
  constraint aura_quotation_revisions_no_per_offer
    unique (tenant_id, offer_id, revision_no)
);

-- THE INVARIANT. Exactly one commercially effective revision per offer.
create unique index if not exists aura_quotation_one_confirmed_revision
  on public.aura_procurement_quotation_revisions (tenant_id, offer_id)
  where status = 'confirmed';

create index if not exists idx_aura_quotation_revisions_offer
  on public.aura_procurement_quotation_revisions (tenant_id, offer_id, revision_no desc);


-- ── Tenant isolation. Enforced by the database, not by application filters ──
ALTER TABLE public.aura_procurement_quotation_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_procurement_quotation_families FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_procurement_quotation_families;
CREATE POLICY tenant_isolation_policy ON public.aura_procurement_quotation_families
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_procurement_quotation_families TO aura_app;

ALTER TABLE public.aura_procurement_quotation_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_procurement_quotation_offers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_procurement_quotation_offers;
CREATE POLICY tenant_isolation_policy ON public.aura_procurement_quotation_offers
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_procurement_quotation_offers TO aura_app;

ALTER TABLE public.aura_procurement_quotation_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_procurement_quotation_revisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_procurement_quotation_revisions;
CREATE POLICY tenant_isolation_policy ON public.aura_procurement_quotation_revisions
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_procurement_quotation_revisions TO aura_app;

-- ── Quotation lines belong to a REVISION ────────────────────────────────────
-- Added nullable beside the existing `quotation_id`, which keeps working until the legacy fields are
-- retired in the final stage. `is_alternate` is superseded by offer.kind and is left in place for
-- the same reason.
alter table public.aura_procurement_quotation_lines
  add column if not exists revision_id          uuid references public.aura_procurement_quotation_revisions (id) on delete cascade,
  -- The supplier's own words for what they are offering, which is not always the material's name.
  add column if not exists supplier_description text,
  add column if not exists part_number          text,
  -- `deviations` already holds the supplier's TECHNICAL deviation from the specification. A
  -- commercial deviation — payment terms, part shipment, a price condition — is a different claim
  -- about a different thing, and folding them together loses which kind a buyer is looking at.
  add column if not exists commercial_deviation text;

create index if not exists idx_aura_quotation_lines_revision
  on public.aura_procurement_quotation_lines (tenant_id, revision_id)
  where revision_id is not null;

comment on column public.aura_procurement_quotation_lines.revision_id is
  'The immutable revision this line belongs to. NULL = a legacy line still keyed to quotation_id only; backfilled in the staged migration, never inferred later.';
comment on column public.aura_procurement_quotation_lines.is_alternate is
  'SUPERSEDED by aura_procurement_quotation_offers.kind. Retained until the legacy retirement step; new capture must not set it.';

-- @DOWN
drop index if exists public.idx_aura_quotation_lines_revision;
alter table public.aura_procurement_quotation_lines
  drop column if exists commercial_deviation,
  drop column if exists part_number,
  drop column if exists supplier_description,
  drop column if exists revision_id;
drop index if exists public.idx_aura_quotation_revisions_offer;
drop index if exists public.aura_quotation_one_confirmed_revision;
drop table if exists public.aura_procurement_quotation_revisions;
drop index if exists public.idx_aura_quotation_offers_family;
drop index if exists public.aura_quotation_offer_one_base;
drop table if exists public.aura_procurement_quotation_offers;
drop index if exists public.idx_aura_quotation_families_rfq;
drop index if exists public.aura_quotation_family_one_per_supplier;
drop table if exists public.aura_procurement_quotation_families;
