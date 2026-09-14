import { describe, expect, it, vi } from 'vitest';
import { makeDocument, makeLead } from '@aura/shared';
import type { DocumentAccessResolver } from '@aura/core';
import type { LeadService, OpportunityDepthService } from '@aura/crm';
import { CrmIntakeDocumentAccessProvider } from './crm-intake-document-access.provider';

const actor = (userId: string, tenantId = 'tenant-1') => ({ userId, tenantId, companyId: 'company-1' });

function harness(overrides: { assignedTo?: string | null; convertedOpportunityId?: string | null } = {}) {
  const lead = {
    ...makeLead({ tenantId: 'tenant-1', companyId: 'company-1', name: 'Client enquiry', assignedTo: overrides.assignedTo ?? 'sales-1' }),
    convertedOpportunityId: Object.prototype.hasOwnProperty.call(overrides, 'convertedOpportunityId')
      ? overrides.convertedOpportunityId ?? null
      : 'opportunity-1',
  };
  const resolver = { registerContextProvider: vi.fn() } as unknown as DocumentAccessResolver;
  const leads = { get: vi.fn().mockResolvedValue(lead) } as unknown as LeadService;
  const opportunityDepth = { listDealTeam: vi.fn().mockResolvedValue([
    { userId: 'presales-1', active: true },
    { userId: 'reviewer-1', active: true },
    { userId: 'former-1', active: false },
  ]) } as unknown as OpportunityDepthService;
  const provider = new CrmIntakeDocumentAccessProvider(resolver, leads, opportunityDepth);
  const document = makeDocument({
    tenantId: 'tenant-1', companyId: 'company-1', kind: 'client_specification', title: 'Specification Rev 01',
    aggregateType: 'crm.lead', aggregateId: lead.id, createdBy: 'sales-1',
  });
  return { provider, resolver, leads, opportunityDepth, document, lead };
}

describe('CrmIntakeDocumentAccessProvider', () => {
  it('registers itself as a DMS context provider', () => {
    const { provider, resolver } = harness();
    provider.onModuleInit();
    expect(resolver.registerContextProvider).toHaveBeenCalledWith(provider);
  });

  it('lets the current Sales owner maintain the canonical intake revisions', async () => {
    const { provider, document } = harness();
    await expect(provider.grantsFor(document, actor('sales-1'))).resolves.toEqual(['VIEW', 'DOWNLOAD', 'EDIT']);
  });

  it('derives read/download access for the active Opportunity study team', async () => {
    const { provider, document } = harness();
    await expect(provider.grantsFor(document, actor('presales-1'))).resolves.toEqual(['VIEW', 'DOWNLOAD']);
    await expect(provider.grantsFor(document, actor('reviewer-1'))).resolves.toEqual(['VIEW', 'DOWNLOAD']);
    await expect(provider.grantsFor(document, actor('former-1'))).resolves.toEqual([]);
  });

  it('does not grant before conversion, outside the team, across tenants or for another aggregate type', async () => {
    const unconverted = harness({ convertedOpportunityId: null });
    await expect(unconverted.provider.grantsFor(unconverted.document, actor('presales-1'))).resolves.toEqual([]);

    const converted = harness();
    await expect(converted.provider.grantsFor(converted.document, actor('stranger'))).resolves.toEqual([]);
    await expect(converted.provider.grantsFor(converted.document, actor('presales-1', 'tenant-2'))).resolves.toEqual([]);
    await expect(converted.provider.grantsFor({ ...converted.document, aggregateType: 'crm.opportunity' }, actor('presales-1'))).resolves.toEqual([]);
  });
});
