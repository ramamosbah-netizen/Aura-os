import type { Id } from './id';
import type { AwardSource } from './crm';
import { QUALIFICATION_KEYS, qualificationView, type QualificationRecord } from './qualification-record';
import type { QualificationStatus, QualificationView } from './qualification-state';

/**
 * Qualification AT AWARD — the immutable historical record.
 *
 * WHY THIS EXISTS. The four BANT booleans stay writable after a deal closes. On 2026-08-26 an
 * awarded deal's `needConfirmed` was un-ticked ~90 minutes after its award, moving a CLOSED deal's
 * qualification from 1/4 to 0/4. Nothing was corrupted — AURA simply had no notion of "what was true
 * at award", so every figure it could show for a closed deal was the current one. No surface could
 * honestly say "Qualification at award: 3/4", and `qualification-badge.ts` was written to refuse to.
 *
 * This is a COMPLETE COPY, never a reference into the mutable record. A snapshot that pointed at
 * live data would not be a snapshot; it would be the same lie with an extra hop.
 *
 * VERSIONED because the qualification structure will keep evolving and history must not. A v1
 * document stays readable as v1 forever; a future v2 is written alongside it, and `readQualificationAtAward`
 * refuses what it does not understand rather than guessing — a misread historical record is worse
 * than an absent one.
 *
 * NOT BACKFILLED. A Won deal with no snapshot reads "Not captured", never a figure derived from
 * today's data. For the deal above we know the data changed after the award and we do not have the
 * 17:07 value; synthesising one would be a historical lie dressed as provenance.
 */
export const QUALIFICATION_SNAPSHOT_VERSION = 1;

export interface QualificationAtAward {
  version: typeof QUALIFICATION_SNAPSHOT_VERSION;
  /** When the snapshot was taken — the award's own timestamp, not a second `now()`. */
  capturedAt: string;
  /** The provenance that justified capturing. Never null: no provenance ⇒ no snapshot. */
  awardSource: AwardSource;
  /** The exact accepted quotation revision, when the award came from one. */
  awardedQuotationId: Id | null;
  /** The full per-dimension record as it stood at award. */
  dimensions: QualificationRecord;
}

export interface CaptureInput {
  record: QualificationRecord;
  awardSource: AwardSource;
  awardedQuotationId?: Id | null;
  capturedAt: string;
}

/**
 * Take the snapshot. Pure and deep-copied: the caller cannot hand back an object that later mutates
 * under the snapshot, and the snapshot cannot be edited through the record it came from.
 *
 * There is no `capture(opportunity)` overload on purpose — the caller must resolve the record and
 * the provenance explicitly, so no code path can capture a snapshot without having established that
 * a real award happened.
 */
export function captureQualificationAtAward(input: CaptureInput): QualificationAtAward {
  const dimensions = {} as QualificationRecord;
  for (const key of QUALIFICATION_KEYS) {
    const d = input.record[key];
    dimensions[key] = {
      status: d.status,
      evidence: d.evidence ?? null,
      source: d.source ?? null,
      confirmedBy: d.confirmedBy ?? null,
      confirmedAt: d.confirmedAt ?? null,
    };
  }
  return {
    version: QUALIFICATION_SNAPSHOT_VERSION,
    capturedAt: input.capturedAt,
    awardSource: input.awardSource,
    awardedQuotationId: input.awardedQuotationId ?? null,
    dimensions,
  };
}

const STATUSES: readonly QualificationStatus[] = ['UNKNOWN', 'CONFIRMED', 'CONCERN', 'BLOCKER'];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Read a stored snapshot back. Returns `null` — meaning "not captured" — for anything it cannot
 * fully understand: absent, wrong version, missing a dimension, an unrecognised status.
 *
 * Refusing is the correct failure mode here. A half-read snapshot would still be RENDERED as
 * history, so a lenient reader would put a fabricated figure under the words "at award". Null routes
 * the surface to "Not captured", which is always true when we cannot read the record.
 */
export function readQualificationAtAward(raw: unknown): QualificationAtAward | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== QUALIFICATION_SNAPSHOT_VERSION) return null;
  const capturedAt = str(raw.capturedAt);
  const awardSource = str(raw.awardSource) as AwardSource | null;
  if (!capturedAt || !awardSource) return null;
  if (!isRecord(raw.dimensions)) return null;

  const dimensions = {} as QualificationRecord;
  for (const key of QUALIFICATION_KEYS) {
    const d = raw.dimensions[key];
    if (!isRecord(d)) return null;
    const status = d.status as QualificationStatus;
    if (!STATUSES.includes(status)) return null;
    dimensions[key] = {
      status,
      evidence: str(d.evidence),
      source: str(d.source) as QualificationAtAward['dimensions'][keyof QualificationRecord]['source'],
      confirmedBy: str(d.confirmedBy),
      confirmedAt: str(d.confirmedAt),
    };
  }
  return {
    version: QUALIFICATION_SNAPSHOT_VERSION,
    capturedAt,
    awardSource,
    awardedQuotationId: str(raw.awardedQuotationId),
    dimensions,
  };
}

/** The snapshot rendered through the same view every qualification surface already speaks. */
export function qualificationAtAwardView(snapshot: QualificationAtAward): QualificationView {
  return qualificationView(snapshot.dimensions);
}

/**
 * What a CLOSED deal's qualification surface is allowed to claim.
 *
 * This is the one place that decides between history and the current record, so wording and
 * provenance can never drift apart again:
 *
 *   AT_AWARD     a snapshot exists — the figure is historical and may be labelled "at award".
 *   NOT_CAPTURED the deal is closed with no snapshot — say so; never substitute current data.
 *   CURRENT      the deal is open — there is no history yet, only the live record.
 */
export type QualificationProvenance =
  | { kind: 'AT_AWARD'; snapshot: QualificationAtAward; view: QualificationView }
  | { kind: 'NOT_CAPTURED' }
  | { kind: 'CURRENT' };

export function resolveQualificationProvenance(input: {
  terminal: boolean;
  atAward: QualificationAtAward | null;
}): QualificationProvenance {
  if (!input.terminal) return { kind: 'CURRENT' };
  if (!input.atAward) return { kind: 'NOT_CAPTURED' };
  return { kind: 'AT_AWARD', snapshot: input.atAward, view: qualificationAtAwardView(input.atAward) };
}
