-- ============================================================
-- AURA OS — migration 0324: which working calendar governs this project.
-- ------------------------------------------------------------
-- The planning solver has counted working days since Step 8, and it has been choosing the calendar
-- by GUESSING: `listCalendars(tenantId)` ordered by name, take the first. For a company with one
-- calendar that is right by luck. For a company running Dubai and Riyadh crews — different weekends,
-- different public holidays — it silently plans a Saudi project through a UAE Friday, and nothing
-- on any screen says which calendar produced the dates. The code called this "a deliberate,
-- documented interim". It is now the thing being closed.
--
-- A project therefore NAMES its calendar. Nothing else changes about how the calendar works:
-- weekends, holidays and Ramadan adjustments still live in the kernel (`aura_working_calendars`),
-- still owned there, still consumed rather than reimplemented (Design Gate §3, §5.2 #5).
--
-- NULL MEANS NOBODY HAS SAID, AND IT IS READ AS "EVERY DAY IS WORKED" — never as a licence to pick
-- a calendar on the planner's behalf. That is the §22 rule applied to time: a guess that looks like
-- an answer is worse than a stated unknown, because nobody goes looking for it. The plan screen
-- shows an unassigned project as unassigned, which is how it gets assigned.
--
-- THE BACKFILL IS DELIBERATELY NARROW. Where a tenant has exactly ONE calendar, the old guess had
-- no alternative to be wrong about, so every project of that tenant inherits it and behaves exactly
-- as it did yesterday. Where a tenant has TWO OR MORE, the guess was never safe and is not
-- preserved: those projects come out unassigned and visibly so. Some of them will have been planned
-- against the wrong weekend all along, and the first honest step is to stop, not to keep going with
-- a number that reads as authoritative. A planner reassigns in one click.
--
-- No foreign key to `aura_working_calendars` (ADR-0004, same as every other cross-context reference
-- here): the id is checked against the kernel's calendar list at the service boundary, so a deleted
-- or foreign-tenant calendar is refused where a planner can see the refusal.
-- ============================================================

ALTER TABLE public.aura_projects_projects
  ADD COLUMN IF NOT EXISTS working_calendar_id uuid;

-- Preserve yesterday's behaviour ONLY where it was unambiguous: one calendar, nothing to guess.
UPDATE public.aura_projects_projects p
   SET working_calendar_id = sole.id
  FROM (
    SELECT tenant_id, MIN(id::text)::uuid AS id
      FROM public.aura_working_calendars
     GROUP BY tenant_id
    HAVING COUNT(*) = 1
  ) AS sole
 WHERE p.tenant_id = sole.tenant_id
   AND p.working_calendar_id IS NULL;

-- @DOWN
ALTER TABLE public.aura_projects_projects
  DROP COLUMN IF EXISTS working_calendar_id;
