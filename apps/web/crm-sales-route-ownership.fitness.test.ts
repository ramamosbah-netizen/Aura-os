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
    expect(dashboard).toContain("href: '/crm/pipeline?tab=analytics'");
  });

  it('defines all canonical Pipeline tabs and URL synchronization', () => {
    const workspace = read('components/sales-pipeline-workspace.tsx');
    expect(workspace).toContain("{ id: 'forecast'");
    expect(workspace).toContain("{ id: 'analytics'");
    expect(workspace).toContain('router.replace(`${pathname}?${query.toString()}`');
    expect(workspace).toContain("if (urlTab === 'forecast'");
  });

  it('labels the sidebar routes according to their actual ownership', () => {
    const nav = read('components/nav.ts');
    expect(nav).toContain("{ label: 'Leads', href: '/crm/leads'");
    expect(nav).toContain("{ label: 'Pipeline', href: '/crm/pipeline'");
    expect(nav).not.toContain("{ label: 'Pipeline & Opportunities', href: '/crm/leads'");
  });
});
