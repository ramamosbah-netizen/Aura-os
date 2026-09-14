import { describe, expect, it } from 'vitest';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { InMemoryPricingSheetStore } from './in-memory-pricing-sheet-store';
import { PreAwardPackageService } from './pre-award-package.service';
import { InMemoryPreAwardStore } from './in-memory-pre-award-store';
import { makeRequirement } from './domain/solution-scope';

const completeContent = {
  scopeSummary: 'IP CCTV for the warehouse',
  systems: [{ id: 'sys', discipline: 'ELV', name: 'CCTV', designBasis: 'IP', interfaces: ['LAN'] }],
  requirements: [{ id: 'req', category: 'client' as const, statement: '30-day retention', acceptanceCriteria: '30 days', sourceRef: 'Spec A', sourceRequirementId: null, compliance: 'compliant' as const, response: 'Included' }],
  surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
};

describe('PreAwardPackageService technical-study revisions', () => {
  it('persists review history and supersedes an approved revision when the next revision opens', async () => {
    const store = new InMemoryPreAwardPackageStore();
    const service = new PreAwardPackageService(store, new InMemoryPricingSheetStore());
    const pkg = await service.openDirect({ tenantId: 't1', opportunityId: 'o1' });
    const first = await service.createTechnicalStudy({
      tenantId: 't1', companyId: null, packageId: pkg.id, opportunityId: 'o1', title: 'Study', inputRevision: 'Client 01',
      authorId: 'engineer', reviewerId: 'manager', ...completeContent,
    });
    await expect(service.createTechnicalStudy({
      tenantId: 't1', companyId: null, packageId: pkg.id, opportunityId: 'o1', title: 'Parallel', inputRevision: 'Client 01',
      authorId: 'engineer', reviewerId: 'manager', ...completeContent,
    })).rejects.toThrow(/update or complete/);
    await service.submitTechnicalStudy('t1', pkg.id, first.id, 'engineer');
    await service.approveTechnicalStudy('t1', pkg.id, first.id, 'manager', 'Approved');
    const second = await service.createTechnicalStudy({
      tenantId: 't1', companyId: null, packageId: pkg.id, opportunityId: 'o1', title: 'Study', inputRevision: 'Client 02',
      authorId: 'engineer', reviewerId: 'manager', ...completeContent,
    });
    const studies = await service.listTechnicalStudies('t1', pkg.id);
    expect(studies).toHaveLength(2);
    expect(studies[0].status).toBe('superseded');
    expect(second).toMatchObject({ revisionNo: 2, parentStudyId: first.id, status: 'draft' });
  });

  it('resolves linked requirements from the canonical opportunity and rejects cross-opportunity ids', async () => {
    const packageStore = new InMemoryPreAwardPackageStore();
    const evidence = new InMemoryPreAwardStore();
    const service = new PreAwardPackageService(packageStore, new InMemoryPricingSheetStore(), undefined, evidence);
    const pkg = await service.openDirect({ tenantId: 't1', opportunityId: 'o1' });
    const ours = makeRequirement({ tenantId: 't1', opportunityId: 'o1', title: '30-day video retention', detail: 'Client brief section 4' });
    const theirs = makeRequirement({ tenantId: 't1', opportunityId: 'o2', title: 'Spoofed requirement' });
    await evidence.saveRequirement(ours);
    await evidence.saveRequirement(theirs);
    const linked = { ...completeContent.requirements[0], statement: 'Caller altered title', sourceRef: 'Caller altered source', sourceRequirementId: ours.id };
    const study = await service.createTechnicalStudy({
      tenantId: 't1', companyId: null, packageId: pkg.id, opportunityId: 'o1', title: 'Study', inputRevision: 'Client 01',
      authorId: 'engineer', reviewerId: 'manager', ...completeContent, requirements: [linked],
    });
    expect(study.requirements[0]).toMatchObject({
      sourceRequirementId: ours.id, statement: ours.title, sourceRef: ours.detail,
    });

    const otherPkg = await service.openDirect({ tenantId: 't1', opportunityId: 'o3' });
    await expect(service.createTechnicalStudy({
      tenantId: 't1', companyId: null, packageId: otherPkg.id, opportunityId: 'o3', title: 'Study', inputRevision: 'Client 01',
      authorId: 'engineer', reviewerId: 'manager', ...completeContent,
      requirements: [{ ...linked, sourceRequirementId: theirs.id }],
    })).rejects.toThrow(/persisted on this opportunity/);
  });
});
