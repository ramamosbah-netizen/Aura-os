import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = resolve(__dirname);
const read = (path: string): string => readFileSync(resolve(WEB, path), 'utf8');

describe('CRM Sales route ownership', () => {
  it('makes SalesPipelineWorkspace the only active Pipeline page implementation', () => {
    const page = read('app/crm/pipeline/page.tsx');
    expect(page).toContain("import SalesPipelineWorkspace from '@/components/sales-pipeline-workspace'");
    expect(page).not.toContain("from '@/components/pipeline-workspace'");
  });

  it('keeps Leads separate and sends the legacy Forecast route to the canonical tab', () => {
    const leads = read('app/crm/leads/page.tsx');
    const forecast = read('app/crm/forecast/page.tsx');
    expect(leads).toContain('LeadsWorkspace');
    expect(forecast).toContain("redirect('/crm/pipeline?tab=forecast')");
  });

  it('exposes distinct Forecast and Analytics destinations from Sales', () => {
    const dashboard = read('components/sales-dashboard.tsx');
    expect(dashboard).toContain("href: '/crm/pipeline?tab=forecast'");
    expect(dashboard).toContain("href: '/crm/pipeline?tab=analytics&view=performance'");
  });

  it('defines all canonical Pipeline views and URL synchronization', () => {
    const workspace = read('components/sales-pipeline-workspace.tsx');
    expect(workspace).toContain("{ id: 'forecast'");
    expect(workspace).toContain("{ id: 'analytics'");
    expect(workspace).toContain("query.set('view', next)");
    expect(workspace).toContain('router.push(`${pathname}?${query.toString()}`');
    expect(workspace).toContain("query.set('tab', 'analytics')");
    expect(workspace).toContain('PAGE_TABS.includes(urlTab as PageTab)');
  });

  it('labels the sidebar routes according to their actual ownership', () => {
    const nav = read('components/nav.ts');
    expect(nav).toContain("{ label: 'Leads', href: '/crm/leads'");
    expect(nav).toContain("{ label: 'Opportunities', href: '/crm/pipeline?view=board'");
    expect(nav).toContain("{ label: 'Forecast', href: '/crm/pipeline?tab=forecast'");
    expect(nav).toContain("{ label: 'Analytics', href: '/crm/pipeline?tab=analytics&view=performance'");
    expect(nav).not.toContain("{ label: 'Pipeline & Opportunities', href: '/crm/leads'");
  });

  it('routes legacy reports to the canonical Analytics view', () => {
    const reports = read('app/crm/reports/page.tsx');
    expect(reports).toContain("redirect('/crm/pipeline?tab=analytics&view=performance')");
  });

  it('keeps the operational summary scoped to Opportunities display modes', () => {
    const client = read('components/crm-pipeline-client.tsx');
    expect(client).toContain("data-testid=\"opportunities-summary\"");
    expect(client).toContain("(view === 'board' || view === 'list')");
    expect(client).not.toContain('§23 forecast categories — the management commitment ladder');
  });
});
