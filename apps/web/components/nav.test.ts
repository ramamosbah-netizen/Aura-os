import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV, findNavMatch, groupAllItems, navPath } from './nav';

describe('Sales navigation ownership', () => {
  it('keeps Activities out of primary Sales navigation while retaining contextual register access', () => {
    const sales = NAV.find((group) => group.title === 'Sales & Commercial');
    expect(sales).toBeDefined();
    expect(sales?.items.some((item) => item.href === '/crm/activities')).toBe(false);
    expect(sales?.items.map((item) => item.href)).toEqual(expect.arrayContaining([
      '/crm/overview',
      '/crm/radar',
      '/crm/leads',
      '/crm/pipeline?view=board',
      '/crm/forecast',
      '/crm/analytics?view=performance',
      '/crm/customers',
      '/crm/quotations',
    ]));
  });
});

/**
 * WHERE AM I? The breadcrumb is derived from NAV (longest prefix wins), so a page no nav item
 * covers gets no trail at all. Measured 2026-10-02: 58 page routes had none — every opportunity
 * record among them, because the Opportunities item links `/crm/pipeline?view=board` and a
 * pathname never carries a query, so the item matched nothing, not even its own board.
 */
describe('breadcrumb ownership', () => {
  it('puts an opportunity record — and the pre-award pages inside it — under Sales & Commercial › Opportunities', () => {
    expect(findNavMatch('/crm/opportunities/5d1f8c4a-0b6e-4c55-9a43-1f2d3c4b5a6e')).toEqual({
      group: 'Sales & Commercial', label: 'Opportunities', href: '/crm/pipeline?view=board', path: '/crm/pipeline',
    });
    expect(findNavMatch('/crm/opportunities/x1/pre-award/pricing/x2')?.label).toBe('Opportunities');
    expect(findNavMatch('/crm/opportunities/x1/pre-award/estimate/x2')?.label).toBe('Opportunities');
  });

  it('matches an item that links with a query on its own page, and knows it is that page', () => {
    expect(findNavMatch('/crm/pipeline')).toMatchObject({ label: 'Opportunities', path: '/crm/pipeline' });
    expect(findNavMatch('/crm/analytics')).toMatchObject({ label: 'Analytics', href: '/crm/analytics?view=performance', path: '/crm/analytics' });
  });

  it('places records under the item they are reached from', () => {
    const at = (pathname: string) => {
      const m = findNavMatch(pathname);
      return m ? `${m.group} › ${m.label}` : null;
    };
    expect(at('/crm/accounts/x1')).toBe('Sales & Commercial › Customers');
    expect(at('/crm/contacts/x1')).toBe('Sales & Commercial › Customers');
    expect(at('/project/x1/drawings/x2')).toBe('Projects › Projects');
    expect(at('/procurement/technical-evaluation/x1')).toBe('Operations › RFQs');
    expect(at('/doccontrol/register/x1')).toBe('Knowledge › Document Control');
    // …while a page with its own item keeps it: an owned prefix is shorter than the item's own path.
    expect(at('/doccontrol/submittals')).toBe('Knowledge › Submittals');
    expect(at('/tendering/pricing')).toBe('Sales & Commercial › Estimation');
  });

  it('never lets an owned prefix take an item\'s own page from it', () => {
    for (const group of NAV) {
      for (const item of groupAllItems(group)) {
        if (item.href === '/') continue;
        // The path, not the label: two items may share a page (Delivery Operations and Operations
        // both list /site/control), and either answer names the same place.
        expect(findNavMatch(navPath(item.href))?.path, `${group.title} › ${item.label}`).toBe(navPath(item.href));
        for (const prefix of item.owns ?? []) {
          expect(prefix, `${item.label} owns a path, not a link`).toMatch(/^\/[^?#]*[^/?#]$/);
        }
      }
    }
  });

  /**
   * The fitness half: every page the shell renders has a place in the trail, or is listed here
   * with the reason it has none. A new record route without an owner fails this test rather than
   * shipping a page that cannot say where it is.
   */
  it('gives every page route a place in the trail, or says why not', () => {
    const UNOWNED: Record<string, string> = {
      '/': 'Home — the breadcrumb is deliberately absent on the front door',
      '/login': 'renders without the shell',
      '/ai': 'redirect only',
      '/controls': 'redirect only (to a project\'s controls or Project Controls)',
      '/crm/my-day': 'redirect only',
      '/inbox': 'redirect only',
      '/notifications': 'redirect only',
      '/search': 'redirect only',
      '/views': 'redirect only',
      '/workspace': 'compatibility hub for utilities retired from the navigation',
      '/suites': 'the suite launcher, which carries its own "Suites /" trail',
      '/suites/[suiteId]': 'a suite home, which carries its own "Suites / name" trail',
    };
    const app = join(__dirname, '..', 'app');
    const routes: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          // `api` holds route handlers, not pages; `_folder` is private and never routable.
          if (name === 'api' || name.startsWith('_')) continue;
          walk(full);
        } else if (name === 'page.tsx') {
          const segments = relative(app, dir).split(sep).filter(Boolean)
            // `(group)` and `@slot` organise files without appearing in the URL.
            .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')) && !segment.startsWith('@'));
          routes.push(`/${segments.join('/')}`);
        }
      }
    };
    walk(app);
    expect(routes.length, 'the walk found the app').toBeGreaterThan(100);

    const sample = (route: string) => route
      .replace(/\[\[\.\.\.[^\]]+\]\]/g, 'a/b')
      .replace(/\[\.\.\.[^\]]+\]/g, 'a/b')
      .replace(/\[[^\]]+\]/g, 'x1');
    const withoutTrail = routes.filter((route) => !findNavMatch(sample(route))).sort();
    expect(withoutTrail).toEqual(Object.keys(UNOWNED).sort());
  });
});
