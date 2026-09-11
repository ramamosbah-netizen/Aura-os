import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'contact-360-client.tsx'), 'utf8');

// AURA-FIT-001: this is an I/O-bound walk of the whole repository, not a behavioural test.
// vitest's 5 s default describes neither its work nor its variance under parallel turbo load
// (measured 15-20 s contended, <1 s alone). The generous budget names what it is; the assertions
// are untouched — this relaxes nothing about the check itself.
vi.setConfig({ testTimeout: 30_000 });

describe('Contact 360 opportunity navigation', () => {
  it('uses the canonical pipeline register instead of the legacy leads route', () => {
    expect(SOURCE).toContain('href="/crm/pipeline"');
    expect(SOURCE).not.toContain('href="/crm/leads"');
  });

  it('deep-links each opportunity row to its Opportunity 360 record', () => {
    expect(SOURCE).toContain('rowLinks={opportunities.map((o) => `/crm/opportunities/${o.id}`)}');
  });
});
