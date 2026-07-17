-- ============================================================
-- AURA OS — migration 0181: backfill the account_name snapshot
-- ------------------------------------------------------------
-- The deal chain carries the account as `account_id` + `account_name` (reference + snapshot).
-- Until now the create routes trusted the caller for the name, but every caller (the UI and the
-- API) posts only the id it picked from a list — so rows written before the fix carry a null
-- snapshot, and readers that trust it render a raw UUID. C6's concentration table found this;
-- the create/PATCH routes now resolve the name, which fixes NEW rows only. This repairs the old
-- ones, so readers can stop defending against the gap.
--
-- Data-only and idempotent: guarded on `account_name is null and account_id is not null`, so a
-- re-run is a no-op and a legitimately-supplied snapshot is never overwritten.
--
-- On the reconstruction: what the account was called AT THE TIME is not recoverable — it was
-- never written. The account's current name is the best available answer and is the same value
-- the C6 reader already falls back to, so this migration only makes the stored data agree with
-- what the app already displays.
--
-- On the cross-module read: modules deliberately hold no FK to the CRM table and never join it
-- at runtime (0006/0007/0008). This is a one-time data correction at the infrastructure layer,
-- not a standing join — it introduces no coupling the modules can depend on.
--
-- The join casts `accounts.id` (uuid) to text rather than `account_id` (text) to uuid: the safe
-- direction, since a non-uuid value in `account_id` would make the reverse cast throw. It is
-- also scoped by tenant_id — an id must never resolve to another tenant's account name.
-- ============================================================

-- 0163 put FORCE ROW LEVEL SECURITY + a fail-closed tenant policy on every table touched here,
-- and this migration sets no tenant GUC. A role that does not bypass RLS would therefore match
-- ZERO rows in every statement below and still COMMIT — a silent no-op that looks like success
-- while leaving the snapshot broken, which is exactly what would make us wrongly trust the data
-- and drop the defensive fallbacks. Migrations always run as the owning/admin role (`migrate.mjs`
-- uses the admin DATABASE_URL; `aura_app` holds no DDL grant and could not have applied 0163 in
-- the first place), so this only fires if that ever stops being true. Fail loudly instead.
do $$
declare
  bypasses boolean;
begin
  select rolsuper or rolbypassrls into bypasses from pg_roles where rolname = current_user;
  if not coalesce(bypasses, false) then
    raise exception
      'migration 0181 must run as a role that bypasses RLS; current role "%" is subject to the '
      'FORCEd tenant policy (0163) and would silently backfill nothing.', current_user;
  end if;
end $$;

update public.aura_crm_opportunities o
   set account_name = a.name
  from public.aura_crm_accounts a
 where o.account_name is null
   and o.account_id is not null
   and a.id::text = o.account_id
   and a.tenant_id = o.tenant_id;

update public.aura_crm_contacts c
   set account_name = a.name
  from public.aura_crm_accounts a
 where c.account_name is null
   and c.account_id is not null
   and a.id::text = c.account_id
   and a.tenant_id = c.tenant_id;

update public.aura_tendering_tenders t
   set account_name = a.name
  from public.aura_crm_accounts a
 where t.account_name is null
   and t.account_id is not null
   and a.id::text = t.account_id
   and a.tenant_id = t.tenant_id;

update public.aura_contracts_contracts ct
   set account_name = a.name
  from public.aura_crm_accounts a
 where ct.account_name is null
   and ct.account_id is not null
   and a.id::text = ct.account_id
   and a.tenant_id = ct.tenant_id;

update public.aura_projects_projects p
   set account_name = a.name
  from public.aura_crm_accounts a
 where p.account_name is null
   and p.account_id is not null
   and a.id::text = p.account_id
   and a.tenant_id = p.tenant_id;

-- @DOWN
-- Intentionally a no-op. This migration only filled snapshots that were null, but nothing
-- distinguishes a backfilled name from one a caller supplied, so blanking them on revert would
-- destroy real data to undo a repair. Reverting the deploy leaves the names in place: they are
-- correct, and the pre-fix readers tolerated a present name — that was never the broken case.
select 1;
