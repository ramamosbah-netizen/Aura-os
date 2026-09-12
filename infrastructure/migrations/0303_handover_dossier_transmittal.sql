-- ============================================================
-- AURA OS — migration 0303: the dossier issue carries its transmittal (TC-GATE-14)
-- ------------------------------------------------------------
-- WHAT THE MANIFEST COULD NOT SAY.
--
-- TC-GATE-7 captured, at submission, exactly what a handover package was sending. That answers "what
-- did we send?" It does not answer "did they get it?" — and those are different questions, asked by
-- different people, and the second is the one a dispute turns on. "We never received the O&M
-- manuals" is not refuted by our own record of having listed them.
--
-- Document control already models the answer: a transmittal has a recipient, a sent date, and an
-- acknowledgement with who and when. Handover now asks DocControl to open one for the controlled
-- documents its dossier cites, and this column records which one, so an issued manifest and the
-- conveyance that carried it are the same fact rather than two.
--
-- A REFERENCE, NOT A COPY, like every other cross-domain pointer in this module: the transmittal's
-- code, recipient, status and acknowledgement all stay in DocControl and are read from there.
--
-- NULLABLE, AND OFTEN NULL ON PURPOSE. Three cases produce a null, and none of them is a failure:
--
--   * the issue predates this migration — no backfill could invent a conveyance that never happened;
--   * document control could not be read, so the manifest was captured without one (an unwired port
--     must block proof, never work);
--   * the dossier cited nothing that IS a controlled document — a package of evidence packs and
--     training records with no registered documents has nothing for a transmittal to carry.
--
-- WRITTEN AT INSERT, NEVER AFTERWARDS. The table has no UPDATE policy (migration 0300) and does not
-- gain one here: an issued manifest is a record of what was sent, and that includes how. The service
-- opens the transmittal BEFORE capturing the manifest so the id exists when the rows are written.
-- ============================================================

ALTER TABLE public.aura_handover_dossier_items
  ADD COLUMN IF NOT EXISTS transmittal_id text;

COMMENT ON COLUMN public.aura_handover_dossier_items.transmittal_id IS
  'The DocControl transmittal that conveyed this issue. A reference, never a copy; null when none was opened.';

-- @DOWN
ALTER TABLE public.aura_handover_dossier_items DROP COLUMN IF EXISTS transmittal_id;
