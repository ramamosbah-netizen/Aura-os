import 'reflect-metadata';
import { PERMISSIONS_KEY } from '@aura/core';
import { describe, expect, it } from 'vitest';
import { TenderPricingController } from './pricing.controller';

describe('Tender internal pricing export authority', () => {
  it('requires both estimate read and explicit internal pricing access on every read surface', () => {
    for (const method of ['sheets', 'sheetsCsv', 'sheetCsv', 'sheetXlsx', 'pricing', 'sources'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, TenderPricingController.prototype[method]), method).toEqual([
        'tendering.estimate.read',
        'tendering.internal-pricing.access',
      ]);
    }
  });

  it('pins functional cost-edit and customer-offer permissions on write surfaces', () => {
    for (const method of ['priceItem', 'sourceComponent', 'unsourceComponent'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, TenderPricingController.prototype[method]), method).toEqual([
        'tendering.estimate.update',
        'tendering.internal-pricing.access',
      ]);
    }
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TenderPricingController.prototype.generateQuotation)).toEqual([
      'tendering.estimate.read',
      'tendering.internal-pricing.access',
      'crm.quotation.create',
    ]);
  });
});
