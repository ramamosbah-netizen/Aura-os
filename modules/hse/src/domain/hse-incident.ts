import { randomUUID } from 'node:crypto';

/**
 * HSE Incident — an event that harmed someone or could have. It walks a controlled investigation
 * lifecycle rather than flipping a status field:
 *
 *   reported ─investigate→ investigating ─close(rootCause)→ closed
 *       ▲                                                      │
 *       └──────────────── reopen (new evidence) ───────────────┘
 *
 * Two rules give it teeth, both enforced in the service (`closeIncident`) because they need the
 * CAPA aggregate:
 *
 *   1. An incident **cannot be closed while corrective actions are still open**. Closing an
 *      incident with outstanding CAPA is how the same accident happens twice — it is the same
 *      shape of control as the commissioning punch-list gate.
 *   2. Closing requires a recorded **root cause**. "Closed" with no cause is a filing action, not
 *      an investigation.
 *
 * Unlike a permit, an incident *can* be reopened: new evidence about a past accident is normal and
 * must not force a second, disconnected record.
 */
export type IncidentStatus = 'reported' | 'investigating' | 'closed';

/** Allowed transitions. `closed` is reversible — reopening on new evidence is legitimate. */
export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  reported: ['investigating'],
  investigating: ['closed'],
  closed: ['investigating'],
};

export interface HseIncident {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string; // YYYY-MM-DD
  severity: 'near_miss' | 'minor' | 'major' | 'fatal';
  description: string;
  locationDetail: string;
  status: IncidentStatus;
  /** Who is investigating, and since when. */
  investigatedBy: string | null;
  investigationStartedAt: string | null;
  /** Mandatory to close — an incident closed without a cause has not been investigated. */
  rootCause: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewHseIncident {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  date: string;
  severity: HseIncident['severity'];
  description: string;
  locationDetail: string;
  status?: HseIncident['status'];
  createdBy?: string | null;
}

export function makeHseIncident(input: NewHseIncident): HseIncident {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    date: input.date,
    severity: input.severity,
    description: input.description.trim(),
    locationDetail: input.locationDetail.trim(),
    status: input.status ?? 'reported',
    investigatedBy: null,
    investigationStartedAt: null,
    rootCause: null,
    closedBy: null,
    closedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── State machine ────────────────────────────────────────────────────────────

export class IncidentTransitionError extends Error {
  constructor(from: IncidentStatus, to: IncidentStatus) {
    // "can only" so the API error taxonomy classifies this 409 CONFLICT, not 500.
    super(`an incident in '${from}' can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'IncidentTransitionError';
  }
}

export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertIncidentTransition(from: IncidentStatus, to: IncidentStatus): void {
  if (!canTransitionIncident(from, to)) throw new IncidentTransitionError(from, to);
}

const touch = (i: HseIncident): HseIncident => ({ ...i, updatedAt: new Date().toISOString() });

/** reported → investigating. */
export function startIncidentInvestigation(i: HseIncident, actorId: string | null): HseIncident {
  assertIncidentTransition(i.status, 'investigating');
  return {
    ...touch(i),
    status: 'investigating',
    investigatedBy: actorId,
    investigationStartedAt: new Date().toISOString(),
  };
}

/**
 * investigating → closed. Root cause is mandatory. The open-CAPA gate is enforced in the service,
 * which can see the corrective actions raised against this incident.
 */
export function closeIncidentTransition(i: HseIncident, actorId: string | null, rootCause: string): HseIncident {
  if (!rootCause?.trim()) throw new Error('a root cause is required to close an incident');
  assertIncidentTransition(i.status, 'closed');
  return {
    ...touch(i),
    status: 'closed',
    rootCause: rootCause.trim(),
    closedBy: actorId,
    closedAt: new Date().toISOString(),
  };
}

/** closed → investigating: new evidence reopens the same record rather than spawning a second one. */
export function reopenIncident(i: HseIncident, actorId: string | null): HseIncident {
  assertIncidentTransition(i.status, 'investigating');
  return { ...touch(i), status: 'investigating', investigatedBy: actorId, closedBy: null, closedAt: null };
}
