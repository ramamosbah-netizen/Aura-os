import { describe, expect, it } from 'vitest';
import { derivePermissionFromRoute } from '@aura/core';

/**
 * The lead endpoints intentionally rely on the platform route taxonomy rather than repeating
 * decorators on every handler. Keep the derived contract explicit here so a route rename cannot
 * silently move a mutation into a different capability namespace.
 */
describe('Lead/Pipeline canonical permission contract', () => {
  it('keeps Lead lifecycle mutations in the lead capability namespace', () => {
    expect(derivePermissionFromRoute('POST', 'crm/leads', '')).toBe('crm.lead.create');
    expect(derivePermissionFromRoute('PATCH', 'crm/leads', ':id')).toBe('crm.lead.update');
    expect(derivePermissionFromRoute('PATCH', 'crm/leads', ':id/qualification')).toBe('crm.lead.qualification');
    expect(derivePermissionFromRoute('POST', 'crm/leads', ':id/convert')).toBe('crm.lead.convert');
    expect(derivePermissionFromRoute('PATCH', 'crm/leads', ':id/assign')).toBe('crm.lead.assign');
  });

  it('keeps Pipeline as a read-only portfolio surface', () => {
    expect(derivePermissionFromRoute('GET', 'crm/opportunities', 'pipeline')).toBe('crm.opportunity.read');
    expect(derivePermissionFromRoute('GET', 'crm/leads', 'command')).toBe('crm.lead.read');
  });
});
