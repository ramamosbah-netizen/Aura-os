import { describe, it, expect } from 'vitest';
import { makeOpportunity, type Opportunity } from './crm';
import { buildDealFacts, type DealFactsInput, type DealFacts } from './deal-facts';
import { evaluateDealRules } from './deal-rules';
import { assessDeal } from './deal-assessment';
import { resolveAssessment } from './assessment-state';
import type { Finding } from './deal-findings';

// The pipeline: DealFacts -> rules -> findings -> assessment -> UI.
//
// Severities are CHARACTERIZED from the tones the 360 already used, so centralizing the logic must
// not change which records look like they need work. Anything deliberately corrected is named.

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  ...makeOpportunity({ tenantId: 't1', title: 'Marina Gate ELV', value: 0, executionType: 'direct_sale' }),
  ...over,
});
const facts = (over: Partial<DealFactsInput> = {}): DealFacts => buildDealFacts({
  opportunity: opp(), stakeholders: [], quotations: [], contracts: [], projects: [], ...over,
});
const codes = (f: Finding[]) => f.map((x) => x.code);
const governedWon = opp({ stage: 'won', awardSource: 'quotation_accepted', awardedQuotationId: 'q-1', contractedValue: 33986.67 });

describe('rules emit findings; every finding carries its provenance', () => {
  it('each finding names the rule that concluded it', () => {
    const { findings } = evaluateDealRules(facts());
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.source).toBeTruthy();
      expect(['ATTENTION', 'INFO']).toContain(f.severity);
    }
  });

  it('an empty open deal: attention gaps, thin qualification, open outcome', () => {
    const { findings } = evaluateDealRules(facts());
    expect(codes(findings)).toEqual(['ATTENTION_GAPS', 'QUALIFICATION_COVERAGE_LOW', 'OUTCOME_OPEN']);
  });

  it('CHARACTERIZED severities — warn/bad became ATTENTION, accent/neutral became INFO', () => {
    const { findings } = evaluateDealRules(facts({ opportunity: opp({ competitors: 'Rival ELV' }) }));
    const bySeverity = Object.fromEntries(findings.map((f) => [f.code, f.severity]));
    expect(bySeverity.ATTENTION_GAPS).toBe('ATTENTION');
    expect(bySeverity.QUALIFICATION_COVERAGE_LOW).toBe('ATTENTION');
    expect(bySeverity.OUTCOME_OPEN).toBe('INFO');
    expect(bySeverity.COMPETITIVE_DEAL).toBe('INFO');
  });

  it('WON_NOT_QUOTED stays INFO — deliberately NOT promoted while centralizing', () => {
    const { findings } = evaluateDealRules(facts({ opportunity: opp({ stage: 'won' }) }));
    expect(findings.find((f) => f.code === 'WON_NOT_QUOTED')!.severity).toBe('INFO');
  });

  it('a LEGACY_WON deal is flagged; a GOVERNED_WON deal is not', () => {
    expect(codes(evaluateDealRules(facts({ opportunity: opp({ stage: 'won' }) })).findings)).toContain('AWARD_NOT_EVIDENCED');
    expect(codes(evaluateDealRules(facts({ opportunity: governedWon })).findings)).not.toContain('AWARD_NOT_EVIDENCED');
  });

  it('competitors: UNKNOWN never produces a finding (absence is not a competitor)', () => {
    expect(codes(evaluateDealRules(facts()).findings)).not.toContain('COMPETITIVE_DEAL');
  });
});

describe('assessDeal — aggregation only', () => {
  it('counts ONLY attention findings; informational notes never raise the count', () => {
    const findings: Finding[] = [
      { code: 'OUTCOME_OPEN', severity: 'INFO', source: 'outcomeState' },
      { code: 'NEXT_ACTION_SCHEDULED', severity: 'INFO', source: 'nextOpenActivity' },
    ];
    expect(assessDeal(findings, { terminal: false, attentionActive: true }).coverage.attentionCount).toBe(0);
    expect(assessDeal(findings, { terminal: false, attentionActive: true }).needsAttention).toBe(false);
  });

  it('an OPEN deal declares the pursuit checks; DEAL_ATTENTION only when the rule is in scope', () => {
    expect(assessDeal([], { terminal: false, attentionActive: true }).coverage.assessed).toEqual(['QUALIFICATION', 'NEXT_ACTION', 'DEAL_ATTENTION']);
    expect(assessDeal([], { terminal: false, attentionActive: false }).coverage.assessed).toEqual(['QUALIFICATION', 'NEXT_ACTION']);
  });

  it('a CLOSED deal declares post-award checks and assesses NONE of them', () => {
    const c = assessDeal([], { terminal: true, attentionActive: false }).coverage;
    expect(c.required).toEqual(['CUSTOMER_AWARD_EVIDENCE', 'CONTRACT_HANDOVER']);
    expect(c.assessed).toEqual([]);
  });

  it('THE END-TO-END INVARIANT: a governed win with no findings still resolves NOT_ASSESSED', () => {
    // The original bug in full: silence on a closed deal must never read as health.
    const { findings, coverage } = evaluateDealRules(facts({ opportunity: governedWon }));
    const a = assessDeal(findings, coverage);
    expect(a.findings).toEqual([]);
    expect(resolveAssessment(a.coverage).state).toBe('NOT_ASSESSED');
  });

  it('an open deal with real gaps resolves ATTENTION_REQUIRED', () => {
    const { findings, coverage } = evaluateDealRules(facts());
    expect(resolveAssessment(assessDeal(findings, coverage).coverage).state).toBe('ATTENTION_REQUIRED');
  });

  it('full coverage with nothing wrong resolves HEALTHY', () => {
    const clean = facts({
      opportunity: opp({ needConfirmed: true, budgetConfirmed: true, ownerId: 'u-1', closeDate: '2026-12-01', stage: 'proposal' }),
      engagement: { nextOpenActivity: { subject: 'Call', dueDate: '2026-12-01', assigneeId: 'u-1' } },
    });
    const { findings, coverage } = evaluateDealRules(clean, new Date('2026-08-26T00:00:00Z'));
    const a = assessDeal(findings, coverage);
    expect(a.needsAttention).toBe(false);
    expect(resolveAssessment(a.coverage).state).toBe('HEALTHY');
  });
});

describe('the boundary itself', () => {
  it('assessDeal is total over any finding list — it never re-derives from a record', () => {
    // It takes findings and two booleans. There is no fact tree to reach into, by construction.
    const a = assessDeal([{ code: 'AWARD_NOT_EVIDENCED', severity: 'ATTENTION', source: 'awardEvidence' }], { terminal: true, attentionActive: false });
    expect(a.needsAttention).toBe(true);
    expect(a.coverage.attentionCount).toBe(1);
  });

  it('carries no wording, tone, colour, icon or href', () => {
    const { findings, coverage } = evaluateDealRules(facts({ opportunity: opp({ competitors: 'Rival' }) }));
    const json = JSON.stringify(assessDeal(findings, coverage));
    for (const forbidden of ['tone', 'color', 'colour', 'href', 'icon', 'onClick', 'Weakly', 'attention required']) {
      expect(json).not.toContain(forbidden);
    }
  });
});
