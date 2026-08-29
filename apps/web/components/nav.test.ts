import { describe, expect, it } from 'vitest';
import { NAV } from './nav';

describe('Sales navigation ownership', () => {
  it('keeps Activities out of primary Sales navigation while retaining contextual register access', () => {
    const sales = NAV.find((group) => group.title === 'Sales');
    expect(sales).toBeDefined();
    expect(sales?.items.some((item) => item.href === '/crm/activities')).toBe(false);
    expect(sales?.items.map((item) => item.href)).toEqual(expect.arrayContaining([
      '/crm/overview',
      '/crm/pipeline?tab=radar',
      '/crm/leads',
      '/crm/pipeline?view=board',
      '/crm/pipeline?tab=forecast',
      '/crm/pipeline?tab=analytics&view=performance',
      '/crm/customers',
      '/crm/quotations',
    ]));
  });
});
