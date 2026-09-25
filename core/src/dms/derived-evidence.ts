import { Injectable } from '@nestjs/common';
import type { DocumentEvidence, DocumentRequirement, DocumentRequirementType } from '@aura/shared';

/**
 * EVIDENCE THAT IS COMPUTED, NOT ATTACHED.
 *
 * Most requirements on a decision are met by somebody recording evidence: a transmittal number, a
 * document id, a confirmation. A few must not be, because typing a reference is exactly the act
 * the requirement exists to distrust. "Three supplier quotations" is the case that made this: three
 * references anybody can type are three files to please a checklist, and the programme owner's rule
 * is that they must be three INDEPENDENT suppliers on confirmed revisions, linked to the bid's scope,
 * technically judged, commercially compared, and covering the WHOLE supply scope — not three quotes
 * on one camera standing in for a CCTV system.
 *
 * A provider owns one (entity type, requirement type) pair and says, for one record, whether its
 * rule applies and what the evidence currently is. The registry OVERLAYS that onto the stored rows
 * when a checklist is read or an approval is decided. Nothing is written: the answer is recomputed
 * every time, so it moves when the evidence moves — an offer expiring, a verdict superseded.
 *
 * Two rules keep this honest:
 *   * a decision already taken is not overwritten — a WAIVED or NOT_APPLICABLE row stays exactly as
 *     the person who decided it left it;
 *   * a provider that fails makes the requirement NOT met, with no evidence — not the stored row,
 *     which may predate the rule and still hold hand-typed references. The check fails closed.
 *
 * The answer is live only while the decision is open. The decision writes the computed rows it was
 * taken on, and from then the provider answers FROZEN: the stored row is the record, and offers
 * expiring next month do not make an approved bid read as unapproved evidence.
 */

export interface DerivedEvidenceVerdict {
  /** False when the rule does not govern this record — it keeps ordinary, attached evidence. */
  applies: boolean;
  satisfied: boolean;
  /** How many units of evidence the decision needs, in the provider's own terms. */
  requiredCount: number;
  evidence: DocumentEvidence[];
  /** The provider's full breakdown, for a reader who needs to see why. */
  detail?: unknown;
  /**
   * The decision has been taken: the stored row is what it was taken on, and is shown as it stands.
   * Still governed — nobody may attach evidence to a decided record by hand either.
   */
  frozen?: boolean;
}

export interface DerivedEvidenceProvider {
  readonly entityType: string;
  readonly requirementType: DocumentRequirementType;
  derive(tenantId: string, entityId: string): Promise<DerivedEvidenceVerdict>;
}

const key = (entityType: string, type: string): string => `${entityType}::${type}`;

@Injectable()
export class DerivedEvidenceRegistry {
  private readonly providers = new Map<string, DerivedEvidenceProvider>();

  register(provider: DerivedEvidenceProvider): void {
    const k = key(provider.entityType, provider.requirementType);
    // Two providers for one pair would give one requirement two answers.
    if (this.providers.has(k)) throw new Error(`a derived-evidence provider for ${k} is already registered`);
    this.providers.set(k, provider);
  }

  /** The provider's verdict for one row, or null when no provider governs it or it failed. */
  async verdictFor(row: Pick<DocumentRequirement, 'tenantId' | 'entityType' | 'entityId' | 'type'>): Promise<DerivedEvidenceVerdict | null> {
    const provider = this.providers.get(key(row.entityType, row.type));
    if (!provider) return null;
    try {
      const verdict = await provider.derive(row.tenantId, row.entityId);
      return verdict.applies ? verdict : null;
    } catch {
      return null; // no verdict to show; `overlay` is what decides, and it fails closed
    }
  }

  /** Whether this row's evidence is computed, so a person may not attach it by hand. */
  async isDerived(row: Pick<DocumentRequirement, 'tenantId' | 'entityType' | 'entityId' | 'type'>): Promise<boolean> {
    const provider = this.providers.get(key(row.entityType, row.type));
    if (!provider) return false;
    try {
      return (await provider.derive(row.tenantId, row.entityId)).applies;
    } catch {
      // A provider that governs this pair but cannot answer still governs it: refusing a hand-typed
      // reference is the safe side of not knowing.
      return true;
    }
  }

  /** The stored rows with every derived requirement replaced by its current computed state. */
  async overlay(rows: DocumentRequirement[]): Promise<DocumentRequirement[]> {
    return (await this.overlayMarked(rows)).rows;
  }

  /**
   * `overlay`, and which of the rows are COMPUTED — so a checklist can say "counted from the supplier
   * quotations" instead of showing a number a reader would take for attachments. One derivation per
   * row: marking them separately would compute every governed requirement twice.
   */
  async overlayMarked(rows: DocumentRequirement[]): Promise<{ rows: DocumentRequirement[]; derivedIds: string[] }> {
    const out: DocumentRequirement[] = [];
    const derivedIds: string[] = [];
    for (const row of rows) {
      if (row.status === 'WAIVED' || row.status === 'NOT_APPLICABLE') { out.push(row); continue; }
      const provider = this.providers.get(key(row.entityType, row.type));
      if (!provider) { out.push(row); continue; }
      let verdict: DerivedEvidenceVerdict;
      try {
        verdict = await provider.derive(row.tenantId, row.entityId);
      } catch {
        derivedIds.push(row.id);
        /**
         * FAIL CLOSED, and not merely by keeping the stored row: a row written before this rule
         * existed can still hold hand-typed references, and a failure must not let them count again.
         * A governed requirement whose evidence cannot be computed right now is not met right now.
         */
        out.push({ ...row, evidence: [], status: 'REQUIRED' });
        continue;
      }
      if (!verdict.applies) { out.push(row); continue; }
      derivedIds.push(row.id);
      if (verdict.frozen) { out.push(row); continue; }
      out.push({
        ...row,
        requiredCount: Math.max(1, verdict.requiredCount),
        evidence: verdict.evidence,
        status: verdict.satisfied ? 'PROVIDED' : 'REQUIRED',
      });
    }
    return { rows: out, derivedIds };
  }
}
