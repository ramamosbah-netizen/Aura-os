import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'contact-360-client.tsx'), 'utf8');

describe('Contact 360 opportunity navigation', () => {
  it('uses the canonical pipeline register instead of the legacy leads route', () => {
    expect(SOURCE).toContain('href="/crm/pipeline"');
    expect(SOURCE).not.toContain('href="/crm/leads"');
  });
});
