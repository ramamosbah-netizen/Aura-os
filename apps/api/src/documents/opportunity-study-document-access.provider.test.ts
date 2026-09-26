import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityStudyDocumentAccessProvider, OPPORTUNITY_STUDY_EVIDENCE_KINDS } from './opportunity-study-document-access.provider';

const doc = (kind: string, aggregateId = 'opp-1') => ({ id: 'd1', aggregateType: 'crm.opportunity', aggregateId, kind } as never);
const actor = (userId: string, tenantId = 't1') => ({ userId, tenantId, companyId: null });

function provider(readers: string[]) {
  const opportunities = { get: vi.fn(async (id: string) => (id === 'opp-1' ? { id, tenantId: 't1', companyId: 'c1' } : null)) };
  const access = { can: vi.fn((userId: string, target: { permission: string }) => ({ allowed: target.permission === 'crm.study.read' && readers.includes(userId) })) };
  const resolver = { registerContextProvider: vi.fn() };
  return { p: new OpportunityStudyDocumentAccessProvider(resolver as never, opportunities as never, access as never), access };
}

describe('OpportunityStudyDocumentAccessProvider (STU-02)', () => {
  it('lets a study reader view and download the study evidence of the persisted opportunity', async () => {
    const { p, access } = provider(['u-techmgr']);
    expect(await p.grantsFor(doc('site_survey'), actor('u-techmgr'))).toEqual(['VIEW', 'DOWNLOAD']);
    expect(access.can).toHaveBeenCalledWith('u-techmgr', expect.objectContaining({
      permission: 'crm.study.read', orgPath: [{ level: 'tenant', id: 't1' }, { level: 'company', id: 'c1' }],
    }));
  });

  it('opens nothing to anyone without the study grant, in another tenant, or of another kind', async () => {
    const { p } = provider(['u-techmgr']);
    expect(await p.grantsFor(doc('site_survey'), actor('u-viewer'))).toEqual([]);
    expect(await p.grantsFor(doc('site_survey'), actor('u-techmgr', 't2'))).toEqual([]);
    expect(await p.grantsFor(doc('commercial_offer'), actor('u-techmgr'))).toEqual([]);
    expect(await p.grantsFor(doc('site_survey', 'missing'), actor('u-techmgr'))).toEqual([]);
  });

  it('covers exactly the kinds the pre-award evidence route files', () => {
    const source = readFileSync(join(__dirname, '..', 'crm', 'pre-award-package.controller.ts'), 'utf8');
    const literal = /const categories = \[([^\]]*)\]/.exec(source)?.[1] ?? '';
    const kinds = [...literal.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...kinds].sort()).toEqual([...OPPORTUNITY_STUDY_EVIDENCE_KINDS].sort());
  });
});
