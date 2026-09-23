import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AccessService, DocumentAccessResolver, type AccessContextProvider } from '@aura/core';
import type { Document, DocumentActor, DocumentPermissionLevel } from '@aura/shared';
import { QualityService } from '@aura/quality';

/**
 * AN NCR'S EVIDENCE BELONGS TO THE NON-CONFORMANCE, NOT TO WHOEVER PHOTOGRAPHED IT.
 *
 * A document `DmsService` creates carries no shares, so the QA/QC engineer who raised the NCR
 * would be the only person able to open the photograph of the defect — while the responsible
 * owner who has to correct it, and the independent verifier who has to accept or reject that
 * correction, are precisely the people who need to see it. A verifier who cannot look at what was
 * wrong is not verifying anything.
 *
 * Whoever may READ the NCR may open its evidence. VIEW and DOWNLOAD only: replacing the
 * photograph an NCR was closed against is not a reading action.
 */
@Injectable()
export class NcrEvidenceDocumentAccessProvider implements AccessContextProvider, OnModuleInit {
  readonly entity = 'quality.ncr';

  constructor(
    private readonly resolver: DocumentAccessResolver,
    private readonly quality: QualityService,
    private readonly access: AccessService,
  ) {}

  onModuleInit(): void {
    this.resolver.registerContextProvider(this);
  }

  async grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]> {
    if (document.aggregateType !== 'quality.ncr') return [];

    const found = await this.quality.readNcr(actor.tenantId, document.aggregateId);
    if (!found || found.ncr.tenantId !== actor.tenantId) return [];

    const decision = this.access.can(actor.userId, {
      permission: 'quality.ncr.read',
      orgPath: [{ level: 'tenant', id: actor.tenantId }],
    });
    return decision.allowed ? ['VIEW', 'DOWNLOAD'] : [];
  }
}
