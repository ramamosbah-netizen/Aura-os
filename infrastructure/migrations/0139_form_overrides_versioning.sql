-- ============================================================
-- AURA OS — migration 0139: Form Designer P2 — draft/publish channels
-- ------------------------------------------------------------
-- The `overrides` column stays the PUBLISHED patch (renderer +
-- assertFormValid keep reading it unchanged). The designer edits
-- `draft`; POST admin/forms/:id/publish promotes draft→overrides,
-- bumps `version`, stamps `published_at` (audited). NULL draft =
-- nothing unpublished. Existing rows become published v1.
-- ============================================================

alter table public.aura_form_overrides
  add column if not exists draft        jsonb,
  add column if not exists version      integer     not null default 1,
  add column if not exists published_at timestamptz;

-- @DOWN
alter table public.aura_form_overrides
  drop column if exists draft,
  drop column if exists version,
  drop column if exists published_at;
