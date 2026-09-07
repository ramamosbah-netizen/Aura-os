import { describe, expect, it } from 'vitest';
import { evaluateProjectRules, assessProject, type ProjectFacts } from './project-assessment';

const facts = (over: Partial<ProjectFacts> = {}): ProjectFacts => ({
  status: 'active',
  wbsNodes: 4,
  wbsCosted: 4,
  cbsNodes: 3,
  cpi: 1.05,
  spi: 1.02,
  variationsPending: 0,
  delaysOpen: 0,
  eotsAwaitingDecision: 0,
  closeoutExists: true,
  closeoutItems: 5,
  closeoutDone: 5,
  closeoutFinalized: false,
  ...over,
});

const codes = (f: ProjectFacts) => evaluateProjectRules(f).map((x) => x.code);

describe('project rules', () => {
  it('a healthy running project raises nothing that demands action', () => {
    expect(codes(facts())).toEqual(['READY_TO_CLOSE']);
    expect(assessProject(evaluateProjectRules(facts()), facts()).needsAttention).toBe(false);
  });

  it('an unplanned project is reported as unplanned, not as costed-but-empty', () => {
    expect(codes(facts({ wbsNodes: 0, wbsCosted: 0 }))).toContain('NO_SCOPE_BASELINE');
    // Only one of the two fires: a project with no scope has not "failed to cost" it.
    expect(codes(facts({ wbsNodes: 0, wbsCosted: 0 }))).not.toContain('SCOPE_NOT_COSTED');
  });

  it('scope that exists but carries no value is a distinct finding', () => {
    expect(codes(facts({ wbsCosted: 0 }))).toContain('SCOPE_NOT_COSTED');
  });

  it('reads the performance indices at their own definition, not a tuned threshold', () => {
    expect(codes(facts({ cpi: 0.99 }))).toContain('COST_OVERRUN');
    expect(codes(facts({ cpi: 1 }))).not.toContain('COST_OVERRUN');
    expect(codes(facts({ spi: 0.5 }))).toContain('SCHEDULE_SLIPPING');
  });

  it('open change is surfaced per kind, so the action is unambiguous', () => {
    const c = codes(facts({ variationsPending: 2, delaysOpen: 1, eotsAwaitingDecision: 3 }));
    expect(c).toEqual(expect.arrayContaining(['CHANGE_PENDING_DECISION', 'DELAY_UNRESOLVED', 'EOT_AWAITING_DECISION']));
  });

  it('stops judging performance once the project is over', () => {
    const done = facts({ status: 'completed', cpi: 0.4, spi: 0.4, variationsPending: 9 });
    expect(codes(done)).not.toContain('COST_OVERRUN');
    expect(codes(done)).not.toContain('CHANGE_PENDING_DECISION');
  });

  it('a finished project is assessed only on what still has an answer', () => {
    const done = facts({ status: 'completed' });
    expect(assessProject(evaluateProjectRules(done), done).coverage.required).toEqual(['CLOSEOUT_READINESS']);
  });

  it('missing EVM is UNVERIFIABLE, never a silent pass', () => {
    const blind = facts({ cpi: null, spi: null });
    const { coverage } = assessProject(evaluateProjectRules(blind), blind);
    expect(coverage.unverifiable).toEqual(expect.arrayContaining(['COST_PERFORMANCE', 'SCHEDULE_PERFORMANCE']));
    expect(coverage.assessed).not.toContain('COST_PERFORMANCE');
    // And the absence of findings must not read as reassurance.
    expect(coverage.attentionCount).toBe(0);
    expect(coverage.required).toContain('COST_PERFORMANCE');
  });

  it('a project with no closeout has not passed the closeout check', () => {
    const f = facts({ closeoutExists: false });
    const { coverage } = assessProject(evaluateProjectRules(f), f);
    expect(coverage.unverifiable).toContain('CLOSEOUT_READINESS');
    expect(coverage.assessed).not.toContain('CLOSEOUT_READINESS');
  });

  it('being ready to close is information, not a demand on anyone', () => {
    const f = facts();
    const a = assessProject(evaluateProjectRules(f), f);
    expect(a.findings.map((x) => x.code)).toContain('READY_TO_CLOSE');
    expect(a.coverage.attentionCount).toBe(0);
  });

  it('an incomplete closeout counts what remains', () => {
    const f = facts({ closeoutDone: 2 });
    expect(evaluateProjectRules(f).find((x) => x.code === 'CLOSEOUT_INCOMPLETE')?.data).toEqual({ remaining: 3, total: 5 });
  });

  it('a finalized closeout is not still asking to be finished', () => {
    expect(codes(facts({ closeoutFinalized: true }))).not.toContain('READY_TO_CLOSE');
  });
});
