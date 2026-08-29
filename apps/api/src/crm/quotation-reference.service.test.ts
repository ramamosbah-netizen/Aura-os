import { describe, expect, it, vi } from 'vitest';
import { QuotationReferenceService } from './quotation-reference.service';

function harness() {
  const accounts = { get: vi.fn() };
  const opportunities = { get: vi.fn() };
  const tenders = { get: vi.fn() };
  const tenant = { get: () => ({ tenantId: 'tenant-a' }) };
  return { service: new QuotationReferenceService(accounts as never, opportunities as never, tenders as never, tenant as never), accounts, opportunities, tenders };
}

describe('QuotationReferenceService — tenant-safe provenance', () => {
  it('rejects a nonexistent account', async () => {
    const { service, accounts } = harness();
    accounts.get.mockResolvedValue(null);
    await expect(service.validate({ accountId: 'missing-account' })).rejects.toThrow('account not found');
  });

  it('rejects a foreign-tenant account as inaccessible', async () => {
    const { service, accounts } = harness();
    // AccountService.get is tenant-scoped; null covers both foreign and unknown ids. The explicit
    // boundary check also fails closed if a future implementation accidentally returns an unscoped row.
    accounts.get.mockResolvedValueOnce(null);
    await expect(service.validate({ accountId: 'account-from-other-tenant' })).rejects.toThrow('account not found');
    accounts.get.mockResolvedValueOnce({ id: 'account-from-other-tenant', tenantId: 'tenant-b' });
    await expect(service.validate({ accountId: 'account-from-other-tenant' })).rejects.toThrow('account not found');
  });

  it('rejects nonexistent and foreign-tenant opportunities', async () => {
    const { service, opportunities } = harness();
    opportunities.get.mockResolvedValue(null);
    await expect(service.validate({ sourceOpportunityId: 'missing-opportunity' })).rejects.toThrow('opportunity not found');
    await expect(service.validate({ sourceOpportunityId: 'opportunity-from-other-tenant' })).rejects.toThrow('opportunity not found');
  });

  it('rejects nonexistent and foreign-tenant tenders', async () => {
    const { service, tenders } = harness();
    tenders.get.mockResolvedValue(null);
    await expect(service.validate({ sourceTenderId: 'missing-tender' })).rejects.toThrow('tender not found');
    await expect(service.validate({ sourceTenderId: 'tender-from-other-tenant' })).rejects.toThrow('tender not found');
  });

  it('requires source references to agree with the account and each other', async () => {
    const { service, accounts, opportunities, tenders } = harness();
    accounts.get.mockResolvedValue({ id: 'account-a', tenantId: 'tenant-a' });
    opportunities.get.mockResolvedValue({ id: 'opportunity-a', accountId: 'account-b', tenantId: 'tenant-a' });
    await expect(service.validate({ accountId: 'account-a', sourceOpportunityId: 'opportunity-a' })).rejects.toThrow('source reference does not belong to account');

    accounts.get.mockResolvedValue(null);
    opportunities.get.mockResolvedValue({ id: 'opportunity-a', accountId: 'account-a', tenantId: 'tenant-a' });
    tenders.get.mockResolvedValue({ id: 'tender-a', accountId: 'account-a', sourceOpportunityId: 'opportunity-b', tenantId: 'tenant-a' });
    await expect(service.validate({ sourceOpportunityId: 'opportunity-a', sourceTenderId: 'tender-a' })).rejects.toThrow('tender and opportunity references do not match');
  });

  it('derives the durable account id from a tenant-scoped source', async () => {
    const { service, opportunities } = harness();
    opportunities.get.mockResolvedValue({ id: 'opportunity-a', accountId: 'account-a', tenantId: 'tenant-a' });
    await expect(service.validate({ sourceOpportunityId: 'opportunity-a' })).resolves.toEqual({ accountId: 'account-a' });
  });

  it('rejects a reference whose ownership metadata is missing', async () => {
    const { service, accounts } = harness();
    accounts.get.mockResolvedValue({ id: 'account-a' });
    await expect(service.validate({ accountId: 'account-a' })).rejects.toThrow('account not found');
  });
});
