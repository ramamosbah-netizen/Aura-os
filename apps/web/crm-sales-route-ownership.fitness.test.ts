import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = resolve(__dirname);
const read = (path: string): string => readFileSync(resolve(WEB, path), 'utf8');

describe('CRM Sales route ownership', () => {
  it('makes SalesPipelineWorkspace the only active Pipeline page implementation', () => {
    const page = read('app/crm/pipeline/page.tsx');
    expect(page).toContain("import SalesPipelineWorkspace from '@/components/sales-pipeline-workspace'");
    expect(page).not.toContain("from '@/components/pipeline-workspace'");
  });

  it('keeps Leads separate and gives Forecast its own canonical surface', () => {
    const leads = read('app/crm/leads/page.tsx');
    const forecast = read('app/crm/forecast/page.tsx');
    expect(leads).toContain('LeadsWorkspace');
    expect(forecast).toContain("SalesInsightWorkspace kind=\"forecast\"");
  });

  it('exposes distinct Forecast and Analytics destinations from Sales', () => {
    const dashboard = read('components/sales-dashboard.tsx');
    expect(dashboard).toContain("href: '/crm/forecast'");
    expect(dashboard).toContain("href: '/crm/analytics?view=performance'");
  });

  it('defines all canonical Pipeline views and URL synchronization', () => {
    const workspace = read('components/sales-pipeline-workspace.tsx');
    expect(workspace).toContain('Board and List are display modes');
    expect(workspace).toContain("query.set('view', next)");
    expect(workspace).toContain('router.push(`${pathname}?${query.toString()}`');
    expect(workspace).toContain('data-testid="pipeline-tab-list"');
  });

  it('labels the sidebar routes according to their actual ownership', () => {
    const nav = read('components/nav.ts');
    expect(nav).toContain("{ label: 'Leads', href: '/crm/leads'");
    expect(nav).toContain("{ label: 'Opportunities', href: '/crm/pipeline?view=board'");
    expect(nav).toContain("{ label: 'Radar', href: '/crm/radar'");
    expect(nav).toContain("{ label: 'Forecast', href: '/crm/forecast'");
    expect(nav).toContain("{ label: 'Analytics', href: '/crm/analytics?view=performance'");
    expect(nav).not.toContain("{ label: 'Pipeline & Opportunities', href: '/crm/leads'");
  });

  it('exposes the additive Sales & Commercial envelope without inventing new writers', () => {
    const nav = read('components/nav.ts');
    for (const destination of [
      "{ label: 'Tenders', href: '/tendering/tenders'",
      "{ label: 'Estimation', href: '/tendering/pricing'",
      "{ label: 'Commercial Decisions', href: '/crm/commercial'",
      "{ label: 'Contracts', href: '/contracts/contracts'",
      "{ label: 'Reports', href: '/crm/reports'",
    ]) expect(nav).toContain(destination);
    expect(nav).toContain('Current costing workspace — Tender pricing adapter');
    expect(nav).not.toContain("{ label: 'Tenders', href: '/tendering/tenders', glyph: '◳', desc: 'Bids & proposals");
    expect(nav).not.toContain("{ label: 'Contracts', href: '/contracts/contracts', glyph: '▦', desc: 'Awarded engagements'");
  });

  it('routes legacy reports to the canonical Analytics view', () => {
    const reports = read('app/crm/reports/page.tsx');
    expect(reports).toContain("redirect('/crm/analytics?view=performance')");
  });

  it('keeps canonical record, print and pricing routes available during remediation', () => {
    for (const route of [
      'app/crm/quotations/page.tsx',
      'app/crm/quotations/register/page.tsx',
      'app/crm/quotations/[id]/page.tsx',
      'app/crm/quotations/[id]/pricing/page.tsx',
      'app/crm/quotations/[id]/print/page.tsx',
      'app/crm/quotations/[id]/pricing/print/page.tsx',
      'app/crm/accounts/[id]/page.tsx',
      'app/crm/accounts/[id]/print/page.tsx',
      'app/crm/contacts/[id]/page.tsx',
      'app/crm/leads/[id]/page.tsx',
      'app/crm/opportunities/[id]/page.tsx',
    ]) {
      expect(existsSync(resolve(WEB, route)), `${route} must remain deep-linkable`).toBe(true);
    }
  });

  it('preserves the canonical deep-link destinations for queue, leads and opportunities', () => {
    const queue = read('components/commercial-decision-queue.tsx');
    const capture = read('components/lead-capture.tsx');
    const pipeline = read('components/crm-pipeline-client.tsx');
    expect(queue).toContain('/crm/quotations/${selected.id}?focus=approval');
    expect(capture).toContain("add(dup.lead, 'Lead', '/crm/leads')");
    expect(pipeline).toContain('/crm/leads/${l.id}');
    expect(pipeline).toContain('/crm/opportunities/${d.id}');
  });

  it('keeps the operational summary scoped to Opportunities display modes', () => {
    const client = read('components/crm-pipeline-client.tsx');
    expect(client).toContain("data-testid=\"opportunities-summary\"");
    expect(client).toContain("(view === 'board' || view === 'list')");
    expect(client).not.toContain('§23 forecast categories — the management commitment ladder');
  });
});
