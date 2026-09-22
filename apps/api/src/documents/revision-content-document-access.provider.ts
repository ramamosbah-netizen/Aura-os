import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AccessService, DocumentAccessResolver, type AccessContextProvider } from '@aura/core';
import type { Document, DocumentActor, DocumentPermissionLevel } from '@aura/shared';
import { DocControlService } from '@aura/doccontrol';

/**
 * A CONTROLLED DOCUMENT'S CONTENT IS AS READABLE AS THE REVISION THAT GOVERNS IT.
 *
 * DOC-CONTENT-01 gave a revision somewhere to keep the drawing. It did not make the drawing
 * reachable: `DmsService` creates a document with no shares, so only the author who uploaded it
 * could open it. Measured on the handover chain, with the Technical Engineer as author and the
 * document ISSUED by the Document Controller, the Handover/FM recipient got 403 on the artifact
 * the dossier had just offered them. A pack that names a file nobody downstream can open is the
 * same defect as a pack with no file, one step later.
 *
 * ## The rule, and why the status decides it
 *
 * DRAFT is the author's. Nobody else is meant to see it: it has not been put up for review, and
 * the lifecycle says so.
 *
 * FROM SUBMISSION ONWARD — submitted, under_review, approved, issued, superseded — whoever may
 * READ the register may download the content. The register's status IS the disclosure statement:
 * a revision that has been submitted has been offered for review, one that is issued has been
 * released, and a superseded one is the history the register promises to keep. Asking a second,
 * different question here would let the two answers drift.
 *
 * VIEW and DOWNLOAD only. EDIT belongs to authorship, which the domain already confines to a
 * draft — a reader must never be able to swap the file a reviewer approved.
 */
@Injectable()
export class RevisionContentDocumentAccessProvider implements AccessContextProvider, OnModuleInit {
  /** Recorded on the `context` source, so a surface can say where the access came from. */
  readonly entity = 'doccontrol.revision';

  constructor(
    private readonly resolver: DocumentAccessResolver,
    private readonly docControl: DocControlService,
    private readonly access: AccessService,
  ) {}

  onModuleInit(): void {
    this.resolver.registerContextProvider(this);
  }

  async grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]> {
    if (document.aggregateType !== 'doccontrol.revision') return [];

    // Tenant check over RLS, as the sibling providers do: a cross-tenant id must never resolve
    // to access even if some store is not filtering.
    const rev = await this.docControl.getDocumentRevision(actor.tenantId, document.aggregateId);
    if (!rev || rev.tenantId !== actor.tenantId) return [];

    // A draft has been shown to nobody. The author keeps it through ownership.
    if (rev.status === 'draft') return [];

    const decision = this.access.can(actor.userId, {
      permission: 'doccontrol.revision.read',
      orgPath: [{ level: 'tenant', id: actor.tenantId }],
    });
    return decision.allowed ? ['VIEW', 'DOWNLOAD'] : [];
  }
}
