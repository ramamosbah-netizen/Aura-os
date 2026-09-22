import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AccessService, DocumentAccessResolver, type AccessContextProvider } from '@aura/core';
import type { Document, DocumentActor, DocumentPermissionLevel } from '@aura/shared';
import { HandoverService } from '@aura/commissioning';

/**
 * THE CLIENT'S SIGNATURE BELONGS TO THE ACCEPTANCE, NOT TO WHOEVER HELD THE TABLET.
 *
 * DMS decides access from the document's own engine — owner, direct share, team, role, company and
 * entity-inherited context — and it deliberately ignores the global permission wildcard, so
 * reaching the acceptance route is not the same as being allowed the file behind it. A signature
 * stored by `DmsService` carries no shares, which leaves the Handover/FM user who recorded the
 * acceptance as its only reader.
 *
 * That is the same defect the site evidence provider fixed one record along: the Project Manager,
 * the T&C engineer and the commercial team can all SEE that a package was accepted, by whom and on
 * what date, and could not open the thing that was signed. A warranty claim, a defects-liability
 * dispute and a final payment application all turn on this document; "the record mentions a
 * signature" is not the same as being able to look at it.
 *
 * ## The rule
 *
 * Whoever may READ the handover package may open its acceptance signature. Not "anyone on the
 * project", which is wider than the package itself; not "the recorder", which is where it started.
 * The document inherits the reachability of the record it closes — what the `context` source is
 * for, and what CRM, site evidence and controlled revision content already do.
 *
 * VIEW and DOWNLOAD only. EDIT is never granted here: replacing the image the client signed is not
 * a reading action, and no role should acquire it by being able to read the package. The recorder
 * keeps edit through ownership, which is a separate question from this one.
 */
@Injectable()
export class HandoverAcceptanceDocumentAccessProvider implements AccessContextProvider, OnModuleInit {
  /** Recorded on the `context` source, so a surface can say where the access came from. */
  readonly entity = 'commissioning.handover';

  constructor(
    private readonly resolver: DocumentAccessResolver,
    private readonly handover: HandoverService,
    private readonly access: AccessService,
  ) {}

  onModuleInit(): void {
    this.resolver.registerContextProvider(this);
  }

  async grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]> {
    if (document.aggregateType !== 'commissioning.handover') return [];

    // Tenant check over RLS, as the sibling providers do: a cross-tenant id must never resolve to
    // access even if some store somewhere is not filtering.
    const pkg = await this.handover.get(document.aggregateId, actor.tenantId);
    if (!pkg || pkg.tenantId !== actor.tenantId) return [];

    // The permission the package's own read route derives, asked of AccessService so the two
    // cannot drift: if someone may not read the handover, they may not open what closed it.
    const decision = this.access.can(actor.userId, {
      permission: 'commissioning.handover.read',
      orgPath: [{ level: 'tenant', id: actor.tenantId }],
    });
    return decision.allowed ? ['VIEW', 'DOWNLOAD'] : [];
  }
}
