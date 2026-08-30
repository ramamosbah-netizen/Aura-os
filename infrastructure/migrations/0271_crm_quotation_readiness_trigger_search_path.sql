-- AURA OS — migration 0271: harden the quotation readiness trigger function
--
-- Supabase's security advisor flagged the corrective trigger as search_path-mutable. Keep the
-- function deterministic even if a caller changes its session search_path.

create or replace function public.crm_quotation_default_readiness_mode()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.approval_readiness_mode is null then
    new.approval_readiness_mode := 'governed';
  end if;
  return new;
end;
$$;

-- @DOWN
-- The hardened definition is intentionally retained on rollback: removing the search_path
-- hardening would reintroduce the security finding while leaving the readiness contract active.
