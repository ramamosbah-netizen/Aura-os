import type { Id } from './id';
import {
  QUALIFICATION_LABEL,
  summariseQualification,
  type QualificationDimension,
  type QualificationKey,
  type QualificationSource,
  type QualificationStatus,
  type QualificationView,
} from './qualification-state';

/**
 * Phase 2 — qualification as an EVIDENCE-BEARING record instead of four booleans.
 *
 * Phase 1 built the four-state vocabulary (UNKNOWN / CONFIRMED / CONCERN / BLOCKER) over an adapter
 * because the store could only hold `boolean NOT NULL DEFAULT false`. That adapter can express a
 * status and nothing else, which means CONCERN and BLOCKER were unreachable and a CONFIRMED
 * dimension could never say WHY it was believable. This is the store-side shape that closes both:
 * per dimension, a status plus the evidence, the source, who confirmed it and when.
 *
 * Two rules hold this together and both are load-bearing:
 *
 *  1. THE RECORD IS AUTHORITATIVE WHEN IT EXISTS; the four booleans become its derived shadow —
 *     the same relationship `executionType` already has with `requiresTender`. There is exactly one
 *     writer (`mergeQualificationRecord`) and exactly one resolver (`resolveQualificationRecord`),
 *     so the two representations cannot drift into disagreeing about the same deal.
 *
 *  2. ABSENCE IS NEVER FABRICATED. A deal that predates Phase 2 has `qualification = null` and is
 *     read through the boolean adapter: status only, `source: null`, `confirmedAt: null`. It is
 *     tempting to backfill those as `source: 'checkbox', confirmedAt: createdAt` — that would be
 *     inventing provenance we do not have, which is the exact failure this model exists to remove.
 *
 * Nothing here decides qualified/disqualified. Coverage is described, never judged.
 */
export interface QualificationEntry {
  status: QualificationStatus;
  /** What makes this believable. Null on CONFIRMED = an assertion nobody can audit. */
  evidence: string | null;
  /** Where the status came from. Null = not recorded (a pre-Phase-2 dimension), never "none". */
  source: QualificationSource | null;
  /** Who last set this status. Null = not recorded. */
  confirmedBy: Id | null;
  /** When this status was last set (ISO). Null = not recorded. */
  confirmedAt: string | null;
}

export type QualificationRecord = Record<QualificationKey, QualificationEntry>;

export const QUALIFICATION_KEYS: readonly QualificationKey[] = ['budget', 'authority', 'need', 'timeline'];

/** The four boolean columns, in the shape the opportunity row carries them. */
export interface QualificationFlags {
  budgetConfirmed: boolean;
  authorityConfirmed: boolean;
  needConfirmed: boolean;
  timelineConfirmed: boolean;
}

const FLAG_OF: Record<QualificationKey, keyof QualificationFlags> = {
  budget: 'budgetConfirmed',
  authority: 'authorityConfirmed',
  need: 'needConfirmed',
  timeline: 'timelineConfirmed',
};

const unrecorded = (status: QualificationStatus): QualificationEntry => ({
  status,
  evidence: null,
  source: null,
  confirmedBy: null,
  confirmedAt: null,
});

/**
 * The legacy adapter, at record level. Same lossy-but-safe mapping as `qualificationFromFlags`:
 * `true → CONFIRMED`, `false → UNKNOWN` (an absence, never a "no"). Provenance stays null because
 * the booleans carry none — see rule 2 above.
 */
export function qualificationRecordFromFlags(flags: QualificationFlags): QualificationRecord {
  return {
    budget: unrecorded(flags.budgetConfirmed ? 'CONFIRMED' : 'UNKNOWN'),
    authority: unrecorded(flags.authorityConfirmed ? 'CONFIRMED' : 'UNKNOWN'),
    need: unrecorded(flags.needConfirmed ? 'CONFIRMED' : 'UNKNOWN'),
    timeline: unrecorded(flags.timelineConfirmed ? 'CONFIRMED' : 'UNKNOWN'),
  };
}

/**
 * THE resolver — the one place that answers "what is this deal's qualification right now".
 * Stored record wins; otherwise the booleans are adapted. Every reader (facts, badge, snapshot
 * capture, API payload) goes through here so a deal can never be qualified two different ways
 * depending on which surface asked.
 */
export function resolveQualificationRecord(
  opportunity: QualificationFlags & { qualification?: QualificationRecord | null },
): QualificationRecord {
  const stored = opportunity.qualification;
  if (!stored) return qualificationRecordFromFlags(opportunity);
  // Defensive: a stored record missing a dimension (an older version, hand-edited jsonb) falls back
  // to that dimension's boolean rather than throwing or silently reading UNKNOWN.
  const fallback = qualificationRecordFromFlags(opportunity);
  return {
    budget: stored.budget ?? fallback.budget,
    authority: stored.authority ?? fallback.authority,
    need: stored.need ?? fallback.need,
    timeline: stored.timeline ?? fallback.timeline,
  };
}

/** The derived shadow: which dimensions are CONFIRMED. CONCERN and BLOCKER are NOT confirmations. */
export function qualificationFlagsOf(record: QualificationRecord): QualificationFlags {
  return {
    budgetConfirmed: record.budget.status === 'CONFIRMED',
    authorityConfirmed: record.authority.status === 'CONFIRMED',
    needConfirmed: record.need.status === 'CONFIRMED',
    timelineConfirmed: record.timeline.status === 'CONFIRMED',
  };
}

/** One dimension's patch. Only supplied keys move; `evidence: null` clears it explicitly. */
export interface QualificationDimensionPatch {
  status?: QualificationStatus;
  evidence?: string | null;
  source?: QualificationSource | null;
}

export type QualificationPatch = Partial<Record<QualificationKey, QualificationDimensionPatch>>;

/**
 * THE writer. Merges a sparse patch into the record and stamps WHO and WHEN on every dimension the
 * patch actually moves — never on the ones it leaves alone, so an edit to Budget does not silently
 * re-date Authority's confirmation.
 *
 * Evidence and status are deliberately coupled in one direction: leaving CONFIRMED drops the
 * evidence, because the evidence was evidence FOR a confirmation that no longer stands. Carrying it
 * forward onto an UNKNOWN would leave a dimension nobody has established still displaying a proof.
 */
export function mergeQualificationRecord(
  current: QualificationRecord,
  patch: QualificationPatch,
  stamp: { actorId: Id | null; at: string },
): QualificationRecord {
  const next = { ...current };
  for (const key of QUALIFICATION_KEYS) {
    const p = patch[key];
    if (!p) continue;
    const before = current[key];
    const status = p.status ?? before.status;
    const evidenceGiven = p.evidence !== undefined;
    const evidence = evidenceGiven ? (p.evidence?.trim() || null) : before.evidence;
    const changed = status !== before.status || (evidenceGiven && evidence !== before.evidence) || (p.source !== undefined && p.source !== before.source);
    if (!changed) continue;
    next[key] = {
      status,
      // A dimension that has left CONFIRMED has nothing to evidence.
      evidence: status === 'CONFIRMED' ? evidence : null,
      source: p.source !== undefined ? p.source : before.source,
      confirmedBy: stamp.actorId,
      confirmedAt: stamp.at,
    };
  }
  return next;
}

/** Record → the Phase 1 view every surface already renders, now carrying provenance per dimension. */
export function qualificationView(record: QualificationRecord): QualificationView {
  const dims: QualificationDimension[] = QUALIFICATION_KEYS.map((key) => ({
    key,
    label: QUALIFICATION_LABEL[key],
    status: record[key].status,
    evidence: record[key].evidence,
    source: record[key].source,
    confirmedBy: record[key].confirmedBy,
    confirmedAt: record[key].confirmedAt,
  }));
  return summariseQualification(dims);
}

/** The boolean-side patch the legacy checkbox still sends, expressed as a record patch. */
export function patchFromFlagUpdates(updates: Partial<QualificationFlags>): QualificationPatch {
  const patch: QualificationPatch = {};
  for (const key of QUALIFICATION_KEYS) {
    const flag = updates[FLAG_OF[key]];
    if (flag === undefined) continue;
    // The checkbox can only ever say CONFIRMED or "not confirmed". Un-ticking returns the dimension
    // to UNKNOWN — an absence — and must never be read as the customer answering no.
    patch[key] = { status: flag ? 'CONFIRMED' : 'UNKNOWN', source: flag ? 'checkbox' : null };
  }
  return patch;
}
