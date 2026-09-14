import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = resolve(__dirname);
const read = (path: string): string => readFileSync(resolve(WEB, path), 'utf8');

describe('Quotation 360 permission-aware actions', () => {
  it('loads action access from the API and passes it into the record UI', () => {
    const page = read('app/crm/quotations/[id]/page.tsx');
    const route = read('app/api/crm/quotations/[id]/action-access/route.ts');
    expect(page).toContain('/action-access');
    expect(page).toContain('actionAccess={actionAccessResult.ok');
    expect(route).toContain('/action-access');
  });

  it('does not infer approval or internal-pricing controls from quotation status alone', () => {
    const client = read('components/quotation-360-client.tsx');
    expect(client).toContain("q.status === 'internal_review' && allowed.approve");
    expect(client).toContain("q.status === 'approved' && allowed.send");
    expect(client).toContain('canAccessInternalPricing && <ActionButton');
    expect(client).toContain("canAccessInternalPricing ? [{ id: 'pricing'");
    expect(client).toContain('Record as sent');
  });

  it('links a generated Tender quotation directly to its Quotation 360 record', () => {
    const pricing = read('components/tender-pricing-client.tsx');
    expect(pricing).toContain('href={`/crm/quotations/${q.id}`}');
  });
});
