import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('document requirements BFF fitness', () => {
  it('keeps the reachable checklist seed action connected to the canonical API', () => {
    const route = read('./app/api/document-requirements/seed/route.ts');
    expect(route).toContain('/api/v1/document-requirements/seed');
    expect(route).toContain("await authHeader()");
  });

  it('keeps attributed waivers connected by persisted requirement id', () => {
    const route = read('./app/api/document-requirements/[id]/waive/route.ts');
    expect(route).toContain('encodeURIComponent(id)');
    expect(route).toContain('/waive');
    expect(route).toContain("await authHeader()");
  });
});
