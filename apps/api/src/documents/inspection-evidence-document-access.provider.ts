import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AccessService, DocumentAccessResolver, type AccessContextProvider } from '@aura/core';
import type { Document, DocumentActor, DocumentPermissionLevel } from '@aura/shared';
import { QualityService } from '@aura/quality';

/**
 * AN INSPECTION'S EVIDENCE BELONGS TO THE INSPECTION, NOT TO WHOEVER HELD THE CAMERA.
 *
 * DMS decides access from the document's own engine — owner, direct share, team, role, company and
 * entity-inherited context — and it deliberately ignores the global permission wildcard, so
 * reaching the inspection route is not the same as being allowed the file behind it. A photograph
 * or signature stored by `DmsService` carries no shares, which leaves the QA/QC engineer who
 * uploaded it as its only reader.
 *
 * That is the wrong answer here in a way that has money attached. An approved inspection accrues
 * the measured quantity on the Quantity Ledger, so the QS valuing that quantity, the Project
 * Manager answering for it and the consultant's own counterpart all read this record — and none of
 * them could open the photograph the approval rests on, or the signature that decided it.
 *
 * ## The rule
 *
 * Whoever may READ the inspection request may open its evidence. Not "anyone on the project",
 * which is wider than the record; not "the uploader", which is where it starts. The document
 * inherits the reachability of the record it evidences — what the `context` source exists for, and
 * what site evidence, controlled revision content, the handover acceptance and the commissioning
 * sign-off already do.
 *
 * VIEW and DOWNLOAD only. EDIT is never granted here: replacing the photograph an inspection was
 * approved on is not a reading action, and no role should acquire it by being able to read the IR.
 */
@Injectable()
export class InspectionEvidenceDocumentAccessProvider implements AccessContextProvider, OnModuleInit {
  /** Recorded on the `context` source, so a surface can say where the access came from. */
  readonly entity = 'quality.inspection-request';

  constructor(
    private readonly resolver: DocumentAccessResolver,
    private readonly quality: QualityService,
    private readonly access: AccessService,
  ) {}

  onModuleInit(): void {
    this.resolver.registerContextProvider(this);
  }

  async grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]> {
    if (document.aggregateType !== 'quality.inspection-request') return [];

    // Tenant check over RLS, as the sibling providers do: a cross-tenant id must never resolve to
    // access even if some store somewhere is not filtering.
    const found = await this.quality.readInspection(actor.tenantId, document.aggregateId);
    if (!found || found.inspection.tenantId !== actor.tenantId) return [];

    // The permission the inspection's own read route derives, asked of AccessService so the two
    // cannot drift: if someone may not read the inspection, they may not open what it rests on.
    const decision = this.access.can(actor.userId, {
      permission: 'quality.ir.read',
      orgPath: [{ level: 'tenant', id: actor.tenantId }],
    });
    return decision.allowed ? ['VIEW', 'DOWNLOAD'] : [];
  }
}
