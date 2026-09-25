import { type Id, newId } from '@aura/shared';

/**
 * A punch-list item (snag/defect) raised against a commissioning record — a defect that must be
 * cleared before the system can be signed off. A system cannot be commissioned while any punch item
 * is still open (enforced in the service), so the punch list is the retest gate.
 */
export type PunchSeverity = 'minor' | 'major' | 'critical';
export type PunchStatus = 'open' | 'closed';

export interface PunchItem {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  commissioningId: Id;
  projectId: Id;
  description: string;
  severity: PunchSeverity;
  location: string | null;
  status: PunchStatus;
  raisedBy: Id | null;
  resolution: string | null;
  closedBy: Id | null;
  closedAt: string | null;
  /**
   * Provenance into T&C's own evidence: the test point whose failure raised this defect, and the
   * specific failing run it answers. Both null for a defect found by eye on a walk-around rather
   * than by a failing test — which is not a lesser defect, it simply has no test to point at.
   *
   * This is what closes the middle of `Run #1 FAILED → defect → correction → Run #2 PASSED`: without
   * it, a failed run and an open defect on one system could not be told apart from two problems.
   */
  testItemId: Id | null;
  sourceRunId: Id | null;
  /**
   * The Quality escalation seam (TC-GATE-3). T&C never raises a non-conformance — that is Quality's
   * authority and its lifecycle. What T&C owns is the fact that it ASKED, and the reference to the
   * NCR a person then raised over there. `qualityNcrId` is a reference, never a copy: no NCR field
   * is duplicated here, so there is nothing to drift out of step with Quality.
   */
  escalationRequestedAt: string | null;
  escalatedBy: Id | null;
  qualityNcrId: string | null;
  /**
   * ROUTED TO ENGINEERING (TC-08, the owner's decision of 2026-09-25): a defect that needs a design
   * correction is sent by T&C to a named Design / Technical Engineer, who receives it in My Work.
   * Immutable once made; null on a defect T&C resolves itself.
   */
  routedTo: Id | null;
  routedBy: Id | null;
  routedAt: string | null;
  routingReason: string | null;
  /** The My Work item the engineer received it as. */
  routingReceiptId: string | null;
  /**
   * THE CORRECTIVE ACTION, recorded by the engineer it was routed to — what changed, and the revised
   * drawing or RFI it rests on. Recording it does not close the defect: T&C closes it, after the retest.
   */
  correctiveAction: string | null;
  correctionReference: string | null;
  correctedBy: Id | null;
  correctedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewPunchItem {
  tenantId: Id;
  companyId?: Id | null;
  commissioningId: Id;
  projectId: Id;
  description: string;
  severity?: PunchSeverity;
  location?: string | null;
  raisedBy?: Id | null;
  testItemId?: Id | null;
  sourceRunId?: Id | null;
}

const SEVERITIES: readonly PunchSeverity[] = ['minor', 'major', 'critical'];

export function makePunchItem(input: NewPunchItem): PunchItem {
  if (!input.description?.trim()) throw new Error('description is required');
  const severity = input.severity ?? 'minor';
  if (!SEVERITIES.includes(severity)) throw new Error(`severity must be one of: ${SEVERITIES.join(', ')}`);
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    commissioningId: input.commissioningId,
    projectId: input.projectId,
    description: input.description.trim(),
    severity,
    location: input.location?.trim() || null,
    status: 'open',
    raisedBy: input.raisedBy ?? null,
    resolution: null,
    closedBy: null,
    closedAt: null,
    testItemId: input.testItemId ?? null,
    sourceRunId: input.sourceRunId ?? null,
    escalationRequestedAt: null,
    escalatedBy: null,
    qualityNcrId: null,
    routedTo: null,
    routedBy: null,
    routedAt: null,
    routingReason: null,
    routingReceiptId: null,
    correctiveAction: null,
    correctionReference: null,
    correctedBy: null,
    correctedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Close a punch item once the defect is rectified (retested). A resolution note is required.
 *
 * A defect ROUTED TO ENGINEERING closes only once its corrective action is recorded and — when it came
 * from a test point — once that point's latest run is a pass: the retest, not the correction, is what
 * proves it. `pointResult` is that latest result, read by the caller from the evidence.
 */
export function closePunch(
  item: PunchItem,
  input: { resolution: string; closedBy?: Id | null },
  pointResult: string | null = null,
): PunchItem {
  if (item.status === 'closed') throw new Error('conflict: punch item is already closed');
  if (!input.resolution?.trim()) throw new Error('a resolution note is required to close a punch item');
  if (item.routedTo) {
    if (!item.correctiveAction) {
      throw new Error(`a defect routed to Engineering can only be closed once its corrective action is recorded — it is with ${item.routedTo}`);
    }
    if (item.testItemId && pointResult !== 'pass') {
      throw new Error('a defect routed to Engineering can only be closed once the retest of its test point has passed');
    }
  }
  const now = new Date().toISOString();
  return { ...item, status: 'closed', resolution: input.resolution.trim(), closedBy: input.closedBy ?? null, closedAt: now, updatedAt: now };
}

/** T&C sends a defect that needs a design correction to a named Design / Technical Engineer. */
export function routeToEngineering(
  item: PunchItem,
  input: { assigneeId: Id; reason: string; routedBy: Id | null },
): PunchItem {
  if (item.status === 'closed') throw new Error('conflict: the defect is already closed');
  if (item.routedTo) {
    throw new Error(`the defect's routing to Engineering is immutable once made — it is with ${item.routedTo}`);
  }
  if (!input.routedBy) throw new Error('validation: routing a defect requires an authenticated person');
  if (!input.assigneeId?.trim()) throw new Error('validation: routing a defect requires the engineer it is routed to');
  if (!input.reason?.trim()) throw new Error('validation: routing a defect requires a reason — what the design has to answer');
  const now = new Date().toISOString();
  return {
    ...item,
    routedTo: input.assigneeId.trim(),
    routedBy: input.routedBy,
    routedAt: now,
    routingReason: input.reason.trim(),
    updatedAt: now,
  };
}

/**
 * The engineer the defect was routed to records the corrective action. Only they may: a correction
 * recorded by somebody else would put a design decision in the mouth of a person who never made it.
 * It may be re-recorded while the defect is open — a first correction that fails its retest is followed
 * by a second — and every recording is audited as its own event.
 */
export function recordCorrectiveAction(
  item: PunchItem,
  input: { action: string; reference?: string | null; actorId: Id | null },
): PunchItem {
  if (item.status === 'closed') throw new Error('conflict: the defect is already closed');
  if (!item.routedTo) throw new Error('only a defect routed to Engineering can take a corrective action from Engineering');
  if (!input.actorId || input.actorId !== item.routedTo) {
    throw new Error(`access denied: this defect was routed to ${item.routedTo} — only they record its corrective action`);
  }
  if (!input.action?.trim()) throw new Error('validation: a corrective action must say what was changed');
  const now = new Date().toISOString();
  return {
    ...item,
    correctiveAction: input.action.trim(),
    correctionReference: input.reference?.trim() || null,
    correctedBy: input.actorId,
    correctedAt: now,
    updatedAt: now,
  };
}

/**
 * Record that this defect needs a Quality non-conformance, and — once someone has raised one over
 * there — which NCR answers it.
 *
 * Deliberately NOT a state machine. Escalation is a note T&C keeps about its own defect; the NCR's
 * lifecycle belongs to Quality and is read from Quality. Calling again updates the reference, which
 * is what happens when the first NCR number turns out to be the wrong one.
 */
export function escalateToQuality(
  item: PunchItem,
  input: { qualityNcrId?: string | null; escalatedBy?: Id | null },
): PunchItem {
  if (item.status === 'closed') throw new Error('conflict: the defect is already closed');
  return {
    ...item,
    escalationRequestedAt: item.escalationRequestedAt ?? new Date().toISOString(),
    escalatedBy: input.escalatedBy ?? item.escalatedBy,
    qualityNcrId: input.qualityNcrId?.trim() || item.qualityNcrId,
    updatedAt: new Date().toISOString(),
  };
}
