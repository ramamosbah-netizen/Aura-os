import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AccessService, DocumentAccessResolver, type AccessContextProvider } from '@aura/core';
import type { Document, DocumentActor, DocumentPermissionLevel } from '@aura/shared';
import { CommissioningService } from '@aura/commissioning';

/**
 * A WITNESS'S SIGNATURE BELONGS TO THE SYSTEM IT SIGNED OFF, NOT TO WHOEVER HELD THE TABLET.
 *
 * DMS decides access from the document's own engine — owner, direct share, team, role, company and
 * entity-inherited context — and it deliberately ignores the global permission wildcard, so being
 * able to reach the commissioning record is not the same as being allowed the file behind it. A
 * signature stored by `DmsService` carries no shares, which would leave the T&C engineer who
 * recorded the sign-off as its only reader.
 *
 * That is the wrong answer for this document in particular. A witnessed sign-off is what the
 * handover dossier, the O&M pack and the client's own acceptance all rest on: the QA/QC manager
 * checking the pack, the Handover/FM user assembling the dossier and the Project Manager answering
 * a defects claim can all SEE that a system was witnessed, and none of them could open what the
 * witness actually signed.
 *
 * ## The rule
 *
 * Whoever may READ the commissioning record may open its sign-off evidence. Not "anyone on the
 * project", which is wider than the record; not "the recorder", which is where it starts. The
 * document inherits the reachability of the record it evidences — what the `context` source is
 * for, and what site evidence, controlled revision content and the handover acceptance already do.
 *
 * VIEW and DOWNLOAD only. EDIT is never granted here: replacing the image a consultant signed is
 * not a reading action, and no role should acquire it by being able to read the record.
 */
@Injectable()
export class CommissioningSignoffDocumentAccessProvider implements AccessContextProvider, OnModuleInit {
  /** Recorded on the `context` source, so a surface can say where the access came from. */
  readonly entity = 'commissioning.record';

  constructor(
    private readonly resolver: DocumentAccessResolver,
    private readonly commissioning: CommissioningService,
    private readonly access: AccessService,
  ) {}

  onModuleInit(): void {
    this.resolver.registerContextProvider(this);
  }

  async grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]> {
    if (document.aggregateType !== 'commissioning.record') return [];

    // Tenant check over RLS, as the sibling providers do: a cross-tenant id must never resolve to
    // access even if some store somewhere is not filtering.
    const record = await this.commissioning.get(document.aggregateId, actor.tenantId);
    if (!record || record.tenantId !== actor.tenantId) return [];

    // The permission the record's own read route derives, asked of AccessService so the two cannot
    // drift: if someone may not read the system, they may not open what witnessed it.
    const decision = this.access.can(actor.userId, {
      permission: 'commissioning.record.read',
      orgPath: [{ level: 'tenant', id: actor.tenantId }],
    });
    return decision.allowed ? ['VIEW', 'DOWNLOAD'] : [];
  }
}
