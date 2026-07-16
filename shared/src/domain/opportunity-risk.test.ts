import { describe, it, expect } from 'vitest';
import {
  makeRisk, updateRisk, setRiskStatus, riskSeverity, riskSummary, worstOpenSeverity,
} from './opportunity-risk';
import { assessOpportunityHealth } from './opportunity-health';
import { stakeholderCoverage } from './opportunity-depth';
import { registerSummary } from './deal-register';
import { commitmentSummary } from './opportunity-depth';
import { buyingJourneyAlignment } from './buying-journey';

const risk = (over: Partial<Parameters<typeof makeRisk>[0]> = {}) =>
  makeRisk({ tenantId: 't1', opportunityId: 'o1', title: 'Budget may be cut', ...over });

describe('riskSeverity matrix', () => {
  it('high × high → CRITICAL, high × medium → HIGH, medium × medium → MEDIUM, low × low → LOW', () => {
    expect(riskSeverity('high', 'high')).toBe('CRITICAL');
    expect(riskSeverity('high', 'medium')).toBe('HIGH');
    expect(riskSeverity('medium', 'high')).toBe('HIGH');
    expect(riskSeverity('medium', 'medium')).toBe('MEDIUM');
    expect(riskSeverity('low', 'high')).toBe('MEDIUM');
    expect(riskSeverity('low', 'low')).toBe('LOW');
  });
});

describe('makeRisk / updateRisk', () => {
  it('starts OPEN and derives severity', () => {
    const r = risk({ likelihood: 'high', impact: 'high' });
    expect(r.status).toBe('OPEN');
    expect(r.severity).toBe('CRITICAL');
  });
  it('recomputes severity when likelihood/impact change', () => {
    const r = updateRisk(risk({ likelihood: 'low', impact: 'low' }), { impact: 'high', likelihood: 'high' });
    expect(r.severity).toBe('CRITICAL');
  });
  it('setRiskStatus moves the lifecycle', () => {
    expect(setRiskStatus(risk(), 'MITIGATING').status).toBe('MITIGATING');
  });
});

describe('riskSummary', () => {
  it('counts open risks by severity and flags attention on open critical/high', () => {
    const risks = [
      risk({ likelihood: 'high', impact: 'high' }),                       // CRITICAL open
      setRiskStatus(risk({ likelihood: 'high', impact: 'medium' }), 'MITIGATING'), // HIGH open (mitigating)
      setRiskStatus(risk({ likelihood: 'low', impact: 'low' }), 'RESOLVED'),       // closed
    ];
    const s = riskSummary(risks);
    expect(s).toMatchObject({ total: 3, open: 2, mitigating: 1, openCritical: 1, openHigh: 1, needsAttention: true });
  });
  it('resolved/accepted risks do not need attention', () => {
    const risks = [setRiskStatus(risk({ likelihood: 'high', impact: 'high' }), 'ACCEPTED')];
    expect(riskSummary(risks).needsAttention).toBe(false);
    expect(worstOpenSeverity(risks)).toBeNull();
  });
});

describe('health engine — explicit risks weigh on their home dimension', () => {
  // A worked, commercially-real deal: only the risk register varies per test.
  const healthy = {
    stage: 'negotiation',
    execution: { hasOwner: true, hasNextAction: true, nextActionDueIso: '2026-07-20T00:00:00Z', lastActivityIso: '2026-07-14T00:00:00Z' },
    coverage: stakeholderCoverage([{ id: 's', tenantId: 't', opportunityId: 'o', contactId: null, contactName: 'Jane', role: 'DECISION_MAKER', influence: 'high', decisionPower: true, sentiment: 'champion', isChampion: true, isPrimary: true, notes: null, createdAt: '', updatedAt: '' }]),
    commercial: { value: 100_000, closeDateIso: '2026-09-30' },
    competitorsNamed: true,
    commitments: commitmentSummary([]),
    register: registerSummary([]),
    alignment: buyingJourneyAlignment('won', null), // not assessed
    now: new Date('2026-07-15T00:00:00Z'),
  };

  it('an open critical commercial risk makes the deal BLOCKED and floors the band', () => {
    const r = risk({ type: 'COMMERCIAL', likelihood: 'high', impact: 'high' }); // CRITICAL
    const h = assessOpportunityHealth({ ...healthy, risks: [r] });
    const com = h.dimensions.find((d) => d.key === 'commercial')!;
    expect(com.reasons.some((x) => /critical commercial risk/.test(x))).toBe(true);
    expect(h.state).toBe('BLOCKED');
    expect(h.stateReason).toContain('Budget may be cut');
  });

  // NB: the fixture's one-person committee legitimately dents the relationship dimension,
  // so these assert the absence of RISK trouble, not a perfect deal.
  it('no risk register → no risk reasons and no BLOCKED verdict', () => {
    const h = assessOpportunityHealth({ ...healthy, risks: [] });
    expect(h.state).not.toBe('BLOCKED');
    expect(h.reasons.some((x) => /risk/.test(x))).toBe(false);
  });

  it('stays backward-compatible when risks input is omitted', () => {
    const h = assessOpportunityHealth(healthy);
    expect(h.state).not.toBe('BLOCKED');
  });
});
