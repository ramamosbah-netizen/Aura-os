-- Who moved the stock.
--
-- Found while building `BUY-07`'s acknowledgement: `aura_inventory_stock_movements` has recorded
-- what moved, how much, why, at what cost and since 0339 to which work package -- and never WHO DID
-- IT. Every other operational record in this system carries `created_by`; the one that changes the
-- physical position of company assets did not.
--
-- That is an audit gap on its own terms, and it is also what makes a receipt meaningful. `BUY-07`
-- hands material from a Storekeeper to a work package's recipient, and a receipt the ISSUER signs
-- proves nothing -- it records that somebody agreed with themselves. The rule "the person who issued
-- the material may not acknowledge its delivery" cannot be enforced against a movement whose issuer
-- was never recorded, so the column comes first and the rule follows.
--
-- NULLABLE and not backfilled. Historical movements were made by somebody this system did not
-- record, and inventing an actor for them would be writing a name into an audit column on the
-- strength of a guess. NULL means "the issuer was not recorded", which is exactly what happened.
--
-- The consequence is deliberate: a delivery whose issuer is unknown cannot satisfy the maker/checker
-- rule, because the rule cannot be evaluated. It refuses rather than passing -- the same reading
-- this wave has applied to every unreadable position.

alter table public.aura_inventory_stock_movements
  add column if not exists issued_by text;

comment on column public.aura_inventory_stock_movements.issued_by is
  'Actor who recorded this movement. NULL = not recorded (historic); a delivery whose issuer is unknown cannot be acknowledged, because maker/checker cannot be evaluated.';

-- @DOWN
ALTER TABLE public.aura_inventory_stock_movements DROP COLUMN IF EXISTS issued_by;
