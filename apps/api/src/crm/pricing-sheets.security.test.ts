import 'reflect-metadata';
import { PERMISSIONS_KEY, STANDARD_ELV_ROLES } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { describe, expect, it } from 'vitest';
import { PricingSheetsController } from './pricing-sheets.controller';

const permissionOf = (handler: keyof PricingSheetsController): string[] | undefined =>
  Reflect.getMetadata(PERMISSIONS_KEY, PricingSheetsController.prototype[handler]);

describe('CRM pricing sheet authorization contract', () => {
  it('protects every cost-sheet operation with internal pricing access', () => {
    const expected: Array<[keyof PricingSheetsController, string]> = [
      ['create', 'crm.pricing-sheet.create'],
      ['list', 'crm.pricing-sheet.read'],
      ['get', 'crm.pricing-sheet.read'],
      ['compare', 'crm.pricing-sheet.read'],
      ['dealContext', 'crm.pricing-sheet.read'],
      ['saveLines', 'crm.pricing-sheet.update'],
      ['freeze', 'crm.pricing-sheet.freeze'],
      ['revise', 'crm.pricing-sheet.revise'],
      ['generate', 'crm.pricing-sheet.generate'],
    ];
    for (const [handler, permission] of expected) {
      expect(permissionOf(handler), String(handler)).toEqual([permission, 'crm.internal-pricing.access']);
    }
  });

  it('lets Estimation work the sheet while Sales cannot see internal pricing', () => {
    const estimator = STANDARD_ELV_ROLES.find((role) => role.id === 'r-estimator')!;
    const sales = STANDARD_ELV_ROLES.find((role) => role.id === 'r-sales')!;
    for (const permission of ['crm.pricing-sheet.create', 'crm.pricing-sheet.freeze', 'crm.pricing-sheet.generate']) {
      expect(estimator.permissions.some((pattern) => permissionMatches(pattern, permission)), permission).toBe(true);
    }
    expect(estimator.permissions.some((pattern) => permissionMatches(pattern, 'crm.internal-pricing.access'))).toBe(true);
    expect(sales.permissions.some((pattern) => permissionMatches(pattern, 'crm.internal-pricing.access'))).toBe(false);
  });
});
