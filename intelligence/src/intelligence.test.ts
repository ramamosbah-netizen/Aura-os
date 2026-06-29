import { describe, expect, it } from 'vitest';
import { type DomainEvent, makeEvent } from '@aura/shared';
import { buildBriefingPrompt } from './briefing';
import { emptyFunnel, foldPipeline, winRate } from './pipeline';
import { computeDecay, sourceWeight } from './pricing.service';
import { resolveMode } from './autonomy.service';

function ev(type: string, value?: number): DomainEvent {
  return makeEvent({
    type,
    tenantId: 't1',
    aggregateType: 'x',
    aggregateId: 'a',
    payload: value === undefined ? {} : { value },
  });
}

describe('intelligence pipeline projection', () => {
  it('folds deal-chain events into a funnel with summed values', () => {
    const f = foldPipeline([
      ev('crm.account.created'),
      ev('tendering.tender.created', 1000),
      ev('tendering.tender.created', 500),
      ev('contracts.contract.created', 800),
      ev('projects.project.created', 800),
    ]);
    expect(f.accounts).toBe(1);
    expect(f.tenders).toBe(2);
    expect(f.tenderValue).toBe(1500);
    expect(f.contracts).toBe(1);
    expect(f.contractValue).toBe(800);
    expect(f.projects).toBe(1);
    expect(f.projectValue).toBe(800);
  });

  it('ignores non-deal-chain events (including its own insight events)', () => {
    const f = foldPipeline([ev('dms.document.created'), ev('intelligence.insight.generated')]);
    expect(f).toEqual(emptyFunnel());
  });

  it('computes conversion as contracts per tender, null when no tenders', () => {
    const f = foldPipeline([
      ev('tendering.tender.created', 0),
      ev('tendering.tender.created', 0),
      ev('contracts.contract.created', 0),
    ]);
    expect(winRate(f)).toBe(0.5);
    expect(winRate(emptyFunnel())).toBeNull();
  });

  it('coerces a missing/garbage value to 0', () => {
    const f = foldPipeline([ev('tendering.tender.created')]);
    expect(f.tenders).toBe(1);
    expect(f.tenderValue).toBe(0);
  });
});

describe('intelligence briefing prompt', () => {
  it('includes the pipeline numbers under an executive-copilot system prompt', () => {
    const f = foldPipeline([ev('crm.account.created'), ev('tendering.tender.created', 1250000)]);
    const req = buildBriefingPrompt(f);
    expect(req.system).toMatch(/executive copilot/i);
    expect(req.messages[0].role).toBe('user');
    expect(req.messages[0].content).toContain('1,250,000');
    expect(req.messages[0].content).toMatch(/Tenders: 1/);
  });

  it('renders conversion as a percentage', () => {
    const f = foldPipeline([ev('tendering.tender.created', 0), ev('contracts.contract.created', 0)]);
    expect(buildBriefingPrompt(f).messages[0].content).toContain('100%');
  });
});

describe('IEC pricing engine formulas', () => {
  it('calculates trust decay based on age in days', () => {
    // 0 days age should have no decay (trust = 1.0)
    expect(computeDecay(0)).toBeCloseTo(1.0);
    // 180 days age should decay to approximately 50%
    expect(computeDecay(180)).toBeCloseTo(0.5, 1);
    // very old should decay to near-zero
    expect(computeDecay(1000)).toBeLessThan(0.05);
  });

  it('resolves correct trust weight per source type', () => {
    expect(sourceWeight('po')).toBe(1.0);
    expect(sourceWeight('subcontract')).toBe(0.9);
    expect(sourceWeight('quote')).toBe(0.6);
    expect(sourceWeight('invalid_type')).toBe(0.5);
  });
});

describe('AURA autonomy engine modes', () => {
  it('resolves to operate mode under safety thresholds', () => {
    // Under limit (<= 10000 AND <= 5% variance) -> operate
    expect(resolveMode(5000, 3)).toBe('operate');
    expect(resolveMode(10000, 5)).toBe('operate');
    expect(resolveMode(10000, -5)).toBe('operate');
  });

  it('forces assist mode when exceeding safety thresholds', () => {
    // Exceeds value limit -> assist
    expect(resolveMode(10001, 2)).toBe('assist');
    // Exceeds variance limit -> assist
    expect(resolveMode(2000, 6)).toBe('assist');
    expect(resolveMode(2000, -6)).toBe('assist');
  });
});

