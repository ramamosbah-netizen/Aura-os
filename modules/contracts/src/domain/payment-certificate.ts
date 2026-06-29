import { type Id, newId } from '@aura/shared';

// Payment Certificates domain — framework-free. An Interim Payment Certificate (IPC) is the
// periodic progress-billing instrument against a main Contract: the contractor applies for the
// value of work done to date, the engineer certifies it, retention is held (capped), advance is
// recovered, and the net of prior certificates is deducted — leaving the amount payable THIS
// period. It REFERENCES the contract (and the CRM account) by id + snapshot — never a DB join —
// so a spine consumer (e.g. finance AR) can raise the client invoice from the certified event alone.

export type CertificateStatus = 'draft' | 'submitted' | 'certified' | 'paid' | 'rejected';

export interface PaymentCertificate {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** The main contract being billed — reference + snapshot. */
  contractId: Id;
  contractTitle: string | null;
  contractValue: number;
  /** The client (CRM account), carried down by snapshot for AR. */
  accountId: Id | null;
  accountName: string | null;
  /** IPC number within the contract (1, 2, 3 …). */
  sequence: number;
  reference: string | null;
  periodStart: string | null; // date-only
  periodEnd: string | null; // date-only
  // ── inputs (all cumulative "to date") ──
  cumulativeWorkDone: number; // gross value of work executed to date
  materialsOnSite: number; // value of materials on site to date
  retentionPercent: number; // % retention held on work done
  retentionCapPercent: number; // retention cap as % of contract value (0 = uncapped)
  advanceRecoveredToDate: number; // advance payment recovered to date
  previousCertifiedNet: number; // net certified by prior certificates (paid-to-date)
  // ── computed ──
  grossToDate: number;
  retentionToDate: number;
  netCertifiedToDate: number;
  netThisCertificate: number; // amount payable this certificate
  // ── workflow ──
  status: CertificateStatus;
  createdAt: string;
  createdBy: Id | null;
  certifiedBy: Id | null;
  certifiedAt: string | null;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export interface CertificateInputs {
  contractValue: number;
  cumulativeWorkDone: number;
  materialsOnSite: number;
  retentionPercent: number;
  retentionCapPercent: number;
  advanceRecoveredToDate: number;
  previousCertifiedNet: number;
}

export interface CertificateMath {
  grossToDate: number;
  retentionToDate: number;
  netCertifiedToDate: number;
  netThisCertificate: number;
}

/**
 * Pure IPC certification math. Retention is held on *work done* (not materials), capped at
 * `retentionCapPercent` of the contract value; advance recovery and previously-certified net are
 * then deducted to leave the amount payable this certificate.
 */
export function computeCertificate(input: CertificateInputs): CertificateMath {
  const work = Math.max(0, Number(input.cumulativeWorkDone) || 0);
  const materials = Math.max(0, Number(input.materialsOnSite) || 0);
  const rp = Math.min(100, Math.max(0, Number(input.retentionPercent) || 0));
  const capPct = Math.max(0, Number(input.retentionCapPercent) || 0);
  const contractValue = Math.max(0, Number(input.contractValue) || 0);
  const advance = Math.max(0, Number(input.advanceRecoveredToDate) || 0);
  const prevNet = Number(input.previousCertifiedNet) || 0;

  const grossToDate = round2(work + materials);
  let retention = work * (rp / 100);
  if (capPct > 0 && contractValue > 0) {
    retention = Math.min(retention, contractValue * (capPct / 100));
  }
  const retentionToDate = round2(retention);
  const netCertifiedToDate = round2(grossToDate - retentionToDate - advance);
  const netThisCertificate = round2(netCertifiedToDate - prevNet);
  return { grossToDate, retentionToDate, netCertifiedToDate, netThisCertificate };
}

export interface NewPaymentCertificate {
  tenantId: Id;
  companyId?: Id | null;
  contractId: Id;
  contractTitle?: string | null;
  contractValue?: number;
  accountId?: Id | null;
  accountName?: string | null;
  sequence: number;
  reference?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  cumulativeWorkDone: number;
  materialsOnSite?: number;
  retentionPercent?: number;
  retentionCapPercent?: number;
  advanceRecoveredToDate?: number;
  previousCertifiedNet?: number;
  createdBy?: Id | null;
}

export function makePaymentCertificate(input: NewPaymentCertificate): PaymentCertificate {
  if (!input.contractId) throw new Error('contractId is required');
  const work = Number(input.cumulativeWorkDone);
  if (!Number.isFinite(work) || work < 0) throw new Error('cumulativeWorkDone must be zero or positive');
  const materials = Number(input.materialsOnSite ?? 0);
  if (!Number.isFinite(materials) || materials < 0) throw new Error('materialsOnSite must be zero or positive');
  const rp = Number(input.retentionPercent ?? 0);
  if (!Number.isFinite(rp) || rp < 0 || rp > 100) throw new Error('retentionPercent must be between 0 and 100');

  const inputs: CertificateInputs = {
    contractValue: Number(input.contractValue ?? 0),
    cumulativeWorkDone: work,
    materialsOnSite: materials,
    retentionPercent: rp,
    retentionCapPercent: Number(input.retentionCapPercent ?? 0),
    advanceRecoveredToDate: Number(input.advanceRecoveredToDate ?? 0),
    previousCertifiedNet: Number(input.previousCertifiedNet ?? 0),
  };
  const math = computeCertificate(inputs);

  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    contractId: input.contractId,
    contractTitle: input.contractTitle ?? null,
    contractValue: round2(inputs.contractValue),
    accountId: input.accountId ?? null,
    accountName: input.accountName ?? null,
    sequence: input.sequence,
    reference: input.reference?.trim() || `IPC-${String(input.sequence).padStart(3, '0')}`,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    cumulativeWorkDone: round2(work),
    materialsOnSite: round2(materials),
    retentionPercent: rp,
    retentionCapPercent: inputs.retentionCapPercent,
    advanceRecoveredToDate: round2(inputs.advanceRecoveredToDate),
    previousCertifiedNet: round2(inputs.previousCertifiedNet),
    grossToDate: math.grossToDate,
    retentionToDate: math.retentionToDate,
    netCertifiedToDate: math.netCertifiedToDate,
    netThisCertificate: math.netThisCertificate,
    status: 'draft',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
    certifiedBy: null,
    certifiedAt: null,
  };
}

export interface CertificateSummary {
  contractValue: number;
  certificateCount: number;
  grossCertifiedToDate: number;
  retentionHeld: number;
  netCertifiedToDate: number;
  percentComplete: number;
}

/**
 * Roll up a contract's certificates: the "to date" figures come from the latest *issued*
 * (certified/paid) certificate by sequence, since each one is cumulative.
 */
export function certificateSummary(contractValue: number, certs: PaymentCertificate[]): CertificateSummary {
  const issued = certs.filter((c) => c.status === 'certified' || c.status === 'paid');
  const latest = issued.reduce<PaymentCertificate | null>(
    (acc, c) => (!acc || c.sequence > acc.sequence ? c : acc),
    null,
  );
  const cv = Math.max(0, Number(contractValue) || 0);
  const grossCertifiedToDate = latest?.grossToDate ?? 0;
  return {
    contractValue: round2(cv),
    certificateCount: certs.length,
    grossCertifiedToDate: round2(grossCertifiedToDate),
    retentionHeld: round2(latest?.retentionToDate ?? 0),
    netCertifiedToDate: round2(latest?.netCertifiedToDate ?? 0),
    percentComplete: cv > 0 ? round2((grossCertifiedToDate / cv) * 100) : 0,
  };
}

/** Sum the net of prior *issued* certificates — the paid-to-date baseline for the next IPC. */
export function priorCertifiedNet(certs: PaymentCertificate[]): number {
  return round2(
    certs
      .filter((c) => c.status === 'certified' || c.status === 'paid')
      .reduce((sum, c) => sum + (Number(c.netThisCertificate) || 0), 0),
  );
}

/** Payment-certificate events on the spine. `certified` is the AR trigger for finance. */
export const CERTIFICATE_EVENT = {
  created: 'contracts.ipc.created',
  submitted: 'contracts.ipc.submitted',
  certified: 'contracts.ipc.certified',
  paid: 'contracts.ipc.paid',
  rejected: 'contracts.ipc.rejected',
} as const;
