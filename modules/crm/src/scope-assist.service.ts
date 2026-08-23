import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, newId } from '@aura/shared';
import { AiService } from '@aura/core';
import { CRM_SCOPE_ASSIST_STORE, type ScopeAssistStore } from './scope-assist-store';
import { CRM_PRE_AWARD_STORE, type PreAwardStore } from './pre-award-store';
import { PreAwardPackageService } from './pre-award-package.service';
import type { EstimationBasisRevision, BasisLine } from './domain/pre-award-package';
import {
  type ScopeAssistProposal, type SuggestedScopeItem, type ScopeAssumption, type ScopeGap,
  type EvidenceRef, type EvidenceKind, type EvidenceFingerprintInput,
  makeScopeAssistProposal, acceptProposal, supersedeProposal, filterToInScopeEvidence, fingerprintEvidence, contentHash,
} from './domain/scope-assist';

/** One evidence record, in scope for (tenant, opportunity), with the text the model may ground on. */
interface EvidenceRecord {
  kind: EvidenceKind;
  sourceId: Id;
  sourceRef: string | null;
  text: string;
  quantity: number | null;
  unit: string | null;
  contentHash: string;
}

export interface ScopeAssistProposalView extends ScopeAssistProposal {
  /** DERIVED at read time: the evidence set changed since this proposal was generated. Never stored. */
  evidenceStale: boolean;
}

/**
 * AURA Scope Assist (Slice 5) — grounded, read-only scope suggestion over a deal's OWN evidence.
 * `generate` reads requirements + scopes strictly scoped to (tenant, opportunity), asks the model for a
 * scope, then DROPS anything not cited to an in-scope source; `accept` spins the suggestion off into an
 * editable draft basis (Accept ≠ Approve). It changes no other lifecycle state and does no pricing.
 */
@Injectable()
export class ScopeAssistService {
  private readonly logger = new Logger('CRM-ScopeAssist');
  constructor(
    @Inject(CRM_SCOPE_ASSIST_STORE) private readonly store: ScopeAssistStore,
    @Inject(CRM_PRE_AWARD_STORE) private readonly evidence: PreAwardStore,
    private readonly ai: AiService,
    private readonly packages: PreAwardPackageService,
  ) {}

  /** Gather the in-scope evidence pool. This is the ONLY source of allowed provenance ids. */
  private async gatherEvidence(tenantId: Id, opportunityId: Id): Promise<EvidenceRecord[]> {
    const [reqs, scopes] = await Promise.all([
      this.evidence.listRequirements(tenantId, opportunityId),
      this.evidence.listScopes(tenantId, opportunityId),
    ]);
    const records: EvidenceRecord[] = [];
    for (const r of reqs) {
      if (r.status === 'dropped') continue;
      records.push({
        kind: 'requirement', sourceId: r.id, sourceRef: r.title,
        text: `${r.priority.toUpperCase()} requirement: ${r.title}${r.detail ? ` — ${r.detail}` : ''}`,
        quantity: null, unit: null, contentHash: contentHash(r.title, r.detail, r.priority, r.status),
      });
    }
    for (const s of scopes) {
      for (const l of s.lines) {
        records.push({
          kind: 'scope-line', sourceId: l.id, sourceRef: s.title,
          text: `${l.discipline ? `${l.discipline}: ` : ''}${l.description} (${l.quantity} ${l.unit})`,
          quantity: l.quantity, unit: l.unit, contentHash: contentHash(l.description, l.discipline, l.quantity, l.unit),
        });
      }
    }
    return records;
  }

  private fingerprint(records: EvidenceRecord[]): string {
    const inputs: EvidenceFingerprintInput[] = records.map((r) => ({ kind: r.kind, sourceId: r.sourceId, contentHash: r.contentHash }));
    return fingerprintEvidence(inputs);
  }

  /**
   * Generate a suggested scope. Writes ONLY a proposal row — no package, estimate, pricing or quotation.
   */
  async generate(input: { tenantId: Id; companyId?: Id | null; opportunityId: Id; actorId?: Id | null }): Promise<ScopeAssistProposal> {
    const { tenantId, opportunityId } = input;
    const records = await this.gatherEvidence(tenantId, opportunityId);
    const allowed = new Set(records.map((r) => r.sourceId));
    const evidenceFingerprint = this.fingerprint(records);

    let items: SuggestedScopeItem[] = [];
    let assumptions: ScopeAssumption[] = [];
    let gaps: ScopeGap[] = [];
    let generator = 'heuristic';

    if (records.length === 0) {
      gaps = [{ id: newId(), question: 'No requirements or scope captured yet for this deal — add them so a scope can be grounded in evidence.', hint: null }];
    } else {
      const ai = await this.tryModel(records).catch((e) => { this.logger.warn(`Scope Assist model failed: ${e}`); return null; });
      if (ai) {
        // Keep only items whose EVERY citation is in-scope — isolation + anti-hallucination boundary.
        const { kept, dropped } = filterToInScopeEvidence(ai.items, allowed);
        items = kept;
        assumptions = ai.assumptions;
        gaps = ai.gaps;
        generator = ai.generator;
        if (dropped.length) {
          this.logger.warn(`Scope Assist dropped ${dropped.length} item(s) citing out-of-scope evidence.`);
          gaps = [...gaps, { id: newId(), question: `${dropped.length} suggested item(s) were discarded because they were not backed by this deal's evidence.`, hint: 'Re-run once more evidence is captured, or add them manually.' }];
        }
      }
      // Fallback / floor: if the model gave nothing usable, ground deterministically on the evidence.
      if (items.length === 0) {
        items = this.heuristicItems(records);
        if (generator !== 'heuristic') generator = `${generator}+heuristic`;
      }
    }

    const prior = await this.store.listForOpportunity(tenantId, opportunityId);
    const version = (prior[0]?.version ?? 0) + 1;
    // Regenerate = a new version. Still-open SUGGESTED proposals are superseded; accepted ones are history.
    for (const p of prior) {
      const s = supersedeProposal(p);
      if (s !== p) await this.store.save(s);
    }

    const proposal = makeScopeAssistProposal({
      tenantId, companyId: input.companyId ?? null, opportunityId, version, evidenceFingerprint, generator,
      items, assumptions, gaps, generatedBy: input.actorId ?? null,
    });
    await this.store.save(proposal);
    this.logger.log(`Scope Assist v${version} generated for opportunity ${opportunityId} (${generator}, ${items.length} item(s))`);
    return proposal;
  }

  /** Deterministic grounding: each evidence record becomes one evidence-backed item. Always in-scope. */
  private heuristicItems(records: EvidenceRecord[]): SuggestedScopeItem[] {
    return records.map((r) => {
      const provenance: EvidenceRef[] = [{ kind: r.kind, sourceId: r.sourceId, sourceRef: r.sourceRef, excerpt: r.text.slice(0, 160) }];
      const description = r.kind === 'scope-line' ? r.text.replace(/\s*\(\d.*\)\s*$/, '').trim() : r.sourceRef ?? r.text;
      return { id: newId(), description: description || r.text, unit: r.unit ?? 'no', quantity: r.quantity, provenance };
    });
  }

  /** Ask the model for a grounded scope. Throws on any provider/parse failure so the caller falls back. */
  private async tryModel(records: EvidenceRecord[]): Promise<{ items: SuggestedScopeItem[]; assumptions: ScopeAssumption[]; gaps: ScopeGap[]; generator: string } | null> {
    const evidenceBlock = records.map((r) => `- [${r.kind} #${r.sourceId}] ${r.text}`).join('\n');
    const system = [
      'You are AURA Scope Assist. From the EVIDENCE below and ONLY it, propose a project scope for an ELV/MEP deal.',
      'Rules you MUST follow:',
      '1. Every scope ITEM must be backed by evidence and cite at least one provenance.sourceId that appears in the evidence list. Use the exact ids given.',
      '2. Never invent scope that the evidence does not support. If you infer something, put it under "assumptions". If information is missing, put a question under "gaps".',
      '3. Do NOT estimate cost or price. Scope only: description, unit, and quantity (use null when the evidence gives no quantity).',
      'Return STRICT JSON only, no prose, of shape:',
      '{"items":[{"description":str,"unit":str,"quantity":number|null,"provenance":[{"kind":str,"sourceId":str,"excerpt":str}]}],"assumptions":[{"statement":str,"rationale":str}],"gaps":[{"question":str,"hint":str}]}',
    ].join('\n');
    const user = `EVIDENCE (the only sources you may cite):\n${evidenceBlock}`;

    const result = await this.ai.complete({ system, messages: [{ role: 'user', content: user }], maxTokens: 4000 });
    const text = result.text ?? '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null; // not JSON (e.g. local echo provider) → caller falls back
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      items?: Array<{ description?: string; unit?: string; quantity?: number | null; provenance?: Array<{ kind?: string; sourceId?: string; sourceRef?: string; excerpt?: string }> }>;
      assumptions?: Array<{ statement?: string; rationale?: string }>;
      gaps?: Array<{ question?: string; hint?: string }>;
    };

    const items: SuggestedScopeItem[] = (parsed.items ?? [])
      .filter((i) => i && typeof i.description === 'string' && i.description.trim())
      .map((i) => ({
        id: newId(),
        description: String(i.description).trim(),
        unit: (i.unit && String(i.unit).trim()) || 'no',
        quantity: i.quantity === null || i.quantity === undefined ? null : (Number.isFinite(Number(i.quantity)) ? Number(i.quantity) : null),
        provenance: (i.provenance ?? [])
          .filter((p) => p && typeof p.sourceId === 'string')
          .map((p) => ({ kind: (p.kind as EvidenceKind) ?? 'requirement', sourceId: String(p.sourceId), sourceRef: p.sourceRef ?? null, excerpt: p.excerpt ?? null })),
      }));
    const assumptions: ScopeAssumption[] = (parsed.assumptions ?? [])
      .filter((a) => a && typeof a.statement === 'string' && a.statement.trim())
      .map((a) => ({ id: newId(), statement: String(a.statement).trim(), rationale: a.rationale ? String(a.rationale) : null }));
    const gaps: ScopeGap[] = (parsed.gaps ?? [])
      .filter((gp) => gp && typeof gp.question === 'string' && gp.question.trim())
      .map((gp) => ({ id: newId(), question: String(gp.question).trim(), hint: gp.hint ? String(gp.hint) : null }));

    return { items, assumptions, gaps, generator: result.provider || 'claude' };
  }

  /**
   * Accept a suggested proposal — spins it off into an EDITABLE draft basis (opening the package if
   * needed) and stamps the proposal accepted. This is NOT approval: the basis stays draft for the human
   * to edit and then approve independently.
   */
  async accept(input: { tenantId: Id; companyId?: Id | null; opportunityId: Id; proposalId: Id; actorId?: Id | null }): Promise<{ proposal: ScopeAssistProposal; basis: EstimationBasisRevision }> {
    const p = await this.store.get(input.tenantId, input.proposalId);
    if (!p || p.opportunityId !== input.opportunityId) throw new Error(`scope assist proposal ${input.proposalId} not found`);
    if (p.status !== 'suggested') throw new Error(`only a suggested proposal can be accepted — v${p.version} is already ${p.status}`);

    const pkg = await this.packages.openDirect({ tenantId: input.tenantId, companyId: input.companyId ?? p.companyId, opportunityId: input.opportunityId, createdBy: input.actorId });
    const lines: BasisLine[] = p.items.map((it) => ({
      lineId: it.id,
      description: it.description,
      unit: it.unit,
      quantity: it.quantity ?? 0,
      sourceLineId: it.provenance[0]?.sourceId ?? it.id,
    }));
    const basis = await this.packages.addScopeBasis({
      tenantId: input.tenantId, companyId: input.companyId ?? p.companyId, packageId: pkg.id,
      sourceId: p.id, sourceRevRef: `scope-assist:v${p.version}`, lines, createdBy: input.actorId,
    });
    const accepted = acceptProposal(p, input.actorId ?? null, basis.id);
    await this.store.save(accepted);
    this.logger.log(`Scope Assist v${p.version} accepted for opportunity ${input.opportunityId} → draft basis ${basis.id}`);
    return { proposal: accepted, basis };
  }

  /** Read all proposals for a deal, DERIVING evidence-staleness from the current evidence set. */
  async read(tenantId: Id, opportunityId: Id): Promise<ScopeAssistProposalView[]> {
    const [proposals, records] = await Promise.all([
      this.store.listForOpportunity(tenantId, opportunityId),
      this.gatherEvidence(tenantId, opportunityId),
    ]);
    const currentFingerprint = this.fingerprint(records);
    return proposals.map((p) => ({ ...p, evidenceStale: p.evidenceFingerprint !== currentFingerprint }));
  }
}
