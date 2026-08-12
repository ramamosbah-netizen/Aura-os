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
