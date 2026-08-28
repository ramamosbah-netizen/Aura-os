import { describe, expect, it } from 'vitest';
import { AURA_SUITES, activeSuite, suiteSections } from '@/lib/suites';
import { defaultWorkspaceConfig, visibleFunctionIds } from '@aura/shared';

// The suite taxonomy is the backbone of the sidebar IA (Sidebar → Suite Home → Functions). These
// invariants are what make deep-page highlighting correct and keep one path from being claimed by
// two suites. If any breaks, the sidebar highlights the wrong suite — a silent navigation bug.
describe('AURA suite taxonomy', () => {
  it('every suite entryHref is owned by that same suite, so it self-highlights', () => {
    for (const suite of AURA_SUITES) {
      expect(activeSuite(suite.entryHref)?.id, `${suite.name} entryHref ${suite.entryHref}`).toBe(suite.id);
    }
  });

  it('no path is owned by more than one suite (ownership is exclusive)', () => {
    const samplePaths = [
      ...AURA_SUITES.map((s) => s.entryHref),
      '/crm/opportunities/123', '/tendering/tenders/1/pricing', '/projects/variations',
      '/projects/dashboard', '/project/abc/engineering', '/contracts/certificates',
      '/subcontracts/claims', '/finance/invoices/9', '/hr/timesheets', '/assets/control',
      '/procurement/purchase-orders', '/inventory/stock', '/admin/access', '/workspace',
    ];
    for (const path of samplePaths) {
      const owners = AURA_SUITES.filter((s) => s.owns(path));
      expect(owners.length, `${path} owned by [${owners.map((o) => o.id).join(', ')}]`).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the active suite highlighted on deep record pages', () => {
    expect(activeSuite('/tendering/tenders/123/pricing')?.id).toBe('pre-award');
    expect(activeSuite('/crm/opportunities/abc')?.id).toBe('sales');
    expect(activeSuite('/project/xyz/quality')?.id).toBe('project-delivery');
  });

  it('routes variations to Commercial, not Project Delivery', () => {
    expect(activeSuite('/projects/variations')?.id).toBe('commercial');
    expect(activeSuite('/projects/dashboard')?.id).toBe('project-delivery');
  });

  it('owns the canonical route in Control and leaves the legacy My Work path unowned', () => {
    expect(activeSuite('/command-center')?.id).toBe('business-command-center');
    expect(activeSuite('/command-center/ceo')?.id).toBe('business-command-center');
    expect(activeSuite('/my-work/command-center')?.id).toBeUndefined();
  });

  it('does not give retired utility aliases a second My Work owner', () => {
    for (const path of ['/inbox', '/notifications', '/views', '/search', '/ai']) {
      expect(activeSuite(path)?.id, `${path} should resolve through its canonical utility or compatibility route`).toBeUndefined();
    }
  });

  it('groups into work / control / business / system with nine business suites', () => {
    const sections = suiteSections(null, true);
    expect(sections.map((s) => s.section)).toEqual(['work', 'control', 'business', 'system']);
    expect(sections.find((s) => s.section === 'control')?.suites.map((s) => s.id)).toEqual(['business-command-center']);
    expect(sections.find((s) => s.section === 'business')?.suites).toHaveLength(9);
    expect(sections.find((s) => s.section === 'work')?.suites.map((s) => s.id)).toEqual(['my-work', 'communication']);
  });

  it('gates Business Command Center from the viewer workspace', () => {
    const config = defaultWorkspaceConfig();
    const viewer = suiteSections(visibleFunctionIds(config, 'viewer'), false);
    expect(viewer.find((s) => s.section === 'control')).toBeUndefined();

    const executive = suiteSections(visibleFunctionIds(config, 'executive'), false);
    expect(executive.find((s) => s.section === 'control')?.suites.map((s) => s.id)).toEqual(['business-command-center']);
  });
});
