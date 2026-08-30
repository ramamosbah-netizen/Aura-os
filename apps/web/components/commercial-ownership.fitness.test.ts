import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'commercial-decision-queue.tsx'), 'utf8');

describe('Commercial Decision Queue canonical ownership', () => {
  it('only prioritizes and deep-links; it does not call quotation mutation endpoints', () => {
    expect(SOURCE).toContain('Open Quotation 360');
    expect(SOURCE).toContain('focus=approval');
    expect(SOURCE).not.toMatch(/\/api\/crm\/quotations[^'"`]*['"`][\s\S]{0,180}method:\s*['"`](?:POST|PATCH|DELETE)/i);
    expect(SOURCE).not.toMatch(/changeStatus|approveQuotation|cancelQuotation/i);
  });

  it('keeps the documented temporary compatibility exception limited to checklist seeding', () => {
    expect(SOURCE).toContain("fetch('/api/document-requirements/seed'");
    expect(SOURCE).not.toContain("fetch('/api/crm/quotations/");
  });

  it('keeps accepted and contracted values on their distinct lineage sources', () => {
    const financials = readFileSync(resolve(__dirname, 'commercial-financials.tsx'), 'utf8');
    expect(financials).toContain('accepted.filter((q) => !q.convertedContractId)');
    expect(financials).toContain('activeContracts.reduce((s, c) => s + (c.value ?? 0), 0)');
    expect(financials).toContain('pricingById.get(q.id)?.profit');
  });
});
