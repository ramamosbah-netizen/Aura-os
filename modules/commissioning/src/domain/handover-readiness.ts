import type { SnagFact } from '../ports';
import {
  type ControlledDocumentFact,
  type ResolvedDocument,
  AS_BUILT_STATUS,
  referenceIsSound,
  resolveDocumentReference,
} from './document-reference';

/**
 * Is this handover package ready to go to the client? (TC-GATE-4, extended by TC-GATE-5 and -6)
 *
 * THE CHANGE THIS MAKES.
 *
 * Handover readiness was six booleans on the package, each one a person asserting that evidence
 * existed somewhere else. Nothing checked. A package could read "test certificates ✓" while three of
 * its systems had never been tested, because the tick and the evidence lived in different places and
 * only one of them was ever looked at.
 *
 * FIVE of the six now come from the domain that owns the evidence, and **cannot be ticked**:
 *
 *   commissioning  → Testing & Commissioning: every system COMMISSIONING READY (its own nine-gate
 *                    chain, unchanged from TC-GATE-3)
 *   snags          → Quality: no snag left open on the project (TC-GATE-9)
 *   asBuilts       → Document control: a current as-built drawing linked to EVERY system (TC-GATE-8)
 *   omManuals      → Handover's own O&M pack: every required deliverable accepted, each against a
 *                    reference that resolves in DocControl's register (TC-GATE-5, -6)
 *   warrantyDocs   → the same pack's warranty certificate, on its own (TC-GATE-6)
 *   training       → Handover's own client training record: every system acknowledged (TC-GATE-5)
 *   spares         → Handover's own spares record: every required part acknowledged by the client
 *                    (TC-GATE-16)
 *
 * WHY AS-BUILTS MOVED (TC-GATE-6). TC-GATE-4 asked ENGINEERING for as-builts. Engineering's
 * `DrawingStatus` has no `as_built` value and never did, so the filter matched nothing a real
 * project could produce: the gate could reach BLOCKED or UNKNOWN and **never READY**, which made
 * every handover package permanently unsubmittable. The unit test hid it by handing the port a
 * fabricated `status: 'as_built'` that type-checked only because the port widens status to `string`.
 * DocControl's `RegisterStatus` does carry `as_built`, and Projects' closeout gate has always read
 * it from there. Handover was asking the wrong domain.
 *
 * ALL SEVEN ARE NOW PROJECTED (TC-GATE-16). Spares was the last item that said "nothing verifies
 * this", and it said it in every register from TC-GATE-4 onwards. With an authority behind it, the
 * package's stored checklist has nothing left to tick: `evidence: 'asserted'` no longer occurs, and
 * the six booleans this whole arc started from are vestigial in the truest sense — nothing reads
 * them, nothing writes them, and nothing can.
 *
 * UNKNOWN IS NEVER A PASS, the same rule the T&C chain follows: a domain that cannot be read, or a
 * project with nothing to judge, blocks rather than passes. TC-GATE-6 extends that to references:
 * once the pack CLAIMS its documents are real, a register it cannot read makes the claim unverified,
 * not true.
 */

export type HandoverItemState = 'READY' | 'BLOCKED' | 'UNKNOWN';

export type HandoverItemId = 'commissioning' | 'snags' | 'asBuilts' | 'omManuals' | 'warrantyDocs' | 'training' | 'spares';

/** The O&M deliverable that answers `warrantyDocs`, and is therefore excluded from `omManuals`. */
export const WARRANTY_DELIVERABLE = 'warranty_certificate';

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
  /**
   * The project's controlled document register (TC-GATE-6). Null when DocControl could not be read —
   * which makes both the as-built gate and every reference check UNKNOWN, never satisfied.
   */
  documents: ControlledDocumentFact[] | null;
  /** Handover's own O&M pack, per system (TC-GATE-5), each with the reference it points at. */
  omItems: {
    commissioningId: string;
    deliverable: string;
    required: boolean;
    state: string;
    documentId: string | null;
  }[];
  /** Handover's own client training record (TC-GATE-5). */
  trainingSessions: { commissioningId: string | null; state: string }[];
  /** The systems the O&M pack and the training are measured against. */
  systemIds: string[];
  /** Which controlled drawing documents which system (TC-GATE-8). T&C's own link, not a copy. */
  asBuiltLinks: { commissioningId: string; documentId: string }[];
  /**
   * The project's snags, as QUALITY holds them (TC-GATE-9). Null when Quality could not be read.
   *
   * T&C's punch items are deliberately NOT here: they already reach this assessment through the
   * commissioning item, whose nine-gate chain has a `defects` gate of its own. Counting them again
   * would light up two failures for one cause.
   */
  snags: SnagFact[] | null;
  /**
   * Handover's own spares record (TC-GATE-16). What the client was handed, and what they confirmed.
   *
   * This replaced the package's `spares` tick — the last of the six. The facts no longer carry an
   * `asserted` field at all, because there is nothing left to assert.
   */
  spares: {
    commissioningId: string;
    required: boolean;
    quantityRequired: number;
    quantityHandedOver: number;
    acknowledgedBy: string | null;
  }[];
}

const item = (
  id: HandoverItemId,
  label: string,
  source: string,
  evidence: HandoverReadinessItem['evidence'],
  state: HandoverItemState,
  reason: string,
): HandoverReadinessItem => ({ id, label, state, reason, source, evidence });

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export function assessHandoverReadiness(facts: HandoverReadinessFacts): HandoverReadiness {
  const items: HandoverReadinessItem[] = [
    commissioningItem(facts),
    snagItem(facts),
    asBuiltItem(facts),
    omPackItem(facts, 'omManuals', 'O&M deliverables accepted', (d) => d !== WARRANTY_DELIVERABLE),
    omPackItem(facts, 'warrantyDocs', 'Warranty certificates accepted', (d) => d === WARRANTY_DELIVERABLE),
    trainingItem(facts),
    sparesItem(facts),
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
      `${outstanding} of ${f.systemsTotal} ${plural(f.systemsTotal, 'system', 'systems')} not commissioning ready${why ? ` — ${why}` : ''}.`);
  }
  return item(id, label, source, 'projected', 'READY',
    `All ${f.systemsTotal} ${plural(f.systemsTotal, 'system', 'systems')} pass the full commissioning readiness chain.`);
}

/**
 * Quality's snags (TC-GATE-9).
 *
 * THE HOLE THIS FILLS. Handover readiness read T&C's punch items — through the commissioning item,
 * whose chain gates on them — and nothing else. It never read Quality's snags, which are a SEPARATE
 * authority with its own table, its own severity scale and its own three-state lifecycle. Projects'
 * closeout has always counted them (`readProjectQualityReadiness.openSnags`). So a client could be
 * handed a package with snags outstanding, and the closeout gate would then refuse the same project
 * — two gates, one project, opposite answers.
 *
 * WHY THIS DOES NOT COUNT PUNCH ITEMS TOO. They are already gated by the commissioning item above.
 * One cause should produce one failure, which is the same reason the warranty certificate was
 * excluded from the O&M count in TC-GATE-6. The Snag & Punch List surface shows BOTH, because a list
 * is for working from; a gate is for deciding, and deciding twice on one fact helps nobody.
 *
 * OPEN IS QUALITY'S WORD. This counts what Quality calls open and adds no severity threshold of its
 * own — restating a threshold in the consumer is exactly the drift the ports exist to prevent.
 */
function snagItem(f: HandoverReadinessFacts): HandoverReadinessItem {
  const id: HandoverItemId = 'snags';
  const label = 'Quality snags cleared';
  const source = 'Quality';
  if (f.snags === null) {
    return item(id, label, source, 'projected', 'UNKNOWN',
      'Quality could not be read, so it is not known whether any snag is outstanding.');
  }
  const open = f.snags.filter((s) => s.status === 'open');
  if (open.length > 0) {
    const worst = ['high', 'medium', 'low'].find((sev) => open.some((s) => s.severity === sev));
    return item(id, label, source, 'projected', 'BLOCKED',
      `${open.length} open ${plural(open.length, 'snag', 'snags')} on this project${worst ? `, the most severe ${worst}` : ''}.`);
  }
  return item(id, label, source, 'projected', 'READY',
    f.snags.length === 0
      ? 'Quality holds no snag for this project.'
      : `All ${f.snags.length} ${plural(f.snags.length, 'snag is', 'snags are')} resolved or closed.`);
}

/**
 * As-builts, PER SYSTEM (TC-GATE-8).
 *
 * TC-GATE-6 moved this question to the register that can answer it, but asked it once for the whole
 * project: one entry marked `as_built` anywhere satisfied every system. A ten-system project with a
 * single as-built lift-lobby layout read READY, and said so — "1 as-built drawing in the register" —
 * which is weak evidence wearing a pass.
 *
 * It could not be split before, because nothing joined the two sides: every ELV system on a project
 * shares the discipline `elv`, so discipline cannot tell one system's as-built from another's. The
 * link is now EXPLICIT and T&C-owned (migration 0301), so the question can finally be asked once per
 * system.
 *
 * A system with NO link is UNKNOWN, not BLOCKED: nobody has said anything about it, and nothing has
 * failed. A system whose linked drawing is missing, superseded, or not actually marked as-built IS
 * blocked — something was said, and it does not hold.
 */
function asBuiltItem(f: HandoverReadinessFacts): HandoverReadinessItem {
  const id: HandoverItemId = 'asBuilts';
  const label = 'As-built drawings released';
  const source = 'Document control';
  const total = f.systemIds.length;
  if (total === 0) {
    return item(id, label, source, 'projected', 'UNKNOWN', 'No system is registered, so there is no as-built to link.');
  }
  if (f.documents === null) return item(id, label, source, 'projected', 'UNKNOWN', 'Document control could not be read.');

  const unlinked = f.systemIds.filter((sid) => !f.asBuiltLinks.some((l) => l.commissioningId === sid));
  if (unlinked.length > 0) {
    return item(id, label, source, 'projected', 'UNKNOWN',
      `${unlinked.length} of ${total} ${plural(total, 'system has', 'systems have')} no as-built drawing linked, so it cannot be said whether the as-builts cover the project.`);
  }

  const unsound = f.systemIds.filter((sid) => !linkedAsBuiltIsSound(f, sid));
  if (unsound.length > 0) {
    return item(id, label, source, 'projected', 'BLOCKED',
      `${unsound.length} of ${total} ${plural(total, 'system is', 'systems are')} linked to a drawing that is not a current as-built in the register.`);
  }
  return item(id, label, source, 'projected', 'READY',
    `Every system has a current as-built drawing linked (${f.asBuiltLinks.length} in total).`);
}

/** At least one of this system's linked drawings resolves, is current, and is marked as-built. */
function linkedAsBuiltIsSound(f: HandoverReadinessFacts, systemId: string): boolean {
  return f.asBuiltLinks
    .filter((l) => l.commissioningId === systemId)
    .some((l) => {
      const resolved = resolveDocumentReference(l.documentId, f.documents);
      return referenceIsSound(resolved) && resolved!.document!.status === AS_BUILT_STATUS;
    });
}

/**
 * One slice of the O&M pack, per system.
 *
 * Used twice: for the pack as a whole, and for the warranty certificate on its own. They are
 * DISJOINT — the warranty certificate is excluded from `omManuals` — so a missing warranty does not
 * light up two failures for one cause, and every deliverable is counted exactly once.
 *
 * READY needs three things of every system: the deliverable was ASKED FOR, it was ACCEPTED, and the
 * reference it was accepted against RESOLVES in the register. That last check is TC-GATE-6's whole
 * point: acceptance against a document that does not exist is the failure this gate removes.
 *
 * A deliverable marked not required is excluded — that is what marking it is for. A system where
 * nothing of this kind was ever listed is UNKNOWN, because nothing was asked, so nothing can be
 * said. The two are different: one is a decision, the other is a silence.
 */
function omPackItem(
  f: HandoverReadinessFacts,
  id: HandoverItemId,
  label: string,
  matches: (deliverable: string) => boolean,
): HandoverReadinessItem {
  const source = 'Handover — O&M pack';
  if (f.systemIds.length === 0) {
    return item(id, label, source, 'projected', 'UNKNOWN', 'No system is registered, so there is no O&M pack to complete.');
  }
  const mine = f.omItems.filter((i) => matches(i.deliverable));
  const unlisted = f.systemIds.filter((sid) => !mine.some((i) => i.commissioningId === sid));
  if (unlisted.length > 0) {
    return item(id, label, source, 'projected', 'UNKNOWN',
      `${unlisted.length} of ${f.systemIds.length} ${plural(f.systemIds.length, 'system has', 'systems have')} nothing listed, so this cannot be judged complete.`);
  }
  const required = mine.filter((i) => i.required);
  if (required.length === 0) {
    return item(id, label, source, 'projected', 'READY',
      `Recorded as not required on all ${f.systemIds.length} ${plural(f.systemIds.length, 'system', 'systems')}.`);
  }
  const outstanding = required.filter((i) => i.state !== 'accepted');
  if (outstanding.length > 0) {
    return item(id, label, source, 'projected', 'BLOCKED',
      `${outstanding.length} of ${required.length} required ${plural(required.length, 'deliverable is', 'deliverables are')} not accepted.`);
  }
  // Accepted — but against WHAT? Every reference goes back to the register (TC-GATE-6).
  if (f.documents === null) {
    return item(id, label, source, 'projected', 'UNKNOWN',
      `All ${required.length} required ${plural(required.length, 'deliverable is', 'deliverables are')} accepted, but document control could not be read, so the references behind them are unverified.`);
  }
  const resolved = required.map((i) => resolveDocumentReference(i.documentId, f.documents));
  const unsound = resolved.filter((r) => !referenceIsSound(r));
  if (unsound.length > 0) {
    return item(id, label, source, 'projected', 'BLOCKED',
      `${unsound.length} of ${required.length} accepted ${plural(required.length, 'deliverable', 'deliverables')} — ${describeUnsound(unsound)}.`);
  }
  return item(id, label, source, 'projected', 'READY',
    `All ${required.length} required ${plural(required.length, 'deliverable', 'deliverables')} accepted against a current controlled document.`);
}

/** Say WHICH way the references are bad, because the two need different fixes. */
function describeUnsound(resolved: (ResolvedDocument | null)[]): string {
  const none = resolved.filter((r) => r === null).length;
  const missing = resolved.filter((r) => r !== null && r.missing).length;
  const superseded = resolved.filter((r) => r !== null && r.superseded).length;
  const parts: string[] = [];
  if (none > 0) parts.push(`${none} with no document reference at all`);
  if (missing > 0) parts.push(`${missing} pointing at a document that is not in the project register`);
  if (superseded > 0) parts.push(`${superseded} pointing at a superseded revision`);
  return parts.join(', ');
}

/**
 * Client training, per system.
 *
 * READY only when every system has a session the CLIENT acknowledged. Our own "completed" is not
 * enough: the acknowledgement is the client's word, and it is the one a dispute turns on. Sessions
 * recorded against the project rather than a system count for every system, which is how a single
 * whole-package handover session is legitimately recorded.
 */
function trainingItem(f: HandoverReadinessFacts): HandoverReadinessItem {
  const id: HandoverItemId = 'training';
  const label = 'Client training acknowledged';
  const source = 'Handover — client training';
  if (f.systemIds.length === 0) {
    return item(id, label, source, 'projected', 'UNKNOWN', 'No system is registered, so there is no training to give.');
  }
  const acknowledged = f.trainingSessions.filter((s) => s.state === 'acknowledged');
  const projectWide = acknowledged.some((s) => s.commissioningId === null);
  const covered = projectWide
    ? f.systemIds
    : f.systemIds.filter((sid) => acknowledged.some((s) => s.commissioningId === sid));
  const missing = f.systemIds.length - covered.length;
  if (f.trainingSessions.length === 0) {
    return item(id, label, source, 'projected', 'UNKNOWN', 'No training session has been recorded for this project.');
  }
  if (missing > 0) {
    const pending = f.trainingSessions.filter((s) => s.state !== 'acknowledged').length;
    return item(id, label, source, 'projected', 'BLOCKED',
      `${missing} of ${f.systemIds.length} ${plural(f.systemIds.length, 'system', 'systems')} without client-acknowledged training${pending > 0 ? `; ${pending} ${plural(pending, 'session', 'sessions')} recorded but not acknowledged` : ''}.`);
  }
  return item(id, label, source, 'projected', 'READY',
    projectWide
      ? 'A project-wide training session has been acknowledged by the client.'
      : `Every system has client-acknowledged training (${acknowledged.length} ${plural(acknowledged.length, 'session', 'sessions')}).`);
}

/**
 * Spares, per system (TC-GATE-16) — the last assertion to become a projection.
 *
 * Every register from TC-GATE-4 onwards recorded this item as "nothing verifies this", because
 * nothing in the repository held the fact: Inventory records a part being ISSUED TO A PROJECT, which
 * is how it gets installed, not handed to the building owner; and the O&M pack's recommended-spares
 * list is a document, not a delivery. Handover now owns it.
 *
 * READY needs the CLIENT's acknowledgement, not ours. A part we recorded handing over is our word;
 * the acknowledgement is theirs, and it is the one a dispute turns on — the same rule client
 * training has followed since TC-GATE-5.
 *
 * A system with nothing listed is UNKNOWN, not READY: nothing was asked for, so nothing can be
 * said. A part marked not required is excluded, because that is what marking it is for — and a
 * system where every part is waived reads READY, since waiving is a decision rather than a silence.
 */
function sparesItem(f: HandoverReadinessFacts): HandoverReadinessItem {
  const id: HandoverItemId = 'spares';
  const label = 'Spares and consumables handed over';
  const source = 'Handover — spares';
  if (f.systemIds.length === 0) {
    return item(id, label, source, 'projected', 'UNKNOWN', 'No system is registered, so there are no spares to hand over.');
  }
  const unlisted = f.systemIds.filter((sid) => !f.spares.some((s) => s.commissioningId === sid));
  if (unlisted.length > 0) {
    return item(id, label, source, 'projected', 'UNKNOWN',
      `${unlisted.length} of ${f.systemIds.length} ${plural(f.systemIds.length, 'system has', 'systems have')} no spares listed, so this cannot be judged complete.`);
  }

  const required = f.spares.filter((s) => s.required);
  if (required.length === 0) {
    return item(id, label, source, 'projected', 'READY',
      `Recorded as not required on all ${f.systemIds.length} ${plural(f.systemIds.length, 'system', 'systems')}.`);
  }
  const unacknowledged = required.filter((s) => !s.acknowledgedBy);
  if (unacknowledged.length > 0) {
    const handed = unacknowledged.filter((s) => s.quantityHandedOver > 0).length;
    return item(id, label, source, 'projected', 'BLOCKED',
      `${unacknowledged.length} of ${required.length} required ${plural(required.length, 'part is', 'parts are')} not acknowledged by the client` +
        (handed > 0 ? `; ${handed} handed over but not confirmed.` : '.'));
  }
  const short = required.filter((s) => s.quantityHandedOver < s.quantityRequired);
  if (short.length > 0) {
    return item(id, label, source, 'projected', 'BLOCKED',
      `${short.length} of ${required.length} required ${plural(required.length, 'part was', 'parts were')} acknowledged short of the quantity asked for.`);
  }
  return item(id, label, source, 'projected', 'READY',
    `All ${required.length} required ${plural(required.length, 'part', 'parts')} handed over and acknowledged by the client.`);
}
