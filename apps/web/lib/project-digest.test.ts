import { describe, it, expect } from 'vitest';
import { computeDigest, type AreaData } from './project-digest';

const empty: AreaData = { drawings: [], dailyReports: [], ncrs: [], permits: [], commissioning: [], documents: [] };

describe('computeDigest', () => {
  it('summarises each area into a KPI and totals the records', () => {
    const d: AreaData = {
      ...empty,
      drawings: [{ id: 'd1', code: 'A-1', status: 'approved' }, { id: 'd2', code: 'A-2', status: 'draft' }],
      ncrs: [{ id: 'n1', ncrNumber: 'NCR-1', status: 'raised', severity: 'minor' }],
      commissioning: [{ id: 'c1', code: 'TC-1', status: 'commissioned' }, { id: 'c2', code: 'TC-2', status: 'pending' }],
      documents: [{ id: 'x1', status: 'issued' }],
    };
    const dig = computeDigest(d);
    expect(dig.totalRecords).toBe(6);
    expect(dig.kpis.find((k) => k.area === 'engineering')?.value).toBe('1/2');
    expect(dig.kpis.find((k) => k.area === 'commissioning')?.value).toBe('1/2');
    expect(dig.kpis.find((k) => k.area === 'quality')?.value).toBe('1'); // one open NCR
  });

  it('raises blockers for the things that actually block delivery, high severity first', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const d: AreaData = {
      ...empty,
      ncrs: [{ id: 'n1', ncrNumber: 'NCR-9', status: 'raised', severity: 'major' }],
      permits: [{ id: 'p1', permitType: 'hot_work', status: 'approved', validTo: yesterday }],
      commissioning: [{ id: 'c1', code: 'TC-9', status: 'failed', pointsPassed: 3, pointsTotal: 4 }],
      drawings: [{ id: 'd1', code: 'A-9', status: 'rejected' }],
    };
    const { blockers } = computeDigest(d);
    // three high-severity (major NCR, expired permit, failed system) then one medium (rejected drawing)
    expect(blockers.filter((b) => b.severity === 'high')).toHaveLength(3);
    expect(blockers.filter((b) => b.severity === 'med')).toHaveLength(1);
    expect(blockers[0].severity).toBe('high');
    expect(blockers.some((b) => b.text.includes('NCR-9'))).toBe(true);
    expect(blockers.some((b) => b.text.includes('expired'))).toBe(true);
    expect(blockers.some((b) => b.href === '/commissioning/c1')).toBe(true);
  });

  it('is quiet when nothing is wrong', () => {
    const dig = computeDigest({
      ...empty,
      drawings: [{ id: 'd', code: 'A', status: 'approved' }],
      commissioning: [{ id: 'c', code: 'T', status: 'commissioned' }],
    });
    expect(dig.blockers).toHaveLength(0);
    expect(dig.kpis.find((k) => k.area === 'quality')?.tone).toBe('good');
  });
});
