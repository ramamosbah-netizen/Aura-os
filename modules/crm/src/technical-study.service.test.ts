import { describe, expect, it } from 'vitest';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { InMemoryPricingSheetStore } from './in-memory-pricing-sheet-store';
import { PreAwardPackageService } from './pre-award-package.service';
import { InMemoryPreAwardStore } from './in-memory-pre-award-store';
import { makeRequirement } from './domain/solution-scope';
import { technicalStudyReadiness, type TechnicalStudyRevision } from './domain/technical-study';

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

/**
 * STU-06. The readiness rule already refused an OPEN deviation; it did not notice a deviation that
 * was never written down. A requirement assessed as a deviation, with no deviation recorded against
 * it, read as approval-ready — so the approved study, and the technical proposal printed from it,
 * told the customer "Deviation" beside a requirement with no stated departure, impact or resolution.
 */
describe('technical study readiness: a requirement assessed as a deviation must carry one', () => {
  const study = (over: Partial<TechnicalStudyRevision>): TechnicalStudyRevision => ({
    id: 's1', tenantId: 't1', companyId: null, packageId: 'p1', revisionNo: 1, parentStudyId: null,
    title: 'Study', inputRevision: 'Client 01', status: 'draft', authorId: 'engineer', reviewerId: 'manager',
    createdAt: '', updatedAt: '', submittedAt: null, reviewedBy: null, reviewedAt: null, reviewComment: null,
    ...completeContent, ...over,
  });
  const deviating = { ...completeContent.requirements[0], sourceRef: 'Spec A §4.2', compliance: 'deviation' as const };
  const recorded = { id: 'd1', requirementRef: 'spec a §4.2 ', description: '14-day retention offered', impact: 'Storage cost', proposedResolution: 'Client to confirm', status: 'accepted' as const };

  it('refuses a deviation assessment with nothing recorded against it', () => {
    expect(technicalStudyReadiness(study({ requirements: [deviating] }))).toEqual({
      ready: false, blockers: ['1 requirement(s) assessed as a deviation have no deviation recorded against their reference'],
    });
  });

  it('refuses a deviation recorded against some other reference', () => {
    const readiness = technicalStudyReadiness(study({ requirements: [deviating], deviations: [{ ...recorded, requirementRef: 'Spec B' }] }));
    expect(readiness.ready).toBe(false);
  });

  it('refuses a deviation assessment on a requirement with no reference for a deviation to name', () => {
    const readiness = technicalStudyReadiness(study({ requirements: [{ ...deviating, sourceRef: ' ' }], deviations: [{ ...recorded, requirementRef: '' }] }));
    expect(readiness.ready).toBe(false);
  });

  it('accepts the deviation once it is recorded against the requirement, and disposed', () => {
    expect(technicalStudyReadiness(study({ requirements: [deviating], deviations: [recorded] }))).toEqual({ ready: true, blockers: [] });
    // Recorded but undecided is the rule that already existed, and still holds.
    expect(technicalStudyReadiness(study({ requirements: [deviating], deviations: [{ ...recorded, status: 'open' }] })).blockers)
      .toEqual(['1 deviation(s) have no disposition']);
  });
});

describe('STU-02: a survey finding cites the evidence its study revision freezes', () => {
  const finding = { id: 'f1', area: 'Podium car park', observation: 'Ceiling void blocked by ducts', impact: 'Surface containment', evidenceDocumentIds: ['photo-1'] };
  const photo = { documentId: 'photo-1', title: 'Car park survey photos', kind: 'site_survey', revision: '1' };

  it('refuses a finding citing a document the revision does not freeze', async () => {
    const store = new InMemoryPreAwardPackageStore();
    const service = new PreAwardPackageService(store, new InMemoryPricingSheetStore());
    const pkg = await service.openDirect({ tenantId: 't1', opportunityId: 'o-survey' });
    const study = (surveyFindings: typeof finding[], evidence: typeof photo[]) => service.createTechnicalStudy({
      tenantId: 't1', companyId: null, packageId: pkg.id, opportunityId: 'o-survey', title: 'Study', inputRevision: 'Client 01',
      authorId: 'engineer', reviewerId: 'manager', ...completeContent, surveyFindings, evidence,
    });
    await expect(study([finding], [])).rejects.toThrow(/a survey finding must cite evidence frozen into this study revision .*Podium car park/);
    const created = await study([finding], [photo]);
    expect(created.surveyFindings[0]).toMatchObject({ area: 'Podium car park', evidenceDocumentIds: ['photo-1'] });
  });
});
