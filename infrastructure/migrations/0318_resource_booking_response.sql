-- ============================================================
-- AURA OS — migration 0318: the allocated person's ANSWER to a booking.
-- ------------------------------------------------------------
-- A fifth fact, and it is kept apart from the other four for the same reason they are kept apart
-- from each other:
--
--     Demand ≠ Capacity ≠ Booking ≠ Actual ≠ RESPONSE
--
-- A response is what the person NAMED by a commitment says about it. It is not the commitment.
-- Declining does not reduce `quantity`, does not set `status='released'` and does not free a
-- single day of capacity — because the booking is the PROJECT's claim and the planner is
-- accountable for it. Letting a decline release capacity would let one person's click move a
-- number somebody else answers for, and would make the plan quietly disagree with the schedule.
--
-- What a decline does is make the disagreement VISIBLE, with a reason, exactly as a cross-project
-- capacity clash does (0288's note on the temporal invariant). The planner then resolves it the
-- same way: replace the resource, move the task, reduce the requirement, or release the booking
-- knowingly. Two people can be right at once — "we committed you on Tuesday" and "I cannot be
-- there on Tuesday" — and a schema with one field for that has to pick which truth to lose.
--
-- NO `responded_by_employee_id`: the answer is given by an ACCOUNT, and which employment record
-- that account is belongs to HR (0317). Copying the employee id here would be a second answer to
-- a question one register already owns.
--
-- The current answer is a column; the history of answers is not. A person who accepts and later
-- declines leaves the CURRENT answer here and the sequence in the audit log, which is where an
-- "and then what happened" question is asked from.
-- ============================================================

ALTER TABLE public.aura_projects_resource_bookings
  ADD COLUMN IF NOT EXISTS response        text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS response_reason text,
  ADD COLUMN IF NOT EXISTS response_at     timestamptz,
  ADD COLUMN IF NOT EXISTS response_by     text;

ALTER TABLE public.aura_projects_resource_bookings
  DROP CONSTRAINT IF EXISTS aura_projects_resource_bookings_response_check;
ALTER TABLE public.aura_projects_resource_bookings
  ADD CONSTRAINT aura_projects_resource_bookings_response_check
    CHECK (response IN ('pending', 'accepted', 'declined'));

-- A decline with no reason is indistinguishable from a mis-click, and the planner it lands on
-- cannot act on it. The database refuses one for the same reason the domain does.
ALTER TABLE public.aura_projects_resource_bookings
  DROP CONSTRAINT IF EXISTS aura_projects_resource_bookings_decline_reason_check;
ALTER TABLE public.aura_projects_resource_bookings
  ADD CONSTRAINT aura_projects_resource_bookings_decline_reason_check
    CHECK (response <> 'declined' OR btrim(coalesce(response_reason, '')) <> '');

-- An answered booking must say who answered and when; a pending one must not pretend to.
ALTER TABLE public.aura_projects_resource_bookings
  DROP CONSTRAINT IF EXISTS aura_projects_resource_bookings_response_provenance_check;
ALTER TABLE public.aura_projects_resource_bookings
  ADD CONSTRAINT aura_projects_resource_bookings_response_provenance_check
    CHECK ((response = 'pending') = (response_at IS NULL));

-- The planner's open question: which of my held commitments has the named person refused?
CREATE INDEX IF NOT EXISTS idx_aura_projects_resource_bookings_declined
  ON public.aura_projects_resource_bookings (tenant_id, project_id)
  WHERE status = 'held' AND response = 'declined';

-- @DOWN
DROP INDEX IF EXISTS public.idx_aura_projects_resource_bookings_declined;
ALTER TABLE public.aura_projects_resource_bookings
  DROP CONSTRAINT IF EXISTS aura_projects_resource_bookings_response_provenance_check;
ALTER TABLE public.aura_projects_resource_bookings
  DROP CONSTRAINT IF EXISTS aura_projects_resource_bookings_decline_reason_check;
ALTER TABLE public.aura_projects_resource_bookings
  DROP CONSTRAINT IF EXISTS aura_projects_resource_bookings_response_check;
ALTER TABLE public.aura_projects_resource_bookings
  DROP COLUMN IF EXISTS response_by,
  DROP COLUMN IF EXISTS response_at,
  DROP COLUMN IF EXISTS response_reason,
  DROP COLUMN IF EXISTS response;
