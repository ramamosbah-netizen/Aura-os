-- ============================================================
-- AURA OS — migration 0257: least-privilege P&L rebuild + history reconciliation
-- ------------------------------------------------------------
-- The API runs as `aura_app`, which correctly has DML but not TRUNCATE privilege. Projection V1
-- attempted a table-wide TRUNCATE during replay and therefore failed every first boot/rebuild under
-- the production role split. Expose one fixed-purpose SECURITY DEFINER operation instead of giving
-- the application broad table-owner privileges.
--
-- A previously shipped win-probability migration was renamed from 0251 to 0252. Databases that saw
-- both names contain a redundant legacy ledger row. Remove that row only when the canonical 0252
-- ledger entry is present; otherwise leave it visible so the fail-closed migration gate catches it.
-- ============================================================

create or replace function public.reset_finance_pl_projection()
returns void
language sql
security definer
set search_path = pg_catalog, public
as $function$
  truncate table public.aura_finance_pl_projection;
$function$;

revoke all on function public.reset_finance_pl_projection() from public;

do $block$
begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant execute on function public.reset_finance_pl_projection() to aura_app;
  end if;
end
$block$;

delete from public.aura_migrations
 where filename = '0251_crm_opportunity_win_probability_range.sql'
   and exists (
     select 1
       from public.aura_migrations
      where filename = '0252_crm_opportunity_win_probability_range.sql'
   );

-- @DOWN
drop function if exists public.reset_finance_pl_projection();
