import 'reflect-metadata';
import { PERMISSIONS_KEY } from '@aura/core';
import { describe, expect, it } from 'vitest';
import { CrmPreAwardPackageController } from './pre-award-package.controller';

describe('pre-award approval authority', () => {
  it('pins scope approval to a dedicated functional permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.approveScope)).toEqual([
      'crm.scope.approve',
    ]);
  });

  it('pins estimate approval to a dedicated functional permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.approveEstimate)).toEqual([
      'crm.estimate.approve',
    ]);
  });

  it('pins the study lifecycle to separate author and reviewer permissions', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.listStudies)).toEqual(['crm.study.read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.listStudyReviewers)).toEqual(['crm.study.read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.listStudyEvidence)).toEqual(['crm.study.read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.uploadStudyEvidence)).toEqual(['crm.study.update']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.addStudyEvidenceVersion)).toEqual(['crm.study.update']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.createStudy)).toEqual(['crm.study.create']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.updateStudy)).toEqual(['crm.study.update']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.submitStudy)).toEqual(['crm.study.update']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.approveStudy)).toEqual(['crm.study.approve']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CrmPreAwardPackageController.prototype.requestStudyChanges)).toEqual(['crm.study.approve']);
  });
});
