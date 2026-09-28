-- 0398 — WHERE AN INBOUND WHATSAPP MESSAGE BELONGS, ANSWERED BEFORE ANY TENANT IS KNOWN.
--
-- Meta delivers a webhook with no user and no tenant: the only thing that says whose message it is
-- is `metadata.phone_number_id`, the receiving WhatsApp Business number. The service looked that up
-- in `aura_comms_accounts`, which has FORCED row-level security keyed on the request's tenant — and
-- an inbound webhook has none, so the lookup could never see a real tenant's account. Inbound
-- WhatsApp worked only where RLS did not bind.
--
-- This function answers exactly one question — which account, in which tenant, owns this phone
-- number id — and nothing else. It returns at most two rows so the caller can REFUSE an ambiguous
-- number rather than route a customer's message into whichever tenant a `limit 1` happened to pick.
-- Everything after the routing runs inside that tenant, under its own RLS.
create or replace function public.aura_route_whatsapp_account(p_external_account_id text)
returns table (
  id uuid, tenant_id text, company_id text, external_account_id text,
  owner_user_id text, display_label text, status text
)
language sql stable security definer set search_path = pg_catalog, public as $fn$
  select a.id, a.tenant_id, a.company_id, a.external_account_id, a.owner_user_id, a.display_label, a.status
    from public.aura_comms_accounts a
   where a.channel = 'whatsapp' and a.external_account_id = p_external_account_id
   order by a.id
   limit 2
$fn$;

revoke all on function public.aura_route_whatsapp_account(text) from public;
do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant execute on function public.aura_route_whatsapp_account(text) to aura_app;
  end if;
end $grant$;

-- @DOWN
drop function if exists public.aura_route_whatsapp_account(text);
