import { describe, expect, it } from 'vitest';
import {
  AMC_RENEWAL_WINDOW_DAYS, WARRANTY_WINDOW_DAYS,
  deriveGrowthFindings, makeInstalledBaseItem, systemCoverage,
} from './domain/installed-base';

const NOW = new Date('2026-07-16T12:00:00Z');
const inDays = (n: number): string => new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);

const item = (over: Partial<Parameters<typeof makeInstalledBaseItem>[0]> = {}) =>
  makeInstalledBaseItem({ tenantId: 't1', accountId: 'acc-1', system: 'cctv', provider: 'us', ...over });

describe('systemCoverage (§26 — the white-space board)', () => {
  it('classifies ours / competitor / mixed / missing per system', () => {
    const cov = systemCoverage([
      item({ system: 'cctv', provider: 'us' }),
      item({ system: 'access_control', provider: 'competitor', competitorName: 'RivalCo' }),
      item({ system: 'bms', provider: 'us' }),
      item({ system: 'bms', provider: 'competitor' }),
    ]);
    const by = Object.fromEntries(cov.map((c) => [c.system, c.status]));
    expect(by.cctv).toBe('ours');
    expect(by.access_control).toBe('competitor');
    expect(by.bms).toBe('mixed');
    expect(by.fire_alarm).toBe('missing');
  });

  it('refuses an unknown system at make-time', () => {
    expect(() => item({ system: 'teleporter' as never })).toThrow('unknown system');
  });
});

describe('deriveGrowthFindings', () => {
  it('an empty register means "not surveyed", never a wall of white-space noise', () => {
    expect(deriveGrowthFindings('acc-1', [], NOW)).toEqual([]);
  });

  it('derives each finding kind with a stable dedupe key', () => {
    const items = [
      item({ system: 'cctv', provider: 'us', amcStatus: 'none' }),                                  // AMC_CROSS_SELL
      item({ system: 'access_control', provider: 'competitor', competitorName: 'RivalCo' }),        // REPLACEMENT
      item({ system: 'fire_alarm', provider: 'us', warrantyExpiresAt: inDays(30), amcStatus: 'unknown' }), // WARRANTY_EXPIRING
      item({ system: 'bms', provider: 'us', amcStatus: 'ours', amcExpiresAt: inDays(60) }),         // RENEWAL_DUE
    ];
    const findings = deriveGrowthFindings('acc-1', items, NOW);
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(['AMC_CROSS_SELL', 'REPLACEMENT', 'WARRANTY_EXPIRING', 'RENEWAL_DUE', 'WHITE_SPACE']));
    expect(findings.find((f) => f.kind === 'REPLACEMENT')!.reason).toContain('RivalCo');
    // Missing systems (intrusion_alarm etc.) surface as white space because SOME base exists.
    expect(findings.filter((f) => f.kind === 'WHITE_SPACE').map((f) => f.system)).toContain('intrusion_alarm');
    // Determinism: same facts, same keys — the scan's idempotency rests on this.
    expect(deriveGrowthFindings('acc-1', items, NOW).map((f) => f.dedupeKey)).toEqual(findings.map((f) => f.dedupeKey));
  });

  it('windows are honest: outside the window (or already expired) raises nothing', () => {
    const items = [
      item({ system: 'cctv', provider: 'us', warrantyExpiresAt: inDays(WARRANTY_WINDOW_DAYS + 10), amcStatus: 'ours', amcExpiresAt: inDays(AMC_RENEWAL_WINDOW_DAYS + 10) }),
      item({ system: 'bms', provider: 'us', warrantyExpiresAt: inDays(-5), amcStatus: 'ours', amcExpiresAt: inDays(-5) }),
    ];
    const kinds = deriveGrowthFindings('acc-1', items, NOW).map((f) => f.kind);
    expect(kinds).not.toContain('WARRANTY_EXPIRING');
    expect(kinds).not.toContain('RENEWAL_DUE');
  });
});
