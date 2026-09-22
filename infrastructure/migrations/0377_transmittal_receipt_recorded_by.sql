-- ============================================================
-- AURA OS — migration 0377: a receipt the Document Controller RECORDS
--                           (HO-ACK-01 — doccontrol)
-- ------------------------------------------------------------
-- §22 made only a named recipient able to acknowledge a transmittal, for a reason that was
-- right: "a receipt signed by somebody who was never sent the document is not a receipt; it is a
-- second person's opinion that it probably arrived."
--
-- It also made the acknowledgement unreachable for the party a handover dossier is actually sent
-- to. Two rules met and left nothing between them:
--
--   the domain    only a NAMED RECIPIENT may acknowledge
--   the route     `doccontrol.transmittal.acknowledge`, held by r-document-controller ALONE —
--                 a tenant role, which project membership cannot grant
--
-- So the only identity that could acknowledge was a Document Controller who was also on the
-- distribution. An EXTERNAL CLIENT could not acknowledge at all.
--
-- ------------------------------------------------------------
-- THE ENG-04 SHAPE, chosen deliberately.
--
-- ENG-04 settled the same question for a material approval: the decision belongs to a consultant
-- or engineer of record who is external and for whom this system holds no identity, so
-- `reviewedBy` is the AURA user who RECORDED the decision, the screen says "decision recorded by"
-- rather than "decided by", and NO INTERNAL USER IS CREDITED WITH AN EXTERNAL DECISION.
--
-- A transmittal receipt is the same act. The client confirms by email, by signed copy, by return
-- transmittal — outside AURA — and the Document Controller enters it. So the record has to hold
-- BOTH names and never conflate them:
--
--   acknowledged_by / user_id   WHOSE receipt this is — the named recipient on the distribution
--   *_recorded_by               WHO ENTERED IT — the Document Controller, and nobody is credited
--                               with an acknowledgement they did not give
--
-- §22's concern survives intact and is in fact better served: a receipt still cannot be recorded
-- for somebody who was never sent the document, because the recipient must be on the
-- distribution; and partial receipt is still not receipt, because the transmittal advances only
-- when every named recipient has answered.
--
-- NULLABLE and not backfilled. Existing receipts were made under the old rule, where the
-- acknowledger WAS the actor; writing a recorder into them would invent a fact. A null recorder
-- reads as "recorded by the recipient themselves", which is what those rows mean.
-- ============================================================

alter table public.aura_doccontrol_transmittal_recipients
  add column if not exists acknowledgement_recorded_by text;

comment on column public.aura_doccontrol_transmittal_recipients.acknowledgement_recorded_by is
  'The AURA user who ENTERED this receipt, when it arrived by other means. Null means the recipient answered in AURA themselves. Never conflated with user_id, whose receipt it is.';

alter table public.aura_doccontrol_transmittal_acks
  add column if not exists recorded_by text;

comment on column public.aura_doccontrol_transmittal_acks.recorded_by is
  'The AURA user who entered this acknowledgement. `acknowledged_by` stays the party whose receipt it is — no internal user is credited with an external acknowledgement.';

-- @DOWN
alter table public.aura_doccontrol_transmittal_acks drop column if exists recorded_by;
alter table public.aura_doccontrol_transmittal_recipients drop column if exists acknowledgement_recorded_by;
