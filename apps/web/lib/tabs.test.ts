import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTab, openTab, readTabs } from './tabs';

describe('AURA application tabs', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:3000', pathname: '/my-work/approvals', search: '' },
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('opens a PDF next to its launching tab and deduplicates by document identity', () => {
    openTab({ href: '/my-work/approvals', title: 'Approvals', type: 'My Work' });
    openTab(
      { href: '/documents/doc-1/pdf?version=1', title: 'MIR-0045', type: 'PDF', key: 'document-pdf:doc-1' },
      { afterHref: '/my-work/approvals' },
    );
    openTab(
      { href: '/documents/doc-1/pdf?version=2', title: 'MIR-0045 · v2', type: 'PDF', key: 'document-pdf:doc-1' },
      { afterHref: '/my-work/approvals' },
    );

    expect(readTabs()).toEqual([
      { href: '/my-work/approvals', title: 'Approvals', type: 'My Work' },
      { href: '/documents/doc-1/pdf?version=2', title: 'MIR-0045 · v2', type: 'PDF', key: 'document-pdf:doc-1' },
    ]);
  });

  it('refreshes a stale PDF href on direct navigation without duplicating its stable tab', () => {
    openTab({ href: '/documents/doc-1/pdf?version=1', title: 'Drawing', type: 'PDF', key: 'document-pdf:doc-1' });
    window.location.pathname = '/documents/doc-1/pdf';
    window.location.search = '?version=2';
    ensureTab({ href: '/documents/doc-1/pdf?version=2', title: 'Drawing · v2', type: 'PDF', key: 'document-pdf:doc-1' });
    expect(readTabs()).toEqual([
      { href: '/documents/doc-1/pdf?version=2', title: 'Drawing · v2', type: 'PDF', key: 'document-pdf:doc-1' },
    ]);
  });
});
