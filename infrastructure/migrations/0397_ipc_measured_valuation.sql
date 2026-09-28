-- ============================================================
-- AURA OS — migration 0397: an IPC on an awarded contract is valued by its measured lines
-- ------------------------------------------------------------
-- J5-02, on the owner's decision of 2026-09-28: when a payment certificate has measured lines, the
-- LINES set its value — cumulative work done = Σ certified quantity × the frozen awarded unit rate.
-- The QS enters quantities; the unit and the rate come from the award. A typed cumulative gross
-- remains only for a contract whose project carries no frozen item rates.
--
--   aura_contracts_payment_certificates.valuation
--       'measured' (valued by its lines) or 'typed' (valued by the figure the QS entered)
--   aura_contracts_payment_certificates.previous_work_done
--       the cumulative work done certified before this certificate — what its lines add to
--   aura_contracts_ipc_lines.frozen_item_key
--       the frozen award item the line claims (null on lines entered before this migration)
--
-- A line may only be added to a DRAFT certificate: once submitted, what it values is under review,
-- and once certified it has posted its quantities to the ledger. The service refuses it; the
-- trigger below is the last word.
-- ============================================================

alter table public.aura_contracts_payment_certificates
  add column if not exists valuation text not null default 'typed',
  add column if not exists previous_work_done numeric(18,2) not null default 0;

alter table public.aura_contracts_payment_certificates
  drop constraint if exists aura_contracts_ipc_valuation_chk;
alter table public.aura_contracts_payment_certificates
  add constraint aura_contracts_ipc_valuation_chk check (valuation in ('typed', 'measured'));

alter table public.aura_contracts_ipc_lines
  add column if not exists frozen_item_key text;

create or replace function public.aura_contracts_ipc_line_requires_draft() returns trigger
language plpgsql as $$
declare
  cert_status text;
begin
  select status into cert_status
    from public.aura_contracts_payment_certificates
   where id::text = new.certificate_id and tenant_id = new.tenant_id;
  if cert_status is null then
    raise exception 'payment certificate % not found for this line', new.certificate_id;
  end if;
  if cert_status <> 'draft' then
    raise exception 'a valuation line can only be added to a draft certificate (certificate % is %)', new.certificate_id, cert_status;
  end if;
  return new;
end $$;

drop trigger if exists aura_contracts_ipc_line_requires_draft on public.aura_contracts_ipc_lines;
create trigger aura_contracts_ipc_line_requires_draft
  before insert on public.aura_contracts_ipc_lines
  for each row execute function public.aura_contracts_ipc_line_requires_draft();

-- @DOWN
drop trigger if exists aura_contracts_ipc_line_requires_draft on public.aura_contracts_ipc_lines;
drop function if exists public.aura_contracts_ipc_line_requires_draft();
alter table public.aura_contracts_ipc_lines drop column if exists frozen_item_key;
alter table public.aura_contracts_payment_certificates drop constraint if exists aura_contracts_ipc_valuation_chk;
alter table public.aura_contracts_payment_certificates
  drop column if exists previous_work_done,
  drop column if exists valuation;
