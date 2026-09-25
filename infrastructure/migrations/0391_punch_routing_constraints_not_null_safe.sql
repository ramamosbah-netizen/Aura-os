-- ============================================================
-- 0391 — 0389's completeness checks, made NULL-safe.
--
-- 0389 wrote `length(btrim(x)) > 0` to require a non-blank routing reason and corrective action. For a
-- NULL x that expression is NULL, and a CHECK treats NULL as a pass — so a routing with no reason, or a
-- correction with no action, would have been accepted by the very constraint written to refuse it. The
-- sibling rule in 0390 was caught by its own test before it shipped; this repairs 0389, which had
-- already been committed and must not be rewritten.
-- ============================================================

alter table public.aura_commissioning_punch_items
  drop constraint if exists aura_punch_routing_complete,
  add constraint aura_punch_routing_complete check (
    (routed_to is null and routed_by is null and routed_at is null and routing_reason is null)
    or (routed_to is not null and routed_by is not null and routed_at is not null and coalesce(length(btrim(routing_reason)), 0) > 0)
  ),
  drop constraint if exists aura_punch_correction_complete,
  add constraint aura_punch_correction_complete check (
    (corrective_action is null and corrected_by is null and corrected_at is null and correction_reference is null)
    or (coalesce(length(btrim(corrective_action)), 0) > 0 and corrected_by is not null and corrected_at is not null)
  );

-- @DOWN
alter table public.aura_commissioning_punch_items
  drop constraint if exists aura_punch_routing_complete,
  add constraint aura_punch_routing_complete check (
    (routed_to is null and routed_by is null and routed_at is null and routing_reason is null)
    or (routed_to is not null and routed_by is not null and routed_at is not null and length(btrim(routing_reason)) > 0)
  ),
  drop constraint if exists aura_punch_correction_complete,
  add constraint aura_punch_correction_complete check (
    (corrective_action is null and corrected_by is null and corrected_at is null and correction_reference is null)
    or (length(btrim(corrective_action)) > 0 and corrected_by is not null and corrected_at is not null)
  );
