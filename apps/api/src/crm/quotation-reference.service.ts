import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { AccountService, OpportunityService } from '@aura/crm';
import { TenantContext } from '@aura/core';
import { TenderService } from '@aura/tendering';

export interface QuotationReferenceInput {
  accountId?: string | null;
  sourceOpportunityId?: string | null;
  sourceTenderId?: string | null;
}

/**
 * Resolves quotation provenance before the quotation aggregate is created.
 * The three module services are already tenant-scoped, and the explicit tenant check below keeps
 * this boundary safe even if a caller supplies a service implementation that returns an unscoped row.
 */
@Injectable()
export class QuotationReferenceService {
  constructor(
    private readonly accounts: AccountService,
    private readonly opportunities: OpportunityService,
    private readonly tenders: TenderService,
    @Optional() private readonly tenant: TenantContext | null = null,
  ) {}

  async validate(input: QuotationReferenceInput): Promise<{ accountId: string | null }> {
    const tenantId = this.tenant?.get().tenantId ?? null;
    // PostgreSQL UUID-backed stores reject a syntactically invalid reference before returning an
    // empty result (22P02). Treat that exactly like any other missing reference at this boundary;
    // callers must receive the documented 400 rather than an infrastructure-shaped 500. The
    // helper deliberately rethrows every other database error.
    const account = input.accountId ? await this.safeGet(() => this.accounts.get(input.accountId!)) : null;
    if (input.accountId && (!account || !this.belongsToTenant(account, tenantId))) throw new BadRequestException('account not found');

    const opportunity = input.sourceOpportunityId ? await this.safeGet(() => this.opportunities.get(input.sourceOpportunityId!)) : null;
    if (input.sourceOpportunityId && (!opportunity || !this.belongsToTenant(opportunity, tenantId))) throw new BadRequestException('opportunity not found');

    const tender = input.sourceTenderId ? await this.safeGet(() => this.tenders.get(input.sourceTenderId!)) : null;
    if (input.sourceTenderId && (!tender || !this.belongsToTenant(tender, tenantId))) throw new BadRequestException('tender not found');

    if (opportunity && tender && tender.sourceOpportunityId !== opportunity.id) {
      throw new BadRequestException('tender and opportunity references do not match');
    }

    const linkedAccountIds = [opportunity?.accountId, tender?.accountId].filter((id): id is string => Boolean(id));
    if (new Set(linkedAccountIds).size > 1) throw new BadRequestException('source references belong to different accounts');
    const sourceAccountId = linkedAccountIds[0] ?? null;
    if (account?.id && sourceAccountId && account.id !== sourceAccountId) {
      throw new BadRequestException('source reference does not belong to account');
    }

    // Preserve the durable account relationship when the source already carries one, while
    // leaving genuinely unassigned/direct quotations nullable.
    return { accountId: account?.id ?? sourceAccountId };
  }

  private belongsToTenant(record: { tenantId?: string }, tenantId: string | null): boolean {
    // A tenant-bound request must never accept an object whose ownership metadata is missing.
    // Accepting `undefined` here turns an accidentally unscoped repository response into a
    // cross-tenant reference bypass. Unbound/system callers retain the legacy unrestricted path.
    return !tenantId || record.tenantId === tenantId;
  }

  private async safeGet<T>(read: () => Promise<T | null>): Promise<T | null> {
    try {
      return await read();
    } catch (error) {
      if ((error as { code?: string })?.code === '22P02') return null;
      throw error;
    }
  }
}
