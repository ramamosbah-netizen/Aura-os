-- ============================================================
-- AURA OS — migration 0407: an enquiry names the suppliers it is sent to (BUY-03).
-- ------------------------------------------------------------
-- "Send to vendors" moved an RFQ from draft to sent and recorded who pressed it — and nothing about
-- WHICH vendors. An RFQ could be sent to nobody, and once quotations arrived there was no way to say
-- who had been asked and had not answered, or whether a quotation came from someone never asked.
--
-- An invitation is the fact that one supplier from the master was asked to quote on one RFQ:
--   · it names the supplier canonically (supplier_id) with the name as it stood when invited — a
--     snapshot, so the enquiry document says what was sent even if the master is renamed later;
--   · it is written while the RFQ is a draft and removed only while it is a draft: once the enquiry
--     has gone out, who it went to is history, not a setting;
--   · sending refuses an RFQ with no invitation (the service), so "sent" always means "sent to
--     somebody named here".
-- ============================================================

create table if not exists public.aura_procurement_rfq_invitations (
  id            uuid        primary key,
  tenant_id     text        not null,
  rfq_id        uuid        not null references public.aura_procurement_rfqs(id) on delete cascade,
  supplier_id   text        not null,
  supplier_name text        not null,
  invited_by    text,
  invited_at    timestamptz not null default now(),
  constraint chk_aura_rfq_invitation_supplier check (length(btrim(coalesce(supplier_id, ''))) > 0),
  constraint chk_aura_rfq_invitation_name check (length(btrim(coalesce(supplier_name, ''))) > 0)
);

-- One supplier is asked once per enquiry.
create unique index if not exists uq_aura_rfq_invitations
  on public.aura_procurement_rfq_invitations (tenant_id, rfq_id, supplier_id);

alter table public.aura_procurement_rfq_invitations enable row level security;
alter table public.aura_procurement_rfq_invitations force row level security;
drop policy if exists tenant_isolation on public.aura_procurement_rfq_invitations;
create policy tenant_isolation on public.aura_procurement_rfq_invitations
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- Written and, while the RFQ is a draft, withdrawn — never rewritten to name someone else.
do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant select, insert, delete on public.aura_procurement_rfq_invitations to aura_app;
  end if;
end $grant$;

-- @DOWN
drop table if exists public.aura_procurement_rfq_invitations;
