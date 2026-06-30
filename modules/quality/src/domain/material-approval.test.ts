import { describe, it, expect } from 'vitest';
import { makeMaterialApproval, submitMaterialApproval, reviewMaterialApproval, reviseMaterialApproval } from './material-approval';

const base = { tenantId: 't1', projectId: 'p1', reference: 'MAR-001', materialName: 'Cat6A cable' };

describe('material-approval (MAR) domain', () => {
  it('makeMaterialApproval defaults to draft rev 0 and trims fields', () => {
    const m = makeMaterialApproval({ ...base, manufacturer: ' Nexans ', discipline: 'ELV' });
    expect(m.status).toBe('draft');
    expect(m.revision).toBe(0);
    expect(m.manufacturer).toBe('Nexans');
    expect(m.discipline).toBe('ELV');
  });

  it('validates required projectId / reference / materialName', () => {
    expect(() => makeMaterialApproval({ ...base, reference: '' })).toThrow('reference is required');
    expect(() => makeMaterialApproval({ ...base, materialName: '' })).toThrow('materialName is required');
    expect(() => makeMaterialApproval({ ...base, projectId: '' })).toThrow('projectId is required');
  });

  it('submit moves draft → submitted; double-submit rejected', () => {
    const m = submitMaterialApproval(makeMaterialApproval(base));
    expect(m.status).toBe('submitted');
    expect(() => submitMaterialApproval(m)).toThrow('cannot submit from status submitted');
  });

  it('review applies the decision and records reviewer/time', () => {
    const submitted = submitMaterialApproval(makeMaterialApproval(base));
    const approved = reviewMaterialApproval(submitted, 'approved', 'u-eng');
    expect(approved.status).toBe('approved');
    expect(approved.reviewedBy).toBe('u-eng');
    expect(approved.reviewedAt).not.toBeNull();
  });

  it('approved_as_noted and rejected require comments; cannot review a draft', () => {
    const submitted = submitMaterialApproval(makeMaterialApproval(base));
    expect(() => reviewMaterialApproval(submitted, 'rejected', 'u', '')).toThrow('requires review comments');
    expect(() => reviewMaterialApproval(submitted, 'approved_as_noted', 'u')).toThrow('requires review comments');
    expect(() => reviewMaterialApproval(makeMaterialApproval(base), 'approved', 'u')).toThrow('only review a submitted');
    const noted = reviewMaterialApproval(submitted, 'approved_as_noted', 'u', 'use brand X');
    expect(noted.status).toBe('approved_as_noted');
    expect(noted.reviewComments).toBe('use brand X');
  });

  it('revise bumps revision and resets a rejected MAR to draft; cannot revise approved', () => {
    const rejected = reviewMaterialApproval(submitMaterialApproval(makeMaterialApproval(base)), 'rejected', 'u', 'non-compliant');
    const revised = reviseMaterialApproval(rejected);
    expect(revised.status).toBe('draft');
    expect(revised.revision).toBe(1);
    expect(revised.reviewComments).toBe('');
    const approved = reviewMaterialApproval(submitMaterialApproval(makeMaterialApproval(base)), 'approved', 'u');
    expect(() => reviseMaterialApproval(approved)).toThrow('only revise a rejected or approved-as-noted');
  });
});
