import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'account-360.controller.ts'), 'utf8');

describe('Account 360 opportunity navigation', () => {
  it('deep-links timeline opportunities to Opportunity 360', () => {
    expect(SOURCE).toContain('href: `/crm/opportunities/${o.id}`');
    expect(SOURCE).not.toContain("href: '/crm/leads'");
  });
});
