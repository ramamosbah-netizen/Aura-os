-- Tender quantity take-off → BOQ provenance.
-- The approved CRM pre-award basis remains the governed quantity revision; Tender BOQ is its
-- commercial projection. Cross-module ids are TEXT by the established 0244 boundary rule and are
-- resolved by application commands against the Tender-owned package.

alter table public.aura_tendering_boqs
  add column if not exists source_basis_revision_id text,
  add column if not exists source_revision_ref text,
  add column if not exists projected_by text,
  add column if not exists projected_at timestamptz;

alter table public.aura_tendering_boq_items
  add column if not exists source_basis_line_id text;

create index if not exists idx_tendering_boq_basis
  on public.aura_tendering_boqs (tenant_id, source_basis_revision_id)
  where source_basis_revision_id is not null;

create index if not exists idx_tendering_boq_item_basis_line
  on public.aura_tendering_boq_items (tenant_id, source_basis_line_id)
  where source_basis_line_id is not null;

-- @DOWN
drop index if exists public.idx_tendering_boq_item_basis_line;
drop index if exists public.idx_tendering_boq_basis;
alter table public.aura_tendering_boq_items drop column if exists source_basis_line_id;
alter table public.aura_tendering_boqs
  drop column if exists projected_at,
  drop column if exists projected_by,
  drop column if exists source_revision_ref,
  drop column if exists source_basis_revision_id;
