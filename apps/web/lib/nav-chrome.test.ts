import { describe, expect, it } from 'vitest';
import { isFullFocusPath } from '@/lib/nav-chrome';

// Regression guard: the Sales suite tab row must stay on the Leads REGISTER but disappear on a Lead
// 360, and stay hidden on the full-focus Pipeline. A visual check alone would let this drift.
describe('isFullFocusPath — suite topbar suppression', () => {
  it('keeps the suite tab row on the Leads register', () => {
    expect(isFullFocusPath('/crm/leads')).toBe(false);
  });

  it('hides the suite tab row on a Lead 360 (detail path)', () => {
    expect(isFullFocusPath('/crm/leads/abc-123')).toBe(true);
    expect(isFullFocusPath('/crm/leads/7398ef6f-ca48-4178-82d9-227dd3a0b84b')).toBe(true);
  });

  it('hides it on an Opportunity 360 but keeps it on the register', () => {
    expect(isFullFocusPath('/crm/opportunities')).toBe(false);
    expect(isFullFocusPath('/crm/opportunities/abc-123')).toBe(true);
  });

  it('hides it on the full-focus Pipeline and its children', () => {
    expect(isFullFocusPath('/crm/pipeline')).toBe(true);
    expect(isFullFocusPath('/crm/pipeline/anything')).toBe(true);
  });

  it('leaves ordinary suite pages with their tab row', () => {
    expect(isFullFocusPath('/crm/accounts')).toBe(false);
    expect(isFullFocusPath('/crm/quotations')).toBe(false);
    expect(isFullFocusPath('/crm/overview')).toBe(false);
  });

  it('treats a static sub-route (create flow) as NOT a record', () => {
    expect(isFullFocusPath('/crm/leads/new')).toBe(false);
    expect(isFullFocusPath('/crm/leads/import')).toBe(false);
  });
});
