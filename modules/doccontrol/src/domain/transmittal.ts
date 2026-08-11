import { randomUUID } from 'node:crypto';

export type TransmittalStatus = 'draft' | 'sent' | 'received' | 'acknowledged';

/**
 * Transmittal conveyance lifecycle (G-33): draft → sent → received → acknowledged. Enforced so a
 * transmittal cannot skip states or be re-sent after acknowledgement. Items (exact document
 * revisions) are attached while it is a draft; `sent` is the point of conveyance.
 */
export const TRANSMITTAL_TRANSITIONS: Record<TransmittalStatus, TransmittalStatus[]> = {
  draft: ['sent'],
  sent: ['received', 'acknowledged'],
  received: ['acknowledged'],
  acknowledged: [],
};

export class TransmittalTransitionError extends Error {
  constructor(from: TransmittalStatus, to: TransmittalStatus) {
    // "can only" → 409 CONFLICT via the API error taxonomy.
    super(`a transmittal in '${from}' can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'TransmittalTransitionError';
  }
}

export function assertTransmittalTransition(from: TransmittalStatus, to: TransmittalStatus): void {
  if (!(TRANSMITTAL_TRANSITIONS[from]?.includes(to) ?? false)) throw new TransmittalTransitionError(from, to);
}

export interface Transmittal {
  id: string;
  tenantId: string;
  companyId: string | null;
  code: string;
  title: string;
  projectId: string;
  projectName: string | null;
  sender: string | null;
  recipient: string | null;
  status: TransmittalStatus;
  sentAt: string | null;
  receivedAt: string | null;
  acknowledgedAt: string | null;
  ownerId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewTransmittal {
  tenantId: string;
  companyId?: string | null;
  code: string;
  title: string;
  projectId: string;
  projectName?: string | null;
  sender?: string | null;
  recipient?: string | null;
  status?: Transmittal['status'];
  ownerId?: string | null;
  createdBy?: string | null;
}

export function makeTransmittal(input: NewTransmittal): Transmittal {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    sender: input.sender ?? null,
    recipient: input.recipient ?? null,
    status: input.status ?? 'draft',
    sentAt: null,
    receivedAt: null,
    acknowledgedAt: null,
    ownerId: input.ownerId ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

const touchT = (t: Transmittal): Transmittal => ({ ...t, updatedAt: new Date().toISOString() });

/** draft → sent (conveyance). */
export function sendTransmittal(t: Transmittal): Transmittal {
  assertTransmittalTransition(t.status, 'sent');
  return { ...touchT(t), status: 'sent', sentAt: new Date().toISOString() };
}

/** sent → received (recipient confirms receipt). */
export function receiveTransmittal(t: Transmittal): Transmittal {
  assertTransmittalTransition(t.status, 'received');
  return { ...touchT(t), status: 'received', receivedAt: new Date().toISOString() };
}

/** sent|received → acknowledged (recipient formally acknowledges). */
export function acknowledgeTransmittal(t: Transmittal): Transmittal {
  assertTransmittalTransition(t.status, 'acknowledged');
  return { ...touchT(t), status: 'acknowledged', acknowledgedAt: new Date().toISOString() };
}
