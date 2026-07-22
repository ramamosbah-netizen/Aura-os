import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DocumentAccessResolver, type AccessContextProvider } from '@aura/core';
import type { Document, DocumentActor, DocumentPermissionLevel } from '@aura/shared';
import { AccountService, QuotationService } from '@aura/crm';

/**
 * Entity-inherited document access: the OWNER of the account behind a quotation may read the
 * documents on that quotation, even without a direct share.
 *
 * The rule the account owner should never have to ask for: "I own this customer, why can't I see
 * the vendor quotes on their offer?" A share for every document to every account owner would be
 * noise nobody maintains; inheritance keeps the grant implicit and current — reassign the account
 * and the access follows, with no share to chase down.
 *
 * WHY THIS CHAIN AND NOT "the contract team". Measured before building: documents attach only to
 * `crm.quotation`, quotations carry no owner, and nothing they attach to has a team. The only
 * populated link is quotation → account → `ownerId` (accounts are mostly owned). A provider
 * written to any other story would have granted nothing — an inheritance rule that never fires.
 *
 * VIEW and DOWNLOAD only. Inheritance is a read relationship: owning the customer is a reason to
 * SEE the paperwork, not to rewrite it, share it onward, or approve it. Those stay explicit
 * grants — and APPROVE, per the DMS policy, is never conferred by any ownership at all.
 *
 * This lives in the API host, not in `core`: the resolver must not know CRM's shapes, so the
 * module that knows both wires them together. It registers itself with the resolver at boot.
 */
@Injectable()
export class AccountDocumentAccessProvider implements AccessContextProvider, OnModuleInit {
  /** Recorded on the `context` source, so the surface can say access was inherited from the account. */
  readonly entity = 'crm.account';

  constructor(
    private readonly resolver: DocumentAccessResolver,
    private readonly quotations: QuotationService,
    private readonly accounts: AccountService,
  ) {}

  onModuleInit(): void {
    this.resolver.registerContextProvider(this);
  }

  async grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]> {
    // Only quotation documents inherit through an account. Anything else is not this provider's
    // business, and returning [] keeps it silent rather than guessing.
    if (document.aggregateType !== 'crm.quotation') return [];

    const quote = await this.quotations.get(document.aggregateId);
    // Tenant checks are belt-and-braces over RLS: a cross-tenant id must never resolve to access,
    // even if a store somewhere is not tenant-filtering.
    if (!quote || quote.tenantId !== actor.tenantId || !quote.accountId) return [];

    const account = await this.accounts.get(quote.accountId);
    if (!account || account.tenantId !== actor.tenantId || !account.ownerId) return [];

    return account.ownerId === actor.userId ? ['VIEW', 'DOWNLOAD'] : [];
  }
}
