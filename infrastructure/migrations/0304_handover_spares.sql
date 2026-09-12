-- ============================================================
-- AURA OS — migration 0304: spares handed to the client (TC-GATE-16)
-- ------------------------------------------------------------
-- THE LAST ASSERTION.
--
-- TC-GATE-4 turned handover readiness from six ticks into a projection and left four items as
-- assertions, each labelled "nothing verifies this" because no authority existed to derive it from.
-- TC-GATE-5 built two (O&M, training). TC-GATE-6 derived a third (warranty certificates) from an
-- authority that already existed and was simply never read. **Spares is the one that was left**, and
-- it has carried that label in every register since.
--
-- WHY NOTHING ALREADY OWNED IT.
--
--   * Inventory holds stock items, movements, serial units and their ISSUE TO A PROJECT. None of
--     that records a part being handed TO THE CLIENT. Issuing a camera to a project is how it gets
--     installed; handing two spare cameras to the building owner at handover is a different event
--     with a different counterparty, and Inventory models the first.
--   * The O&M pack's `spare_parts_list` is a DOCUMENT — the recommended list. A list is not a
--     delivery, and reading it as one would quietly redefine the readiness item from "handed over"
--     to "written down".
--
-- So this table is the authority, scoped to a system like the O&M pack beside it.
--
-- THE CLIENT'S WORD IS WHAT COUNTS. `handed_over_at` is ours; `acknowledged_by` is theirs, and only
-- the second satisfies readiness — the same rule client training follows, and for the same reason:
-- our record of handing something over is not evidence that anybody received it.
--
-- QUANTITIES ARE NOT A LEDGER. `quantity_required` and `quantity_handed_over` are integers on one
-- row, not movements. This does not decrement stock, does not value anything, and does not pretend
-- to be Inventory. `stock_item_id` is a REFERENCE for anyone who wants the part's real record.
--
-- NOT REQUIRED, NEVER SILENTLY SKIPPED — the same decision the O&M pack makes. A spare that does
-- not apply to a system is marked, so "the spares are complete" means one thing on every system.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_handover_spares (
  id                    uuid        PRIMARY KEY,
  tenant_id             text        NOT NULL,
  company_id            text,
  project_id            text        NOT NULL,
  /** The system these spares belong to — a commissioning record. */
  commissioning_id      uuid        NOT NULL,
  description           text        NOT NULL,
  /** Reference to the part in Inventory, when it has one. A reference, never a copy. */
  stock_item_id         text,
  unit                  text,
  quantity_required     integer     NOT NULL DEFAULT 1,
  quantity_handed_over  integer     NOT NULL DEFAULT 0,
  required              boolean     NOT NULL DEFAULT true,
  /** Our record of handing it over. */
  handed_over_at        timestamptz,
  handed_over_by        text,
  /** The CLIENT's record of receiving it. Only this satisfies readiness. */
  acknowledged_by       text,
  acknowledged_at       timestamptz,
  notes                 text,
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_handover_spares_qty_required_chk     CHECK (quantity_required >= 0),
  CONSTRAINT aura_handover_spares_qty_handed_chk       CHECK (quantity_handed_over >= 0),
  -- One row per part per system. Two rows for one part would make "how many were handed over"
  -- answerable two ways.
  CONSTRAINT aura_handover_spares_uq UNIQUE (commissioning_id, description)
);

CREATE INDEX IF NOT EXISTS idx_handover_spares_project
  ON public.aura_handover_spares (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_handover_spares_system
  ON public.aura_handover_spares (tenant_id, commissioning_id);

ALTER TABLE public.aura_handover_spares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_handover_spares FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.aura_handover_spares;
CREATE POLICY tenant_isolation ON public.aura_handover_spares
  FOR ALL
  USING (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id::text = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

-- NO BACKFILL. The `spares` tick on existing handover packages records that somebody asserted it,
-- not what was handed over — there is no quantity, no part and no recipient in it. Turning one
-- boolean into a row would fabricate the delivery this table exists to record. Existing packages
-- correctly read "no spares listed" until somebody lists them.

-- @DOWN
DROP TABLE IF EXISTS public.aura_handover_spares;
