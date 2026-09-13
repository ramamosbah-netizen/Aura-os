-- ============================================================
-- 0307 — Repair role permission patterns that can never match
--
-- The permission taxonomy the guard derives is THREE segments: `module.entity.action`
-- (`derivePermissionFromRoute`, applied to every handler without an explicit @Permissions).
-- `permissionMatches` compares segment by segment and requires equal length unless the pattern
-- ends in `*`. So a two-segment pattern such as `site.read` matches only a literal permission
-- `site.read` — which no route produces. It is not a narrow grant; it grants nothing.
--
-- Six of them shipped in the default role set, across ALL FOUR delivery roles that project
-- membership assigns (r-pm, r-site-engineer, r-qa-qc, r-hse) plus r-procurement. A user added to a
-- project therefore held a role authorising no cross-module read, and every attempt was a 403 that
-- looked like a scoping fault rather than a typo in a role.
--
-- WHY A MIGRATION AND NOT JUST THE CODE FIX: roles are PERSISTED here, and `seedStandardRoles()`
-- registers a default role only "if not registered". Correcting the source therefore repairs a
-- fresh database and silently leaves every existing one broken — precisely the class of silent
-- no-op TC-GATE-21 was about. The code fix and this migration are two halves of one change.
--
-- IDEMPOTENT: rewriting an already-correct array is a no-op, because the search patterns no longer
-- appear in it. Safe to re-run.
-- ============================================================

begin;

-- The repair, as data rather than as six near-identical statements: each dead pattern and the
-- three-segment form that means what it was trying to say.
create temporary table _perm_repairs (dead text primary key, live text not null) on commit drop;
insert into _perm_repairs (dead, live) values
  ('site.read',         'site.*.read'),
  ('quality.read',      'quality.*.read'),
  ('hse.read',          'hse.*.read'),
  ('engineering.read',  'engineering.*.read'),
  ('doccontrol.read',   'doccontrol.*.read'),
  ('inventory.read',    'inventory.*.read');

-- How many role rows carry at least one dead pattern, BEFORE the repair. Captured so the check at
-- the end can tell "there was nothing to fix" apart from "the fix did not run".
create temporary table _perm_before on commit drop as
select r.id
from public.aura_access_roles r
where exists (
  select 1 from jsonb_array_elements_text(r.permissions) p(v)
  join _perm_repairs x on x.dead = p.v
);

update public.aura_access_roles r
set permissions = (
      select jsonb_agg(distinct coalesce(x.live, p.v))
      from jsonb_array_elements_text(r.permissions) p(v)
      left join _perm_repairs x on x.dead = p.v
    ),
    updated_at = now()
where r.id in (select id from _perm_before);

-- ── The check that makes this loud instead of silent ────────────────────────────────────────────
-- Two failures are possible and they are different things:
--   1. rows needed repair and are still broken  → the UPDATE did not do its job. Fail.
--   2. no rows needed repair                    → already correct, or a fresh database. Fine.
-- A migration that reports success while leaving the defect in place is worse than one that stops.
do $$
declare
  needed  int;
  remaining int;
begin
  select count(*) into needed from _perm_before;

  select count(*) into remaining
  from public.aura_access_roles r
  where exists (
    select 1 from jsonb_array_elements_text(r.permissions) p(v)
    join _perm_repairs x on x.dead = p.v
  );

  if remaining > 0 then
    raise exception
      '0307: % role(s) still carry a permission pattern that can never match (% needed repair). The update did not apply.',
      remaining, needed;
  end if;

  raise notice '0307: repaired % role(s) carrying dead permission patterns.', needed;
end $$;

commit;

-- @DOWN
-- Reverses the substitution, which means putting back patterns that match nothing. That is what
-- rolling this back HONESTLY is: the roles return to granting no cross-module read, and project
-- members are locked out of their own projects again. It is written out rather than left as a
-- no-op so a rollback is a real reversal and not a quiet half-step — but there is no reason to run
-- it except to reproduce the defect.
update public.aura_access_roles r
set permissions = (
      select jsonb_agg(distinct case p.v
        when 'site.*.read'        then 'site.read'
        when 'quality.*.read'     then 'quality.read'
        when 'hse.*.read'         then 'hse.read'
        when 'engineering.*.read' then 'engineering.read'
        when 'doccontrol.*.read'  then 'doccontrol.read'
        when 'inventory.*.read'   then 'inventory.read'
        else p.v end)
      from jsonb_array_elements_text(r.permissions) p(v)
    ),
    updated_at = now()
where r.id in ('r-pm', 'r-site-engineer', 'r-qa-qc', 'r-hse', 'r-procurement');
