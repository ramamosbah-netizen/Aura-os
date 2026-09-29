import { Global, Injectable, Module, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Id } from '@aura/shared';
import { DmsService, TenantContext } from '@aura/core';
import { COMPLIANCE_EVIDENCE, type ComplianceEvidencePort, type EvidenceAnswer } from '@aura/compliance';
import { DocControlService } from '@aura/doccontrol';

/**
 * WHAT PROVES A SUBMISSION TO AN AUTHORITY — answered from the modules that own the evidence (SEC-01 D-09).
 *
 *   a controlled package   a Document Control transmittal in this tenant that was actually SENT; a draft
 *                          transmittal proves nothing went to the authority
 *   a portal submission    a stored DMS document the recorder can open — the portal's receipt
 *
 * Reaches both modules through `ModuleRef` at call time rather than importing them, the pattern the other
 * wiring adapters use, so this cannot close a module-import loop. When an owning service cannot be reached
 * the answer is a refusal with the reason, never a pass.
 */
@Injectable()
export class ComplianceEvidenceAdapter implements ComplianceEvidencePort {
  constructor(private readonly moduleRef: ModuleRef) {}

  private resolve<T>(token: Type<T>): T | null {
    try {
      return this.moduleRef.get(token, { strict: false });
    } catch {
      return null;
    }
  }

  async sentTransmittal(tenantId: Id, transmittalId: Id): Promise<EvidenceAnswer> {
    const doccontrol = this.resolve(DocControlService);
    if (!doccontrol) return { ok: false, reason: 'Document Control could not be reached to check the transmittal' };
    const transmittal = await doccontrol.getTransmittal(tenantId, transmittalId);
    if (!transmittal) return { ok: false, reason: `transmittal ${transmittalId} was not found` };
    if (transmittal.status === 'draft') {
      return { ok: false, reason: `transmittal ${transmittal.code} is still a draft — nothing has been sent to the authority` };
    }
    return { ok: true };
  }

  async readableDocument(tenantId: Id, documentId: Id, actorId: Id | null): Promise<EvidenceAnswer> {
    const dms = this.resolve(DmsService);
    const tenant = this.resolve(TenantContext);
    if (!dms) return { ok: false, reason: 'the document store could not be reached to check the evidence' };
    const ctx = tenant?.get() as { companyId?: Id | null; teamIds?: Id[]; roleIds?: Id[] } | undefined;
    try {
      await dms.getFor(documentId, {
        userId: actorId ?? 'anonymous', tenantId, companyId: ctx?.companyId ?? null,
        teamIds: ctx?.teamIds ?? [], roleIds: ctx?.roleIds ?? [],
      });
      return { ok: true };
    } catch {
      // The DMS does not say whether a document exists to someone who cannot open it, and neither
      // does this: either way it is not evidence this recorder can stand behind.
      return { ok: false, reason: `document ${documentId} is not a stored document you can open` };
    }
  }
}

/** App-layer wiring for Compliance's evidence port. Imports nothing, so no module loop can form. */
@Global()
@Module({
  providers: [ComplianceEvidenceAdapter, { provide: COMPLIANCE_EVIDENCE, useExisting: ComplianceEvidenceAdapter }],
  exports: [COMPLIANCE_EVIDENCE],
})
export class ComplianceWiringModule {}
