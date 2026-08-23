import { type Id, newId } from '@aura/shared';

// AURA Scope Assist (Slice 5) — a GROUNDED, read-only assistant that reads a deal's own evidence and
// proposes a scope the human then accepts, edits, and approves. It is deliberately NOT a scope author:
//
//   Evidence → Scope Assist → Suggested Scope Draft → Human Accept → Editable Scope Draft
//            → Human Approve → EstimationBasisRevision
//
// Hard rules encoded here (the service enforces the rest):
//   • Generation changes NO lifecycle state and creates no Estimate/Pricing/Quotation.
//   • Every suggested ITEM is evidence-backed — it carries ≥1 provenance ref to a real in-scope source.
//     Anything the model asserts WITHOUT a valid in-scope citation is dropped, never silently kept.
//   • What can't be evidenced is surfaced as an ASSUMPTION or a GAP/QUESTION — never folded into scope.
//   • Accept ≠ Approve: accept only stamps the proposal + spins off an editable draft basis; approval
//     stays an independent human command on that basis.
//   • A proposal is IMMUTABLE once generated. If evidence later changes we DERIVE `evidenceStale` at
//     read time (never rewrite the record) and offer Regenerate, which produces a NEW version.
//   • No AI estimation, no pricing recommendation — scope only.

export type EvidenceKind = 'requirement' | 'scope-line' | 'document' | 'opportunity';

/** A real pointer back to the source an item was drawn from — the anti-hallucination anchor. */
export interface EvidenceRef {
  kind: EvidenceKind;
  /** The source record's id (a requirement id, a scope-line id, …) — MUST be an in-scope source. */
  sourceId: Id;
  /** A human locator within the source (e.g. a scope title, a document clause). */
  sourceRef?: string | null;
  /** A short verbatim excerpt from the source, for the reviewer to check the citation. */
  excerpt?: string | null;
}

/** An evidence-backed scope line the assistant proposes. Never valid without ≥1 provenance ref. */
export interface SuggestedScopeItem {
  id: Id;
  description: string;
  unit: string;
  /** Null when the evidence does not state a quantity — a gap, not a guess. */
  quantity: number | null;
  provenance: EvidenceRef[];
}

/** Something the assistant inferred that is NOT directly evidenced — shown for the human to confirm. */
export interface ScopeAssumption {
  id: Id;
  statement: string;
  rationale?: string | null;
}

/** A missing fact the human must resolve — the assistant asks rather than filling it silently. */
export interface ScopeGap {
  id: Id;
  question: string;
  hint?: string | null;
}

export type ScopeAssistStatus = 'suggested' | 'accepted' | 'superseded';

export interface ScopeAssistProposal {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  opportunityId: Id;
  version: number;
  status: ScopeAssistStatus;
  /** Fingerprint of the evidence set this was generated from — lets a reader DERIVE staleness. */
  evidenceFingerprint: string;
  /** Which provider produced it (`claude` | `local` | `heuristic`) — provenance of the suggestion itself. */
  generator: string;
  items: SuggestedScopeItem[];
  assumptions: ScopeAssumption[];
  gaps: ScopeGap[];
  generatedBy: Id | null;
  generatedAt: string;
  acceptedBy: Id | null;
  acceptedAt: string | null;
  /** The editable draft basis revision that accepting this proposal produced. */
  acceptedBasisRevisionId: Id | null;
  createdAt: string;
}

export interface NewScopeAssistProposal {
  tenantId: Id;
  companyId?: Id | null;
  opportunityId: Id;
  version: number;
  evidenceFingerprint: string;
  generator: string;
  items: SuggestedScopeItem[];
  assumptions?: ScopeAssumption[];
  gaps?: ScopeGap[];
  generatedBy?: Id | null;
}

export function makeScopeAssistProposal(input: NewScopeAssistProposal, now = new Date()): ScopeAssistProposal {
  if (input.version < 1) throw new Error('proposal version must be > 0');
  const ts = now.toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    opportunityId: input.opportunityId,
    version: input.version,
    status: 'suggested',
    evidenceFingerprint: input.evidenceFingerprint,
    generator: input.generator,
    items: input.items.map((i) => ({ ...i })),
    assumptions: (input.assumptions ?? []).map((a) => ({ ...a })),
    gaps: (input.gaps ?? []).map((g) => ({ ...g })),
    generatedBy: input.generatedBy ?? null,
    generatedAt: ts,
    acceptedBy: null,
    acceptedAt: null,
    acceptedBasisRevisionId: null,
    createdAt: ts,
  };
}

/** Accept — suggested → accepted, recording who accepted and the draft basis it produced. Immutable after. */
export function acceptProposal(p: ScopeAssistProposal, by: Id | null, basisRevisionId: Id, now = new Date()): ScopeAssistProposal {
  if (p.status !== 'suggested') {
    throw new Error(`only a suggested proposal can be accepted — v${p.version} is already ${p.status}`);
  }
  return { ...p, status: 'accepted', acceptedBy: by, acceptedAt: now.toISOString(), acceptedBasisRevisionId: basisRevisionId };
}

/** Supersede a still-open SUGGESTED proposal when a newer one is generated. Accepted ones are historical. */
export function supersedeProposal(p: ScopeAssistProposal): ScopeAssistProposal {
  if (p.status !== 'suggested') return p; // never touch accepted/already-superseded history
  return { ...p, status: 'superseded' };
}

// ── Provenance validation — the anti-hallucination + isolation boundary ───────────────────
//
// The service builds `allowedSourceIds` STRICTLY from evidence it read for (tenantId, opportunityId).
// Every item is kept only if ALL its provenance refs point at an allowed source; a single out-of-scope
// citation (a stale, cross-opportunity, or cross-TENANT id — however good the semantic match) drops the
// whole item. This runs regardless of what the model returned, so isolation can't be prompted away.

export interface ProvenanceFilterResult {
  kept: SuggestedScopeItem[];
  dropped: SuggestedScopeItem[];
}

export function filterToInScopeEvidence(items: SuggestedScopeItem[], allowedSourceIds: ReadonlySet<Id>): ProvenanceFilterResult {
  const kept: SuggestedScopeItem[] = [];
  const dropped: SuggestedScopeItem[] = [];
  for (const item of items) {
    const refs = item.provenance ?? [];
    const inScope = refs.length > 0 && refs.every((r) => allowedSourceIds.has(r.sourceId));
    (inScope ? kept : dropped).push(item);
  }
  return { kept, dropped };
}

// ── Evidence fingerprint — stable, order-independent hash of the evidence set ──────────────
//
// Two proposals generated from the same evidence share a fingerprint; a changed/added/removed source
// changes it. Content is folded in (not just ids) so an EDITED requirement is detected as a change.

export interface EvidenceFingerprintInput {
  kind: EvidenceKind;
  sourceId: Id;
  contentHash: string;
}

export function fingerprintEvidence(refs: EvidenceFingerprintInput[]): string {
  const canonical = refs
    .map((r) => `${r.kind}:${r.sourceId}:${r.contentHash}`)
    .sort()
    .join('|');
  return fnv1aHex(canonical);
}

/** A tiny stable content hash for one source's material fields. */
export function contentHash(...parts: Array<string | number | null | undefined>): string {
  return fnv1aHex(parts.map((p) => (p == null ? '' : String(p))).join(''));
}

function fnv1aHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
