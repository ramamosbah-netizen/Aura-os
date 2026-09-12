/**
 * Is this handover package ready to go to the client? (TC-GATE-4)
 *
 * THE CHANGE THIS MAKES.
 *
 * Handover readiness was six booleans on the package, each one a person asserting that evidence
 * existed somewhere else. Nothing checked. A package could read "test certificates ✓" while three of
 * its systems had never been tested, because the tick and the evidence lived in different places and
 * only one of them was ever looked at.
 *
 * Two of the six now come from the domain that owns the evidence, and **cannot be ticked**:
 *
 *   commissioning  → Testing & Commissioning: every system COMMISSIONING READY (its own nine-gate
 *                    chain, unchanged from TC-GATE-3)
 *   asBuilts       → Engineering: an as-built drawing released on this project
 *
 * The other four have no owning authority in the repository — there is no O&M package, no client
 * training record, no warranty-document register and no spares handover. They stay as assertions,
 * and they say so on the page. An assertion labelled as an assertion is honest; an assertion
 * rendered as evidence is the thing this gate exists to remove.
 *
 * UNKNOWN IS NEVER A PASS, the same rule the T&C chain follows: a domain that cannot be read, or a
 * project with nothing to judge, blocks rather than passes.
 */

export type HandoverItemState = 'READY' | 'BLOCKED' | 'UNKNOWN';

export type HandoverItemId = 'commissioning' | 'asBuilts' | 'omManuals' | 'warrantyDocs' | 'training' | 'spares';

export interface HandoverReadinessItem {
  id: HandoverItemId;
  label: string;
  state: HandoverItemState;
  reason: string;
  /** The domain that owns the answer — or who is asserting it, when nobody owns it yet. */
  source: string;
  /**
   * `projected` — derived from an owning authority and not tickable.
   * `asserted`  — a person's tick, because no authority exists to derive it from. Said out loud so
   *               nobody mistakes one for the other.
   */
  evidence: 'projected' | 'asserted';
}

export interface HandoverReadiness {
  items: HandoverReadinessItem[];
  /** Every item READY. One BLOCKED or UNKNOWN is enough to refuse the submission. */
  readyToSubmit: boolean;
  blocking: HandoverItemId[];
}

export interface HandoverReadinessFacts {
  /** Commissioning systems on the project, and how many pass their whole readiness chain. */
  systemsTotal: number;
  systemsCommissioningReady: number;
  /** The blockers of the systems that are not ready, for a reason a reader can act on. */
  notReadyReasons: string[];
  /** Engineering's drawings for the project. Null when Engineering could not be read. */
  drawings: { discipline: string; status: string }[] | null;
  /** The four items nobody owns yet — still the package's own checklist. */
  asserted: { omManuals: boolean; warrantyDocs: boolean; training: boolean; spares: boolean };
}

const AS_BUILT_STATUSES = new Set(['as_built']);

const item = (
  id: HandoverItemId,
  label: string,
  source: string,
  evidence: HandoverReadinessItem['evidence'],
  state: HandoverItemState,
  reason: string,
): HandoverReadinessItem => ({ id, label, state, reason, source, evidence });

export function assessHandoverReadiness(facts: HandoverReadinessFacts): HandoverReadiness {
  const items: HandoverReadinessItem[] = [
    commissioningItem(facts),
    asBuiltItem(facts),
    ...assertedItems(facts.asserted),
  ];
  const blocking = items.filter((i) => i.state !== 'READY').map((i) => i.id);
  return { items, blocking, readyToSubmit: blocking.length === 0 };
}

function commissioningItem(f: HandoverReadinessFacts): HandoverReadinessItem {
  const id: HandoverItemId = 'commissioning';
  const label = 'Systems commissioned and technically ready';
  const source = 'Testing & commissioning';
  if (f.systemsTotal === 0) {
    return item(id, label, source, 'projected', 'UNKNOWN',
      'No system is registered for commissioning on this project, so there is nothing to say it works.');
  }
  const outstanding = f.systemsTotal - f.systemsCommissioningReady;
  if (outstanding > 0) {
    const why = f.notReadyReasons.slice(0, 3).join('; ');
    return item(id, label, source, 'projected', 'BLOCKED',
      `${outstanding} of ${f.systemsTotal} system${f.systemsTotal === 1 ? '' : 's'} not commissioning ready${why ? ` — ${why}` : ''}.`);
  }
  return item(id, label, source, 'projected', 'READY',
    `All ${f.systemsTotal} system${f.systemsTotal === 1 ? '' : 's'} pass the full commissioning readiness chain.`);
}

function asBuiltItem(f: HandoverReadinessFacts): HandoverReadinessItem {
  const id: HandoverItemId = 'asBuilts';
  const label = 'As-built drawings released';
  const source = 'Engineering';
  if (f.drawings === null) return item(id, label, source, 'projected', 'UNKNOWN', 'Engineering could not be read.');
  if (f.drawings.length === 0) {
    return item(id, label, source, 'projected', 'UNKNOWN', 'Engineering holds no drawings for this project, so there are no as-builts to release.');
  }
  const asBuilt = f.drawings.filter((d) => AS_BUILT_STATUSES.has(d.status));
  if (asBuilt.length === 0) {
    return item(id, label, source, 'projected', 'BLOCKED',
      `${f.drawings.length} drawing${f.drawings.length === 1 ? '' : 's'} on the project, none marked as-built.`);
  }
  return item(id, label, source, 'projected', 'READY',
    `${asBuilt.length} as-built drawing${asBuilt.length === 1 ? '' : 's'} released.`);
}

/**
 * The four with no owner.
 *
 * Each says WHO is asserting it and that nothing verified it. When one of these gains a real
 * authority — an O&M package, a client-training record — it moves to `projected` and the tick goes
 * away, which is the same move commissioning and as-builts have just made.
 */
function assertedItems(a: HandoverReadinessFacts['asserted']): HandoverReadinessItem[] {
  const rows: { id: HandoverItemId; label: string; ticked: boolean; missing: string }[] = [
    { id: 'omManuals', label: 'O&M manuals', ticked: a.omManuals, missing: 'no O&M package authority exists yet' },
    { id: 'warrantyDocs', label: 'Warranty documents', ticked: a.warrantyDocs, missing: 'no warranty-document register is linked' },
    { id: 'training', label: 'Client training and demonstration', ticked: a.training, missing: 'no client-training record exists yet' },
    { id: 'spares', label: 'Spares and consumables handed over', ticked: a.spares, missing: 'no spares handover record is linked' },
  ];
  return rows.map((row) =>
    item(
      row.id,
      row.label,
      'Asserted on the package',
      'asserted',
      row.ticked ? 'READY' : 'BLOCKED',
      row.ticked
        ? `Ticked on the package. Nothing verifies this — ${row.missing}.`
        : `Not ticked. ${row.missing[0].toUpperCase()}${row.missing.slice(1)}, so this cannot be derived.`,
    ),
  );
}
