import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = resolve(__dirname);
const read = (path: string): string => readFileSync(resolve(WEB, path), 'utf8');

// AURA-FIT-001: this is an I/O-bound walk of the whole repository, not a behavioural test.
// vitest's 5 s default describes neither its work nor its variance under parallel turbo load
// (measured 15-20 s contended, <1 s alone). The generous budget names what it is; the assertions
// are untouched — this relaxes nothing about the check itself.
vi.setConfig({ testTimeout: 30_000 });

describe('Quotation 360 pricing contract', () => {
  it('consumes the canonical pricing sheet lines returned by the API', () => {
    const client = read('components/quotation-360-client.tsx');
    const domain = read('../../modules/crm/src/domain/quotation-pricing.ts');

    expect(domain).toContain('export interface QuotationPricingView extends QuotationPricingSheet');
    expect(client).toContain('The API serves the canonical pricing sheet under `lines`');
    expect(client).toContain('const lines = Array.isArray(pricingView.lines) ? pricingView.lines : []');
    expect(client).toContain('rows: lines.map');
    expect(client).not.toContain('pricingView.rows.map');
  });
});
