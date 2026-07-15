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

describe('health engine — risks dimension', () => {
  const healthy = {
    coverage: stakeholderCoverage([{ id: 's', tenantId: 't', opportunityId: 'o', contactId: null, contactName: 'Jane', role: 'DECISION_MAKER', influence: 'high', decisionPower: true, sentiment: 'champion', isChampion: true, isPrimary: true, notes: null, createdAt: '', updatedAt: '' }]),
    commitments: commitmentSummary([]),
    register: registerSummary([]),
    alignment: buyingJourneyAlignment('won', null), // not assessed
  };

  it('an open critical risk drops overall health to CRITICAL', () => {
    const rs = riskSummary([risk({ likelihood: 'high', impact: 'high' })]);
    const h = assessOpportunityHealth({ ...healthy, risks: rs });
    const dim = h.dimensions.find((d) => d.key === 'risks')!;
    expect(dim.applicable).toBe(true);
    expect(dim.band).toBe('CRITICAL');
    expect(h.band).toBe('CRITICAL'); // worst dimension floors the overall band
    expect(h.reasons.some((r) => /critical risk/.test(r))).toBe(true);
  });

  it('the risks dimension is not applicable when there is no risk register', () => {
    const h = assessOpportunityHealth({ ...healthy, risks: riskSummary([]) });
    expect(h.dimensions.find((d) => d.key === 'risks')!.applicable).toBe(false);
  });

  it('stays backward-compatible when risks input is omitted', () => {
    const h = assessOpportunityHealth(healthy);
    expect(h.dimensions.find((d) => d.key === 'risks')!.applicable).toBe(false);
  });
});
