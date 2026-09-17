-- ============================================================
-- AURA OS — migration 0351: retire quotation_lines.is_alternate (QC-01)
-- ------------------------------------------------------------
-- Superseded by `aura_procurement_quotation_offers.kind`. An alternative is a property of the OFFER,
-- not of a line: a supplier offering a Bosch equivalent beside a Hikvision one is making two offers,
-- and a per-line flag could not express that at all — a line is unique per requisition line per
-- revision, so the second variant had nowhere to go.
--
-- SAFE TO DROP, established rather than assumed: nothing outside `modules/procurement`'s own domain
-- guard, its store and its tests ever read this column. No API surface returns it, no screen renders
-- it, and no capture route has ever set it since offers became first-class.
--
-- `quotation_id` is NOT retired here despite being the other half of the legacy pair. SUP-01's
-- technical-evaluation surfaces still read lines by quotation, and dropping the column would break a
-- capability that is CLOSED / VERIFIED. Moving those reads onto revisions is its own piece of work
-- with its own proof, and doing it quietly inside a migration called "retirement" would be exactly
-- the kind of silent change this programme keeps refusing.
-- ============================================================

alter table public.aura_procurement_quotation_lines
  drop column if exists is_alternate;

-- @DOWN
-- Restored WITHOUT its old default-bearing data: every row that carried `true` did so under a model
-- that no longer exists, and inventing a value for them on the way back would be a fiction.
alter table public.aura_procurement_quotation_lines
  add column if not exists is_alternate boolean not null default false;
