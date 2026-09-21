-- ============================================================
-- AURA OS — migration 0373: the site, quality and handover acts say who performed them
--                           (SEC-01 stage 3, wave D — site, quality, commissioning, engineering)
-- ------------------------------------------------------------
-- THE FIRST WAVE WITH NO SINGLE WILDCARD TO REMOVE. Waves A–C each had one over-broad grant at the
-- centre of the module; these twelve acts sit behind four different ones — `site.*` on the Site
-- Engineer, `quality.*` on QA/QC, `engineering.*` on the Technical Manager, and
-- `commissioning.handover.*` on Handover/FM — and the defects behind each are different in kind.
--
-- SITE — MEASURED AGAINST THE RUNNING API, AS ONE SITE ENGINEER:
--
--   201 POST site/daily-reports                 preparedBy  = u-e2e-site
--   200 PUT  site/daily-reports/:id/submit      submittedBy = u-e2e-site
--   201 POST site/daily-reports/:id/start-review reviewedBy = u-e2e-site
--   201 POST site/daily-reports/:id/approve     approvedBy  = u-e2e-site
--
-- One person prepared, submitted, reviewed and approved the same day's record of what happened on
-- site — the document a delay claim is later argued from. The record was BUILT for the check: four
-- separate actor columns with four separate timestamps. Nothing connected them. This is the same
-- shape as document control in wave C, and it needs no new columns here, only the rule.
--
-- Two further things in site, both of which the wildcard hid:
--   * `rejectReport` wrote `reviewedBy: actorId ?? r.reviewedBy` — the rejecter OVERWRITES whoever
--     actually performed the review, which is the fabrication wave C removed from `approveDocument`.
--   * the service asserts `site.daily_report.*` (UNDERSCORE) while the routes derive
--     `site.daily-report.*` (HYPHEN). Two vocabularies for one act, and `site.*` matches both, so
--     nothing could see it. That is the seventh occurrence of this pattern.
--
-- A SITE INSTRUCTION carries cost and time implications and its `issued_by` is FREE TEXT. Measured:
-- the string "Anyone I Like" was accepted. Acknowledging and closing it recorded nobody at all. The
-- label is kept — an instruction can genuinely come from a consultant who is not a platform user —
-- but it is now accompanied by the acting user, exactly as a transmittal keeps both `sender` (an
-- addressee label) and `sent_by` (the actor).
--
-- QUALITY — A SNAG HAD NO STATE MACHINE AT ALL. `status` is a plain column, the service assigned to
-- it in place, and there were no transition functions. Measured:
--
--   200 PUT quality/snags/:id/close    status=closed    resolvedAt=null
--   200 PUT quality/snags/:id/resolve  status=resolved            <- WENT BACKWARDS
--
-- A closed snag reopened itself into 'resolved' and nothing objected. Closing recorded no actor and
-- no timestamp; `resolved_at` was not even set by the close path.
--
-- AN ITP is the plan that says what must be inspected and witnessed. `activateItp` and `closeItp`
-- took no actor, asserted no permission in the service, and recorded nothing: the only gate was the
-- derived route name, reachable through `quality.*`. So QA/QC wrote the inspection plan, put it in
-- force and declared the inspections complete, and not one of those three acts left a name.
--
-- COMMISSIONING — THE HANDOVER PACKAGE HAD NO ACTOR COLUMNS WHATSOEVER. `submitted_at` and
-- `accepted_at` with nobody attached. `accept()` took no actor parameter at all, and the audit event
-- it emits is attributed to `next.created_by` — SO THE CLIENT'S ACCEPTANCE WAS RECORDED AGAINST
-- WHOEVER CREATED THE PACKAGE. Acceptance is the contractual close: it starts the warranty and
-- defects-liability clock. The only thing it recorded was a free-text `client_representative`.
--
-- Measured, the other half of it: `403 PUT commissioning/handovers/:id/submit` as the PROJECT
-- MANAGER — "no grant satisfies commissioning.handover.submit". `commissioning.handover.*` sits only
-- on Handover/FM, so the role that receives the handover is also the only role that can submit it.
-- ============================================================

-- ── SITE ────────────────────────────────────────────────────────────────────
alter table public.aura_site_instructions
  add column if not exists issued_by_user_id text,
  add column if not exists acknowledged_by   text,
  add column if not exists closed_by         text;

comment on column public.aura_site_instructions.issued_by_user_id is
  'The acting user. `issued_by` beside it is a free-text representative name and resolves to nobody — measured, the string "Anyone I Like" was accepted on a cost- and time-bearing instruction.';

-- ── QUALITY ─────────────────────────────────────────────────────────────────
alter table public.aura_quality_snags
  add column if not exists resolved_by text,
  add column if not exists closed_by   text,
  add column if not exists closed_at   timestamptz;

alter table public.aura_quality_itps
  add column if not exists activated_by text,
  add column if not exists activated_at timestamptz,
  add column if not exists closed_by    text,
  add column if not exists closed_at    timestamptz;

comment on column public.aura_quality_itps.closed_by is
  'Who declared the inspections complete. The act took no actor and asserted no permission in the service; its only gate was a route name reachable through `quality.*`.';

-- ── COMMISSIONING ───────────────────────────────────────────────────────────
alter table public.aura_handover_packages
  add column if not exists submitted_by text,
  add column if not exists accepted_by  text,
  add column if not exists rejected_by  text,
  add column if not exists rejected_at  timestamptz;

comment on column public.aura_handover_packages.accepted_by is
  'The user who recorded the acceptance, BESIDE `client_representative` (the named person on the client side, who need not be a platform user). Acceptance starts the warranty clock and recorded neither: the act took no actor and its audit event was attributed to created_by.';

alter table public.aura_handover_training_sessions
  add column if not exists completed_by text;

-- ── ENGINEERING ─────────────────────────────────────────────────────────────
alter table public.aura_engineering_drawings
  add column if not exists closed_by text;

-- ── INVARIANTS ──────────────────────────────────────────────────────────────
-- Each is ALL-OR-NOTHING on the pair, and each exempts history through the `… is null` branch:
-- rows written before the column existed carry neither, and inferring an actor from `created_by`
-- would manufacture exactly the self-act these exist to stop recording silently.
--
-- The `is not null` tests are written out rather than leaning on `btrim(x) <> ''`, which evaluates to
-- NULL when x is NULL — `FALSE OR NULL` is NULL, and a CHECK PASSES on NULL. That hole shipped once,
-- in 0362, and was caught only by its own test.

alter table public.aura_quality_snags
  drop constraint if exists aura_quality_snag_closed_complete;
alter table public.aura_quality_snags
  add constraint aura_quality_snag_closed_complete check (
    (closed_by is null and closed_at is null)
    or (closed_by is not null and closed_at is not null)
  );

-- A closed snag is closed. The status and the provenance cannot disagree.
alter table public.aura_quality_snags
  drop constraint if exists aura_quality_snag_closed_status;
alter table public.aura_quality_snags
  add constraint aura_quality_snag_closed_status check (
    closed_at is null or status = 'closed'
  );

alter table public.aura_quality_itps
  drop constraint if exists aura_quality_itp_activated_complete;
alter table public.aura_quality_itps
  add constraint aura_quality_itp_activated_complete check (
    (activated_by is null and activated_at is null)
    or (activated_by is not null and activated_at is not null)
  );

alter table public.aura_quality_itps
  drop constraint if exists aura_quality_itp_closed_complete;
alter table public.aura_quality_itps
  add constraint aura_quality_itp_closed_complete check (
    (closed_by is null and closed_at is null)
    or (closed_by is not null and closed_at is not null)
  );

-- AN ITP IS CLOSED ONLY AFTER IT WAS PUT IN FORCE. Closing a plan that was never activated would
-- mean declaring inspections complete for a plan nobody was working to.
alter table public.aura_quality_itps
  drop constraint if exists aura_quality_itp_close_after_activate;
alter table public.aura_quality_itps
  add constraint aura_quality_itp_close_after_activate check (
    closed_at is null or activated_at is not null or status <> 'closed'
  ) not valid;

alter table public.aura_handover_packages
  drop constraint if exists aura_handover_rejected_complete;
alter table public.aura_handover_packages
  add constraint aura_handover_rejected_complete check (
    (rejected_by is null and rejected_at is null)
    or (rejected_by is not null and rejected_at is not null)
  );

-- SUBMIT /= ACCEPT. The party that issues the handover is not the party that accepts it; that is
-- what makes acceptance mean anything. `NOT VALID`, because rows on disk predate both columns and
-- refusing them would decline to describe the history rather than correct it — and because the
-- probe that measured this defect is itself part of that history. Once the affected packages have
-- aged out:
--
--   ALTER TABLE public.aura_handover_packages VALIDATE CONSTRAINT aura_handover_submit_not_accept;
--
-- and it will refuse until that is true, which is the right moment to be told.
alter table public.aura_handover_packages
  drop constraint if exists aura_handover_submit_not_accept;
alter table public.aura_handover_packages
  add constraint aura_handover_submit_not_accept check (
    accepted_by is null or submitted_by is null or accepted_by <> submitted_by
  ) not valid;

-- THE DAILY REPORT NEEDS NO NEW COLUMNS — it already had four. It needed the rule, and here it is on
-- the row as well as in the domain: the person who prepared or submitted the day's record may not be
-- the one who approves it. `NOT VALID` for the same reason, and the violating rows are the evidence:
-- the probe that measured this produced one with all four columns equal.
alter table public.aura_site_daily_reports
  drop constraint if exists aura_site_report_preparer_not_approver;
alter table public.aura_site_daily_reports
  add constraint aura_site_report_preparer_not_approver check (
    approved_by is null
    or (approved_by is distinct from prepared_by and approved_by is distinct from submitted_by)
  ) not valid;

create index if not exists idx_aura_quality_snags_closed
  on public.aura_quality_snags (tenant_id, closed_at);
create index if not exists idx_aura_handover_packages_accepted
  on public.aura_handover_packages (tenant_id, accepted_at);

-- @DOWN
drop index if exists idx_aura_handover_packages_accepted;
drop index if exists idx_aura_quality_snags_closed;
alter table public.aura_site_daily_reports  drop constraint if exists aura_site_report_preparer_not_approver;
alter table public.aura_handover_packages   drop constraint if exists aura_handover_submit_not_accept;
alter table public.aura_handover_packages   drop constraint if exists aura_handover_rejected_complete;
alter table public.aura_quality_itps        drop constraint if exists aura_quality_itp_close_after_activate;
alter table public.aura_quality_itps        drop constraint if exists aura_quality_itp_closed_complete;
alter table public.aura_quality_itps        drop constraint if exists aura_quality_itp_activated_complete;
alter table public.aura_quality_snags       drop constraint if exists aura_quality_snag_closed_status;
alter table public.aura_quality_snags       drop constraint if exists aura_quality_snag_closed_complete;
alter table public.aura_engineering_drawings       drop column if exists closed_by;
alter table public.aura_handover_training_sessions drop column if exists completed_by;
alter table public.aura_handover_packages   drop column if exists rejected_at;
alter table public.aura_handover_packages   drop column if exists rejected_by;
alter table public.aura_handover_packages   drop column if exists accepted_by;
alter table public.aura_handover_packages   drop column if exists submitted_by;
alter table public.aura_quality_itps        drop column if exists closed_at;
alter table public.aura_quality_itps        drop column if exists closed_by;
alter table public.aura_quality_itps        drop column if exists activated_at;
alter table public.aura_quality_itps        drop column if exists activated_by;
alter table public.aura_quality_snags       drop column if exists closed_at;
alter table public.aura_quality_snags       drop column if exists closed_by;
alter table public.aura_quality_snags       drop column if exists resolved_by;
alter table public.aura_site_instructions   drop column if exists closed_by;
alter table public.aura_site_instructions   drop column if exists acknowledged_by;
alter table public.aura_site_instructions   drop column if exists issued_by_user_id;
