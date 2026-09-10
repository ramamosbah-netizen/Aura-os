-- ============================================================
-- AURA OS — migration 0290: §22 / AURA-PM-004 step 3 — a booking's task reference becomes real
-- ------------------------------------------------------------
-- Migration 0288 recorded `aura_projects_resource_bookings.task_id` / `.schedule_id` as ADDRESSES
-- with no foreign key, and said why plainly: the schedule store rewrote every task row on every save
-- (delete-all-then-reinsert), so a task's IDENTITY survived a save but its ROW's lifetime did not.
-- Any foreign key onto a task from outside the aggregate had to choose between CASCADE (destroy a
-- commitment as a side effect of a plan edit) and RESTRICT (refuse every schedule save), and neither
-- is acceptable. That was a STATED non-guarantee, not an oversight.
--
-- AURA-PM-004 step 2 removed the cause: `writeTasks` now DIFFS the task rows — a surviving task is
-- upserted in place, keeping its row — so a foreign key onto it is finally safe. This migration adds
-- it. The reference is no longer an address that may quietly stop resolving; it is enforced.
--
-- ON DELETE RESTRICT is the correct governance, and the point of the whole change: a task with a
-- resource still committed to it cannot be removed from the plan until the booking is released. The
-- store translates the refusal into a clear domain error. NULL task_id / schedule_id (a directly made
-- booking, not tied to a scheduled task) is unaffected — MATCH SIMPLE does not enforce a partially
-- null key, which is exactly right: such a booking references no task to protect.
-- ============================================================

ALTER TABLE public.aura_projects_resource_bookings
  DROP CONSTRAINT IF EXISTS aura_projects_resource_bookings_task_fkey;

ALTER TABLE public.aura_projects_resource_bookings
  ADD CONSTRAINT aura_projects_resource_bookings_task_fkey
    FOREIGN KEY (tenant_id, project_id, schedule_id, task_id)
    REFERENCES public.aura_projects_schedule_tasks (tenant_id, project_id, schedule_id, id)
    ON DELETE RESTRICT;

-- @DOWN
-- Reverting drops the enforced reference and returns the task pointer to an unguarded address.
ALTER TABLE public.aura_projects_resource_bookings
  DROP CONSTRAINT IF EXISTS aura_projects_resource_bookings_task_fkey;
