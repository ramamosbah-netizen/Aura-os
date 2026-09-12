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
    createdAt: now,
    updatedAt: now,
  };
}

/** Close a punch item once the defect is rectified (retested). A resolution note is required. */
export function closePunch(item: PunchItem, input: { resolution: string; closedBy?: Id | null }): PunchItem {
  if (item.status === 'closed') throw new Error('conflict: punch item is already closed');
  if (!input.resolution?.trim()) throw new Error('a resolution note is required to close a punch item');
  const now = new Date().toISOString();
  return { ...item, status: 'closed', resolution: input.resolution.trim(), closedBy: input.closedBy ?? null, closedAt: now, updatedAt: now };
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
