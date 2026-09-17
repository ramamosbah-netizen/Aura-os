-- BUY-07 — the next-role receipt: Site acknowledges material delivered to a work package.
--
-- THIS TABLE CARRIES NO QUANTITY, AND THAT IS THE POINT.
--
-- The material already moved. A Storekeeper issued it, the movement is persisted, and the quantity
-- delivered to a work package is derived from those movements and from nothing else. If an
-- acknowledgement carried its own quantity it would become a SECOND WRITER of a fact that already
-- has an authority, and the two could disagree -- which is precisely the competing-truth defect this
-- wave has spent itself removing (a header value beside line values, a scalar order quantity beside
-- its lines, a percentage beside per-line positions). So an acknowledgement records exactly one new
-- fact: a named human accepted receipt of THIS persisted movement, at this time.
--
-- `movement_id` is therefore the whole of the reference, and it is UNIQUE: acknowledging the same
-- movement twice is not two receipts, it is one receipt recorded twice, and a relay replaying a
-- request must not manufacture a second.
--
-- The work package is denormalised onto the row deliberately. It is the movement's OWN destination,
-- copied at the moment of acknowledgement, so that what was acknowledged can still be read if the
-- responsibility that authorised it is later reassigned. It is never used to recompute a quantity.

create table if not exists public.aura_inventory_delivery_acknowledgements (
  id               uuid PRIMARY KEY,
  tenant_id        text NOT NULL,
  company_id       text,
  -- The already-persisted movement being acknowledged. One receipt per movement.
  movement_id      uuid NOT NULL,
  -- The destination the movement itself declared. Copied, never inferred.
  wbs_node_id      text NOT NULL,
  project_id       text NOT NULL,
  -- WHO accepted receipt. A receipt with no named actor proves nothing about who took
  -- responsibility, which is why the site-instruction pattern (0066: acknowledged_at with no
  -- acknowledged_by) is deliberately NOT copied here.
  acknowledged_by  text NOT NULL,
  acknowledged_at  timestamptz NOT NULL DEFAULT now(),
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_delivery_ack_one_per_movement UNIQUE (tenant_id, movement_id)
);

create index if not exists ix_aura_delivery_ack_wbs
  on public.aura_inventory_delivery_acknowledgements (tenant_id, wbs_node_id);

ALTER TABLE public.aura_inventory_delivery_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_inventory_delivery_acknowledgements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_inventory_delivery_acknowledgements;
CREATE POLICY tenant_isolation_policy ON public.aura_inventory_delivery_acknowledgements
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_inventory_delivery_acknowledgements TO aura_app;

-- @DOWN
DROP TABLE IF EXISTS public.aura_inventory_delivery_acknowledgements;
