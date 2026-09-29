import type { Id } from '@aura/shared';

/**
 * WHAT PROVES A SUBMISSION — asked of Document Control and the DMS without this module importing them
 * (SEC-01 D-09, owner 2026-09-29: "a submission must never exist without evidence").
 *
 * An id alone is not evidence: a transmittal that does not exist, or was never sent, proves nothing
 * went to the authority; a document the recorder cannot open is not something they can stand behind.
 * The app layer answers both from the owning modules (apps/api/src/wiring).
 */
export const COMPLIANCE_EVIDENCE = Symbol('COMPLIANCE_EVIDENCE');

export type EvidenceAnswer = { ok: true } | { ok: false; reason: string };

export interface ComplianceEvidencePort {
  /** A doccontrol transmittal in this tenant that has actually been SENT (sent, received or acknowledged). */
  sentTransmittal(tenantId: Id, transmittalId: Id): Promise<EvidenceAnswer>;
  /** A stored document in this tenant that the recorder can open. */
  readableDocument(tenantId: Id, documentId: Id, actorId: Id | null): Promise<EvidenceAnswer>;
}
