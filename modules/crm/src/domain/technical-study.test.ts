import { describe, expect, it } from 'vitest';
import {
  approveTechnicalStudy, makeTechnicalStudy, requestTechnicalStudyChanges,
  submitTechnicalStudy, technicalStudyReadiness, updateTechnicalStudy,
  type NewTechnicalStudy,
} from './technical-study';

function input(overrides: Partial<NewTechnicalStudy> = {}): NewTechnicalStudy {
  return {
    tenantId: 't1', companyId: null, packageId: 'p1', title: 'Villa ELV study', inputRevision: 'Client Rev 01',
    authorId: 'engineer', reviewerId: 'technical-manager', scopeSummary: 'CCTV and access control for the villa',
    systems: [{ id: 'sys-1', discipline: 'ELV', name: 'CCTV', designBasis: 'IP system', interfaces: ['LAN'] }],
    requirements: [{ id: 'req-1', category: 'client', statement: '30-day recording', acceptanceCriteria: '30 days at full resolution', sourceRef: 'Spec 28 20 00', sourceRequirementId: null, compliance: 'compliant', response: 'Sized storage for 30 days' }],
    surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    ...overrides,
  };
}

describe('governed technical study revision', () => {
  it('keeps authoring, submission and approval as separate actions', () => {
    const draft = makeTechnicalStudy(input(), 1);
    const submitted = submitTechnicalStudy(draft, 'engineer');
    expect(submitted.status).toBe('in_review');
    expect(() => approveTechnicalStudy(submitted, 'engineer')).toThrow(/cannot approve their own/);
    expect(() => approveTechnicalStudy(submitted, 'other-manager')).toThrow(/assigned reviewer/);
    const approved = approveTechnicalStudy(submitted, 'technical-manager', 'Accepted for estimating');
    expect(approved).toMatchObject({ status: 'approved', reviewedBy: 'technical-manager', reviewComment: 'Accepted for estimating' });
  });

  it('blocks approval while technical decisions remain unresolved', () => {
    const draft = makeTechnicalStudy(input({
      requirements: [{ ...input().requirements[0], compliance: 'unassessed' }],
      clarifications: [{ id: 'c1', question: 'Confirm storage', requestedFrom: 'Client', dueDate: null, status: 'open', answer: '', reference: '' }],
      deviations: [{ id: 'd1', requirementRef: 'Spec', description: 'Alternative camera', impact: 'Model changes', proposedResolution: '', status: 'open' }],
    }), 1);
    expect(technicalStudyReadiness(draft).blockers).toEqual(expect.arrayContaining([
      '1 requirement(s) are not assessed', '1 clarification(s) remain open', '1 deviation(s) have no disposition',
    ]));
    expect(() => approveTechnicalStudy(submitTechnicalStudy(draft, 'engineer'), 'technical-manager')).toThrow(/not approval-ready/);
  });

  it('uses optimistic concurrency and only lets the assigned author edit', () => {
    const draft = makeTechnicalStudy(input(), 1);
    expect(() => updateTechnicalStudy(draft, { scopeSummary: 'changed' }, 'other', draft.updatedAt)).toThrow(/assigned study author/);
    expect(() => updateTechnicalStudy(draft, { scopeSummary: 'changed' }, 'engineer', 'stale')).toThrow(/reload/);
    expect(updateTechnicalStudy(draft, { scopeSummary: 'Updated basis' }, 'engineer', draft.updatedAt).scopeSummary).toBe('Updated basis');
  });

  it('records a required reviewer comment when changes are requested', () => {
    const submitted = submitTechnicalStudy(makeTechnicalStudy(input(), 1), 'engineer');
    expect(() => requestTechnicalStudyChanges(submitted, 'technical-manager', '')).toThrow(/review comment/);
    expect(requestTechnicalStudyChanges(submitted, 'technical-manager', 'Add authority reference')).toMatchObject({
      status: 'changes_requested', reviewComment: 'Add authority reference', reviewedBy: 'technical-manager',
    });
  });
});

