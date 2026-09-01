import { describe, expect, it } from 'vitest';
import { NAV, findNavMatch } from '@/components/nav';
import { AURA_SUITES, suiteSections } from '@/lib/suites';

describe('Sales & Commercial global IA', () => {
  it('presents one primary suite while retaining legacy domains as compatibility metadata', () => {
    const sales = AURA_SUITES.find((suite) => suite.id === 'sales');
    const visible = suiteSections(null, true).flatMap((section) => section.suites);

    expect(sales?.name).toBe('Sales & Commercial');
    expect(sales?.entryHref).toBe('/crm/overview');
    expect(sales?.owns('/tendering/tenders')).toBe(true);
    expect(sales?.owns('/contracts/contracts')).toBe(true);
    expect(visible.map((suite) => suite.name)).toContain('Sales & Commercial');
    expect(visible.map((suite) => suite.name)).not.toContain('Pre-Award');
    expect(visible.map((suite) => suite.name)).not.toContain('Commercial');
    expect(AURA_SUITES.find((suite) => suite.id === 'pre-award')?.hiddenFromPrimary).toBe(true);
    expect(AURA_SUITES.find((suite) => suite.id === 'commercial')?.hiddenFromPrimary).toBe(true);
  });

  it('groups intelligence and the commercial journey in the Sales navigation registry', () => {
    const sales = NAV.find((group) => group.title === 'Sales & Commercial');
    expect(sales).toBeDefined();
    const labels = sales?.items.map((item) => item.label) ?? [];
    expect(labels).toEqual(expect.arrayContaining([
      'Overview', 'Radar', 'Leads', 'Opportunities', 'Tenders', 'Estimation',
      'Quotations', 'Commercial Decisions', 'Contracts', 'Reports', 'Company Intelligence', 'Market Intelligence',
    ]));
  });

  it('keeps deep links in the single Sales & Commercial breadcrumb namespace', () => {
    for (const path of ['/tendering/tenders/abc', '/contracts/contracts/abc', '/crm/commercial', '/crm/market-intelligence']) {
      expect(findNavMatch(path)?.group, path).toBe('Sales & Commercial');
    }
    expect(findNavMatch('/crm/pipeline?view=board')?.group).toBe('Sales & Commercial');
  });
});
