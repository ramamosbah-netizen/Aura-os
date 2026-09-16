import { randomUUID } from 'node:crypto';

/**
 * §22 — a transmittal goes to PEOPLE, and only they can say it arrived (ENG-05, ENG-06).
 *
 * A conveyance had one `recipient` column of free text and an acknowledgement any permitted user
 * could make. Two things follow from that, and they are the two things the frozen criteria ask for:
 *
 *   WHO IT WENT TO. A For Construction release reaches a Site Engineer, a Project Engineer and a
 *   Buyer — three people who need it for different reasons. One text field holds one of them and
 *   resolves to nobody.
 *
 *   WHO SAID IT ARRIVED. A receipt signed by somebody who was never sent the document is not a
 *   receipt; it is a second person's opinion that it probably arrived. `acknowledgeTransmittal`
 *   checked a permission and recorded the actor, so any holder could acknowledge a conveyance
 *   addressed to someone else — and the document controller would read it as delivered.
 *
 * PARTIAL RECEIPT IS NOT RECEIPT. Three named recipients and one acknowledgement is one person
 * confirming, not three. The conveyance reaches `acknowledged` only when every named recipient has
 * answered, and until then "the Buyer has it, Site has not" stays readable per person — which is
 * the fact a chase is started from, and the fact a single status destroys.
 */

/** The capacity somebody receives in — not their job title. */
export const TRANSMITTAL_PARTIES = [
  'site_engineer',
  'project_engineer',
  'procurement',
  'consultant',
  'client',
  'other',
] as const;

export type TransmittalParty = (typeof TRANSMITTAL_PARTIES)[number];

export interface TransmittalRecipient {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  transmittalId: string;
  /** The platform account addressed. Canonical: "only the recipient may acknowledge" needs one. */
  userId: string;
  party: TransmittalParty;
  acknowledgedAt: string | null;
  acknowledgedNote: string | null;
  createdAt: string;
}

export interface NewTransmittalRecipient {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  transmittalId: string;
  userId: string;
  party?: TransmittalParty | string | null;
}

export function toTransmittalParty(value: TransmittalParty | string | null | undefined): TransmittalParty {
  const candidate = (value ?? '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (TRANSMITTAL_PARTIES as readonly string[]).includes(candidate) ? (candidate as TransmittalParty) : 'other';
}

export function makeTransmittalRecipient(input: NewTransmittalRecipient): TransmittalRecipient {
  if (!input.transmittalId) throw new Error('transmittalId is required');
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.userId?.trim()) throw new Error('a transmittal recipient must name a platform user');
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    transmittalId: input.transmittalId,
    userId: input.userId.trim(),
    party: toTransmittalParty(input.party),
    acknowledgedAt: null,
    acknowledgedNote: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Record that THIS person received it.
 *
 * Refuses a second acknowledgement rather than overwriting the first: a receipt is a thing that
 * happened at a time, and re-signing it would move the date somebody is relying on.
 */
export function acknowledgeAsRecipient(
  recipient: TransmittalRecipient,
  input: { at?: string; note?: string | null } = {},
): TransmittalRecipient {
  if (recipient.acknowledgedAt) {
    throw new Error(`${recipient.userId} has already acknowledged this transmittal on ${recipient.acknowledgedAt}`);
  }
  return {
    ...recipient,
    acknowledgedAt: input.at ?? new Date().toISOString(),
    acknowledgedNote: input.note?.trim() || null,
  };
}

/**
 * May this actor acknowledge this conveyance, and why not?
 *
 * Separate from the permission deliberately. Holding `doccontrol.transmittal.acknowledge` says you
 * are the kind of person who acknowledges conveyances; being ON the distribution says this one was
 * sent to you. Both are required, and the second is the one that was missing.
 */
export function recipientFor(
  recipients: readonly TransmittalRecipient[],
  actorId: string | null,
): TransmittalRecipient | null {
  if (!actorId) return null;
  return recipients.find((candidate) => candidate.userId === actorId) ?? null;
}

export interface TransmittalReceipt {
  /** Every named recipient, with their own answer. */
  recipients: TransmittalRecipient[];
  acknowledgedCount: number;
  /** True only when EVERY named recipient has answered — see the header. */
  fullyAcknowledged: boolean;
  /** Who has not, so a chase reaches the right person rather than the whole distribution. */
  outstanding: TransmittalRecipient[];
}

/**
 * The state of receipt across a distribution.
 *
 * A conveyance with NO named recipients is NOT fully acknowledged. Nobody was addressed, so nobody
 * received it, and reporting "all recipients have acknowledged" over an empty list is the emptiest
 * kind of true statement — the one that reads as delivered.
 */
export function receiptOf(recipients: readonly TransmittalRecipient[]): TransmittalReceipt {
  const all = [...recipients];
  const outstanding = all.filter((candidate) => candidate.acknowledgedAt === null);
  return {
    recipients: all,
    acknowledgedCount: all.length - outstanding.length,
    fullyAcknowledged: all.length > 0 && outstanding.length === 0,
    outstanding,
  };
}
