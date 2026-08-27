-- ============================================================
-- AURA OS — migration 0258: one saved view per owner, per exact route+query
-- ------------------------------------------------------------
-- `aura_saved_views` had no uniqueness beyond its primary key, so the same user could accumulate
-- unlimited rows for the identical route and querystring. That was tolerable while a saved view was
-- only ever created by an explicit "Save view" prompt; it is not, now that the same rows back a
-- FAVOURITE toggle, where a duplicate means the toggle can never turn itself off.
--
-- WHAT THIS CONSTRAINT ACTUALLY PROMISES — read this before relying on it:
--
--   EXACT-STRING uniqueness, NOT semantic uniqueness.
--
-- `?a=1&b=2` and `?b=2&a=1` describe the same view to a human and remain two different rows here,
-- because nothing in this system canonicalises a querystring. Claiming semantic uniqueness would be
-- claiming a normalisation that does not exist. If canonicalisation is added later, this index keeps
-- working and simply starts catching more.
--
-- TENANT-WIDE ROWS ARE DELIBERATELY OUT OF SCOPE. Postgres treats NULLs as distinct in a unique
-- index, so rows with `user_id IS NULL` (shared views) are not constrained by this. That matches how
-- they are governed: a shared view is not owned by the person looking at it, and the service refuses
-- to delete one at all. Constraining them is a separate decision about shared state.
-- ============================================================

-- ── Deterministic dedupe, BEFORE the index can be created ────────────────────────────────────────
-- The rule is stated, not incidental: KEEP THE OLDEST row of each duplicate group (earliest
-- created_at, with `id` breaking a tie so the outcome is identical on every run and on every
-- replica). The oldest is the one the user actually created first; later rows are the accidents this
-- constraint exists to prevent. `id` as the tie-break matters — without it two rows sharing a
-- timestamp would make the survivor arbitrary.
delete from public.aura_saved_views v
where v.user_id is not null
  and exists (
    select 1
      from public.aura_saved_views keep
     where keep.tenant_id = v.tenant_id
       and keep.user_id   = v.user_id
       and keep.path      = v.path
       and keep.query     = v.query
       and (keep.created_at, keep.id) < (v.created_at, v.id)
  );

-- ── The constraint itself ────────────────────────────────────────────────────────────────────────
-- Partial: only owned rows. See the note above on why shared rows are excluded rather than forgotten.
drop index if exists idx_aura_saved_views_owner_unique;
create unique index idx_aura_saved_views_owner_unique
  on public.aura_saved_views (tenant_id, user_id, path, query)
  where user_id is not null;

comment on index public.idx_aura_saved_views_owner_unique is
  'One saved view per owner per EXACT route+query. Exact-string, not semantic: querystrings are not canonicalised, so ?a=1&b=2 and ?b=2&a=1 remain distinct. Shared views (user_id IS NULL) are excluded — deleting those is a governed action, not a personal one.';

-- Ownership is now part of every read: the API returns shared views plus the caller's own, so this
-- index is also the lookup path for the favourite toggle's exact-match check.
create index if not exists idx_aura_saved_views_owner
  on public.aura_saved_views (tenant_id, user_id);

-- @DOWN
drop index if exists idx_aura_saved_views_owner;
drop index if exists idx_aura_saved_views_owner_unique;
