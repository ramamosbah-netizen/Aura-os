import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = resolve(__dirname);
const read = (path: string): string => readFileSync(resolve(WEB, path), 'utf8');

/**
 * Portfolio/read surfaces may aggregate canonical values, but they must not create a second
 * pricing truth from customer-facing line payloads. This is deliberately a source-level guard:
 * the API/service contracts prove the values, while this scan prevents a future UI shortcut from
 * reintroducing a competing cost or margin calculation.
 */
describe('Commercial source-of-truth boundary', () => {
  it('keeps Commercial financials on pricing-summary and contract sources', () => {
    const financials = read('components/commercial-financials.tsx');
    expect(financials).toContain('pricingById.get(q.id)?.profit');
    expect(financials).toContain('accepted.filter((q) => !q.convertedContractId)');
    expect(financials).toContain('activeContracts.reduce((s, c) => s + (c.value ?? 0), 0)');
    expect(financials).not.toMatch(/unitCost|costPrice|line\.unitCost|lines\.reduce/);
  });

  it('keeps Analytics source/margin values on the canonical source-funnel endpoint', () => {
    const pipeline = read('components/crm-pipeline-client.tsx');
    const analytics = read('app/crm/analytics/page.tsx');
    expect(pipeline).toContain("fetch('/api/crm/source-funnel'");
    expect(pipeline).toContain('funnel.totals.actualMargin');
    expect(analytics).toContain('SalesInsightWorkspace');
    expect(pipeline).not.toMatch(/unitCost|costPrice|line\.unitCost|lines\.reduce/);
  });

  it('does not let Overview, Commercial workspace or Reports become a second calculation engine', () => {
    const sources = [
      read('components/commercial-workspace.tsx'),
      read('components/sales-dashboard.tsx'),
      read('app/crm/overview/page.tsx'),
      read('app/crm/reports/page.tsx'),
    ].join('\n');
    expect(sources).not.toMatch(/unitCost|costPrice|line\.unitCost|lines\.reduce/);
    expect(sources).toContain('/crm/analytics?view=performance');
  });
});
