import { type Id, newId } from './id';

// Document Evidence — what a decision REQUIRES, and whether it has been produced.
//
// This is deliberately NOT an attachment system. There is no file, no byte, no storage key
// here — that layer already exists and is not this one's job: `shared/src/dms/document.ts`
// defines the kernel substrate (Document + immutable DocumentVersion + storageKey + checksum).
// It is currently declared and unused, because the decision it waits on is the storage backend
// behind `storageKey`, not the model.
//
// So the seam is already drawn: `DOCUMENT_ID` evidence holds a `Document.id` from that module.
// The day a storage backend lands, evidence starts pointing at real bytes and nothing here —
// no caller, no score, no risk signal — has to change. Requirements say what a decision NEEDS;
// the DMS says what a file IS. Keeping them apart is what stops a per-module attachment blob
// from being invented a third time.
//
// What it gives now: a decision can state its own readiness. "Approve this AED 5M quote" is a
// different question when the vendor quotes are missing, and until now nothing in the system
// could express that.
//
// Framework-free and deterministic, so API, UI, risk signals and tests share one rule set.

export type DocumentRequirementType =
  | 'TECHNICAL_PROPOSAL'
  | 'COMMERCIAL_OFFER'
  | 'VENDOR_QUOTE'
  | 'DATASHEET'
  | 'DRAWING'
  | 'METHOD_STATEMENT'
  | 'WARRANTY_LETTER'
  | 'COMPLIANCE_CERTIFICATE'
  | 'OTHER';

export const DOCUMENT_REQUIREMENT_TYPES: readonly DocumentRequirementType[] = [
  'TECHNICAL_PROPOSAL', 'COMMERCIAL_OFFER', 'VENDOR_QUOTE', 'DATASHEET', 'DRAWING',
  'METHOD_STATEMENT', 'WARRANTY_LETTER', 'COMPLIANCE_CERTIFICATE', 'OTHER',
];

/**
 * REQUIRED  — needed and not yet produced.
 * PROVIDED  — evidence recorded (see `evidence`).
 * WAIVED    — consciously accepted as absent; counts as settled, and WHO waived it is kept.
 * NOT_APPLICABLE — does not apply to this deal at all; excluded from the score entirely.
 */
export type DocumentRequirementStatus = 'REQUIRED' | 'PROVIDED' | 'WAIVED' | 'NOT_APPLICABLE';

/**
 * How the evidence is anchored. `DOCUMENT_ID` is the forward-compatible one — it will point at
 * a Kernel DMS document once that exists. The others let a real desk record what it actually
 * has today (a transmittal number, a supplier's emailed PDF reference, or a human confirming
 * they have seen it) instead of blocking on a storage layer.
 */
export type DocumentEvidenceType =
  | 'DOCUMENT_ID'
  | 'EXTERNAL_REFERENCE'
  | 'TRANSMITTAL'
  | 'MANUAL_CONFIRMATION';

export interface DocumentEvidence {
  type: DocumentEvidenceType;
  /** Document id, transmittal number, URL, or the note behind a manual confirmation. */
  reference: string;
  checkedBy: string | null;
  checkedAt: string;
}

export interface DocumentRequirement {
  id: Id;
  tenantId: Id;
  /** The thing that needs the evidence — 'opportunity' | 'quotation' | 'tender' | … */
  entityType: string;
  entityId: Id;
  type: DocumentRequirementType;
  status: DocumentRequirementStatus;
  /** How many of this type the decision needs. Vendor quotes are the reason this is not a boolean. */
  requiredCount: number;
  /** Evidence recorded so far; `length` is compared against `requiredCount`. */
  evidence: DocumentEvidence[];
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDocumentRequirement {
  tenantId: Id;
  entityType: string;
  entityId: Id;
  type: DocumentRequirementType;
  requiredCount?: number;
  note?: string | null;
}

export function makeDocumentRequirement(input: NewDocumentRequirement, now = new Date()): DocumentRequirement {
  const count = Math.max(1, Math.floor(input.requiredCount ?? 1));
  const iso = now.toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    entityType: input.entityType,
    entityId: input.entityId,
    type: input.type,
    status: 'REQUIRED',
    requiredCount: count,
    evidence: [],
    note: input.note?.trim() || null,
    createdAt: iso,
    updatedAt: iso,
  };
}

/**
 * Record one piece of evidence. The requirement only flips to PROVIDED once ENOUGH evidence
 * exists — one of three vendor quotes is still a gap, and calling it satisfied is precisely
 * the lie this model is meant to prevent.
 */
export function addEvidence(
  r: DocumentRequirement,
  evidence: Omit<DocumentEvidence, 'checkedAt'> & { checkedAt?: string },
  now = new Date(),
): DocumentRequirement {
  if (r.status === 'NOT_APPLICABLE') throw new Error('cannot attach evidence to a not-applicable requirement');
  if (!evidence.reference?.trim()) throw new Error('evidence reference is required');
  const list = [
    ...r.evidence,
    { ...evidence, reference: evidence.reference.trim(), checkedAt: evidence.checkedAt ?? now.toISOString() },
  ];
  return {
    ...r,
    evidence: list,
    status: list.length >= r.requiredCount ? 'PROVIDED' : 'REQUIRED',
    updatedAt: now.toISOString(),
  };
}

/** Waiving is a decision, so it records who made it — an unattributed waiver is not a control. */
export function waiveRequirement(r: DocumentRequirement, by: string | null, reason: string, now = new Date()): DocumentRequirement {
  if (!reason?.trim()) throw new Error('a waiver needs a reason');
  return {
    ...r,
    status: 'WAIVED',
    note: reason.trim(),
    evidence: [
      ...r.evidence,
      { type: 'MANUAL_CONFIRMATION', reference: `waived: ${reason.trim()}`, checkedBy: by, checkedAt: now.toISOString() },
    ],
    updatedAt: now.toISOString(),
  };
}

export function setNotApplicable(r: DocumentRequirement, now = new Date()): DocumentRequirement {
  return { ...r, status: 'NOT_APPLICABLE', updatedAt: now.toISOString() };
}

export type ReadinessVerdict = 'READY' | 'NEARLY_READY' | 'NOT_READY';

export interface DecisionReadiness {
  /** Percent of applicable requirements settled. NOT_APPLICABLE is excluded from both sides. */
  score: number;
  settled: number;
  applicable: number;
  verdict: ReadinessVerdict;
  /** Types still outstanding, worst first — what to chase. */
  missing: Array<{ type: DocumentRequirementType; have: number; need: number }>;
  waived: DocumentRequirementType[];
}

/**
 * Evidence completeness for one decision.
 *
 * A partially-evidenced requirement counts as NOT settled: 1 of 3 vendor quotes leaves the cost
 * uncertain, which is the whole reason to ask. The score is deliberately whole-requirement, not
 * a weighted fraction of documents — 90% of the paperwork with the vendor quotes missing is not
 * a 90% decision.
 */
export function decisionReadiness(requirements: DocumentRequirement[]): DecisionReadiness {
  const applicable = requirements.filter((r) => r.status !== 'NOT_APPLICABLE');
  const settled = applicable.filter((r) => r.status === 'PROVIDED' || r.status === 'WAIVED');
  const missing = applicable
    .filter((r) => r.status === 'REQUIRED')
    .map((r) => ({ type: r.type, have: r.evidence.length, need: r.requiredCount }))
    .sort((a, b) => a.have - b.have || a.type.localeCompare(b.type));

  const score = applicable.length === 0 ? 100 : Math.round((settled.length / applicable.length) * 100);
  const verdict: ReadinessVerdict = missing.length === 0 ? 'READY' : score >= 80 ? 'NEARLY_READY' : 'NOT_READY';

  return {
    score,
    settled: settled.length,
    applicable: applicable.length,
    verdict,
    missing,
    waived: applicable.filter((r) => r.status === 'WAIVED').map((r) => r.type),
  };
}

/**
 * The default evidence a commercial decision asks for. Deliberately small — a checklist nobody
 * can complete gets ignored, and every entry here has to be worth blocking an approval over.
 * Vendor quotes default to 3 because a single supplier price is not a market test.
 */
export const COMMERCIAL_EVIDENCE_TEMPLATE: ReadonlyArray<{ type: DocumentRequirementType; requiredCount: number }> = [
  { type: 'TECHNICAL_PROPOSAL', requiredCount: 1 },
  { type: 'COMMERCIAL_OFFER', requiredCount: 1 },
  { type: 'VENDOR_QUOTE', requiredCount: 3 },
  { type: 'DATASHEET', requiredCount: 1 },
];
