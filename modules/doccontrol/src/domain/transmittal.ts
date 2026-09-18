import { randomUUID } from 'node:crypto';

export type TransmittalStatus = 'draft' | 'sent' | 'received' | 'acknowledged';

/**
 * WHAT KIND OF CONVEYANCE THIS IS — and the reason the distinction had to be made.
 *
 * `engineering/drawings/:id/transmit` is an INTERNAL HANDOFF: an approved drawing is released to
 * named platform recipients (Site Engineer, Project Engineer, Buyer) who take an
 * `engineering_release` responsibility for it. Nothing leaves the business through it.
 *
 * But it does not stop at recording a handoff. Its reactor CREATES A DOCCONTROL TRANSMITTAL AND
 * SENDS IT — the same record type document control uses for a conveyance to the client, marked
 * `sent`, and (before this) released by nobody at all. So an engineer holding no document-control
 * permission whatsoever produced a sent conveyance, and the register could not tell that record
 * apart from one the Document Controller had issued outside.
 *
 * `internal_release` says the engineering handoff produced it. `external` says document control
 * released it outside the business. THE KIND IS NOT REACHABLE FROM ANY REQUEST BODY: the only way
 * to obtain `internal_release` is to be the engineering reactor, and everything created through
 * document control's own route is `external`. That is the whole enforcement — the engineering path
 * cannot manufacture an external conveyance because it cannot ask for one.
 *
 * `null` is the historical value: rows written before the distinction existed. It is deliberately
 * NOT read as "internal" — see {@link isExternalConveyance}.
 */
export type TransmittalKind = 'internal_release' | 'external';

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
  /** Business reason for the conveyance (for approval, construction, information, etc.). */
  purpose: string | null;
  /** See {@link TransmittalKind}. `null` on rows that predate the distinction. */
  kind: TransmittalKind | null;
  status: TransmittalStatus;
  /**
   * WHO RELEASED IT. `sender` above is a free-text addressee label and resolves to nobody; this is
   * the actor. `sendTransmittal(t)` took none, so the act of a document leaving the building kept a
   * timestamp and no signature.
   */
  sentBy: string | null;
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
  purpose?: string | null;
  /**
   * Omitted means `external`. A transmittal is document control's record of a conveyance out of the
   * business, so that is what one is unless the engineering reactor says otherwise — and the
   * default falls on the side that gets the stricter treatment.
   */
  kind?: TransmittalKind;
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
    purpose: input.purpose?.trim() || null,
    kind: input.kind ?? 'external',
    status: input.status ?? 'draft',
    sentBy: null,
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
/**
 * draft → sent: the conveyance happens and the document leaves the building.
 *
 * WHAT IS FROZEN FROM HERE. Recipients were already frozen at `sent` and items were not, so the list
 * of WHAT was conveyed could change after the conveyance while the list of WHO received it could
 * not. Both are frozen now, together with `sentBy` and `sentAt`: the state machine allows no second
 * send, so a correction is a NEW transmittal superseding this one, never an edit to the record of
 * what already went out.
 */
export function sendTransmittal(t: Transmittal, sentBy: string | null = null): Transmittal {
  assertTransmittalTransition(t.status, 'sent');
  return { ...touchT(t), status: 'sent', sentBy, sentAt: new Date().toISOString() };
}

/** Has this conveyance already happened? Once it has, what it conveyed cannot change. */
export function isConveyed(t: Transmittal): boolean {
  return t.status !== 'draft';
}

/**
 * Did this conveyance leave the business?
 *
 * ANYTHING NOT EXPLICITLY AN INTERNAL RELEASE COUNTS AS EXTERNAL, INCLUDING `null`. A historical row
 * carries no kind, and the two possible readings of that are not symmetric: calling an external
 * conveyance internal understates what was disclosed, while calling an internal one external only
 * asks for a signature that should have been there anyway. The cheaper mistake is the one to make.
 */
export function isExternalConveyance(t: Transmittal): boolean {
  return t.kind !== 'internal_release';
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
