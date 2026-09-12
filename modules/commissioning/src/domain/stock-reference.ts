import type { StockItemFact } from '../ports';

/**
 * Resolving a spare's stock reference against Inventory (TC-GATE-17).
 *
 * TC-GATE-16 gave a spare an optional `stockItemId` and described it as "a reference for whoever
 * wants the part's real record". It was free text nobody checked — which is exactly what TC-GATE-6
 * removed from the O&M pack, reintroduced one gate later in a smaller place. A reference nobody
 * resolves is not a reference; it is a note that looks like one.
 *
 * MATCHING BY CODE AS WELL AS ID, for the same reason the document reference does: the control that
 * captures this asks a person for a part, and a person types the part CODE they can see on a shelf
 * label — `CAM-DOME-4MP` — never a UUID.
 *
 * NOTHING IS STORED. The code, name and unit shown beside a spare are Inventory's answer at the
 * moment they are shown. A part renamed in Inventory reads renamed here, because nothing was kept.
 */
export interface ResolvedStockItem {
  /** What was typed, kept verbatim so a reader can see the reference that failed. */
  reference: string;
  item: StockItemFact | null;
  /** Matched nothing in the tenant's stock — the typo case. */
  missing: boolean;
}

/**
 * Resolve one reference.
 *
 * Returns NULL when there is nothing to say — no reference was given, or Inventory could not be
 * read. A null is not a pass and not a failure, the same rule every other cross-domain reading in
 * this module follows.
 */
export function resolveStockReference(
  reference: string | null | undefined,
  items: StockItemFact[] | null,
): ResolvedStockItem | null {
  const needle = reference?.trim();
  if (!needle || items === null) return null;
  const lowered = needle.toLowerCase();
  const item =
    items.find((i) => i.id.toLowerCase() === lowered) ??
    items.find((i) => i.code.trim().toLowerCase() === lowered) ??
    null;
  return { reference: needle, item, missing: item === null };
}
