import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const controller = readFileSync(resolve(__dirname, 'tendering.controller.ts'), 'utf8');
const pricingController = readFileSync(resolve(__dirname, 'pricing.controller.ts'), 'utf8');
const migration = readFileSync(resolve(__dirname, '../../../../infrastructure/migrations/0311_tender_quantity_takeoff_lineage.sql'), 'utf8');

describe('Tender quantity take-off lineage fitness', () => {
  it('pins distinct preparation, approval and projection permissions', () => {
    expect(controller).toContain("@Permissions('tendering.takeoff.create')");
    expect(controller).toContain("@Permissions('tendering.takeoff.update')");
    expect(controller).toContain("@Permissions('tendering.takeoff.approve')");
    expect(controller).toContain("@Permissions('tendering.takeoff.project')");
  });

  it('persists basis and line provenance and provides a reversible migration', () => {
    expect(migration).toContain('source_basis_revision_id');
    expect(migration).toContain('source_basis_line_id');
    expect(migration).toContain('projected_at');
    expect(migration).toContain('-- @DOWN');
  });

  it('resolves projection through the Tender-owned package', () => {
    expect(controller).toContain('approvedTenderTakeoff(tenantId, id, basisId)');
    expect(controller).not.toContain('basisRevisionId: dto');
  });

  it('prevents pricing and customer quotation from bypassing the approved take-off projection', () => {
    expect(pricingController).toContain('private async governedPricingContext');
    expect(pricingController).toContain('!current?.boq.sourceBasisRevisionId || !current.boq.projectedAt');
    for (const method of ['sheetCsv', 'sheetXlsx', 'pricing', 'priceItem', 'sourceComponent', 'unsourceComponent', 'sources', 'offerFromEstimate']) {
      const section = pricingController.slice(pricingController.indexOf(`async ${method}`));
      expect(section.slice(0, 1_800), method).toContain('governedPricingContext(id)');
    }
    // EST-16: every act that writes the tender's offer — its first generation, the in-place refresh
    // and each revision — prices it through the one governed builder above.
    for (const method of ['generateQuotation', 'reviseQuotation']) {
      const section = pricingController.slice(pricingController.indexOf(`async ${method}(`));
      expect(section.slice(0, 2_400), method).toContain('this.offerFromEstimate(id');
    }
  });
});
