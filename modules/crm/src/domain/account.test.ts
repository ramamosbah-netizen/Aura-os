import { describe, expect, it } from 'vitest';
import { CRM_EVENT, makeAccount } from './account';

describe('crm account model', () => {
  it('creates an account with sane defaults and a trimmed name', () => {
    const a = makeAccount({ tenantId: 't1', name: '  Acme Co  ' });
    expect(a.name).toBe('Acme Co');
    expect(a.status).toBe('prospect');
    expect(a.companyId).toBeNull();
    expect(a.industry).toBeNull();
    expect(a.ownerId).toBeNull();
    expect(a.id).toBeTruthy();
    expect(a.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('honors provided status + fields', () => {
    const a = makeAccount({
      tenantId: 't1',
      companyId: 'c1',
      name: 'Globex',
      status: 'active_customer',
      industry: 'MEP',
      website: 'globex.example',
      ownerId: 'u1',
      createdBy: 'u1',
    });
    expect(a.status).toBe('active_customer');
    expect(a.companyId).toBe('c1');
    expect(a.industry).toBe('MEP');
    expect(a.createdBy).toBe('u1');
  });

  it('exposes the spine event type', () => {
    expect(CRM_EVENT.accountCreated).toBe('crm.account.created');
  });
});
