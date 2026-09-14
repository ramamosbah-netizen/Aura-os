-- ============================================================
-- 0310 — Canonical ELV/MEP role identifiers
--
-- AURA previously booted two different "standard" role catalogs: AccessService used r-prefixed
-- ids while the API seeder registered a second set such as salesManager and projectManager.
-- Administrators therefore saw duplicate roles and a grant's behavior depended on which duplicate
-- was selected. The application now has one catalog in @aura/core. This migration carries existing
-- grants to those canonical ids before removing only the known legacy seeded rows.
-- ============================================================

begin;

create temporary table _elv_role_aliases (
  legacy text primary key,
  canonical text not null unique,
  display_name text not null
) on commit drop;

insert into _elv_role_aliases (legacy, canonical, display_name) values
  ('sales',          'r-sales',          'Sales'),
  ('salesManager',   'r-sales-manager',  'Sales Manager'),
  ('projectManager', 'r-pm',             'Project Manager'),
  ('siteEngineer',   'r-site-engineer',  'Site Engineer'),
  ('qaqc',           'r-qa-qc',          'QA / QC'),
  ('hse',            'r-hse',            'HSE'),
  ('procurement',    'r-procurement',    'Buyer'),
  ('store',          'r-store',          'Storekeeper'),
  ('finance',        'r-finance',        'Finance'),
  ('admin',          'r-admin',          'System Administrator'),
  ('client',         'r-client',         'Client (external)');

-- Move each old grant first. If the same canonical grant already exists, preserve that row and
-- its approval attributes; it is the explicit newer assignment.
insert into public.aura_access_grants
  (user_id, role_id, scope_key, scope, attributes, updated_at)
select g.user_id, a.canonical, g.scope_key, g.scope, g.attributes, g.updated_at
from public.aura_access_grants g
join _elv_role_aliases a on a.legacy = g.role_id
on conflict (user_id, role_id, scope_key) do nothing;

delete from public.aura_access_grants g
using _elv_role_aliases a
where g.role_id = a.legacy;

delete from public.aura_access_roles r
using _elv_role_aliases a
where r.id = a.legacy;

do $$
declare remaining int;
begin
  select count(*) into remaining
  from public.aura_access_grants g
  where g.role_id in (
    'sales', 'salesManager', 'projectManager', 'siteEngineer', 'qaqc', 'hse',
    'procurement', 'store', 'finance', 'admin', 'client'
  );
  if remaining <> 0 then
    raise exception '0310: % legacy standard-role grant(s) remain after canonicalisation', remaining;
  end if;
end $$;

commit;

-- @DOWN
-- Restore compatibility aliases without removing canonical roles or grants created after this
-- migration. A destructive reverse mapping could erase a legitimate canonical assignment.
insert into public.aura_access_roles (id, name, permissions, updated_at)
select v.legacy, v.display_name, coalesce(r.permissions, '[]'::jsonb), now()
from (values
  ('sales', 'r-sales', 'Sales'),
  ('salesManager', 'r-sales-manager', 'Sales Manager'),
  ('projectManager', 'r-pm', 'Project Manager'),
  ('siteEngineer', 'r-site-engineer', 'Site Engineer'),
  ('qaqc', 'r-qa-qc', 'QA / QC'),
  ('hse', 'r-hse', 'HSE'),
  ('procurement', 'r-procurement', 'Buyer'),
  ('store', 'r-store', 'Storekeeper'),
  ('finance', 'r-finance', 'Finance'),
  ('admin', 'r-admin', 'System Administrator'),
  ('client', 'r-client', 'Client (external)')
) as v(legacy, canonical, display_name)
left join public.aura_access_roles r on r.id = v.canonical
on conflict (id) do nothing;

insert into public.aura_access_grants
  (user_id, role_id, scope_key, scope, attributes, updated_at)
select g.user_id, v.legacy, g.scope_key, g.scope, g.attributes, g.updated_at
from public.aura_access_grants g
join (values
  ('sales', 'r-sales'), ('salesManager', 'r-sales-manager'), ('projectManager', 'r-pm'),
  ('siteEngineer', 'r-site-engineer'), ('qaqc', 'r-qa-qc'), ('hse', 'r-hse'),
  ('procurement', 'r-procurement'), ('store', 'r-store'), ('finance', 'r-finance'),
  ('admin', 'r-admin'), ('client', 'r-client')
) as v(legacy, canonical) on g.role_id = v.canonical
on conflict (user_id, role_id, scope_key) do nothing;
