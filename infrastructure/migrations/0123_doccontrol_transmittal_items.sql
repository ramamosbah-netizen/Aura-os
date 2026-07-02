-- ============================================================
-- AURA OS — migration 0123: doc-control transmittal items
-- ------------------------------------------------------------
-- Transmittal ↔ drawing-register linkage: one row per document conveyed by a
-- transmittal, snapshotting the document number/title and the revision conveyed.
-- A register entry's revision history is the trail of these items.
-- ============================================================

create table if not exists public.aura_doccontrol_transmittal_items (
  id                uuid primary key,
  tenant_id         text not null,
  company_id        text,
  transmittal_id    uuid not null,
  register_entry_id uuid not null,
  document_number   text not null,
  title             text not null,
  revision          text not null,
  purpose           text not null default 'for_information',
  created_at        timestamptz not null default now()
);

create index if not exists idx_transmittal_items_tenant      on public.aura_doccontrol_transmittal_items (tenant_id);
create index if not exists idx_transmittal_items_transmittal on public.aura_doccontrol_transmittal_items (transmittal_id);
create index if not exists idx_transmittal_items_register    on public.aura_doccontrol_transmittal_items (register_entry_id);

alter table public.aura_doccontrol_transmittal_items enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_doccontrol_transmittal_items' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_doccontrol_transmittal_items
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;
