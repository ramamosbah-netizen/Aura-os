import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AccessService, DocumentAccessResolver, type AccessContextProvider } from '@aura/core';
import type { Document, DocumentActor, DocumentPermissionLevel } from '@aura/shared';
import { TenderService } from '@aura/tendering';

/**
 * Read access to Tender technical-study evidence follows the persisted Tender and the actor's
 * functional permission. The URL and study payload never select the authorization context.
 * Authors continue to receive edit rights from the DMS creator rule.
 */
@Injectable()
export class TenderStudyDocumentAccessProvider implements AccessContextProvider, OnModuleInit {
  readonly entity = 'tendering.tender';

  constructor(
    private readonly resolver: DocumentAccessResolver,
    private readonly tenders: TenderService,
    private readonly access: AccessService,
  ) {}

  onModuleInit(): void {
    this.resolver.registerContextProvider(this);
  }

  async grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]> {
    if (document.aggregateType !== 'tendering.tender') return [];
    const tender = await this.tenders.get(document.aggregateId);
    if (!tender || tender.tenantId !== actor.tenantId) return [];

    const allowed = this.access.can(actor.userId, {
      permission: 'tendering.study.read',
      orgPath: [
        { level: 'tenant', id: tender.tenantId },
        ...(tender.companyId ? [{ level: 'company' as const, id: tender.companyId }] : []),
      ],
    }).allowed;
    return allowed ? ['VIEW', 'DOWNLOAD'] : [];
  }
}
