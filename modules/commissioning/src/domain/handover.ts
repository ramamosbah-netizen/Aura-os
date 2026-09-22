import { type Id, newId } from '@aura/shared';

// Handover domain — framework-free. A HandoverPackage is the project-level acceptance event
// that follows commissioning: the contractor compiles the deliverables (O&M manuals, as-built
// drawings, test certificates, warranty documents, training, spares), submits them to the
// client, and the client formally accepts — which starts the warranty/DLP clock. It is the
// contractual close of delivery and the trigger for AMC. One package per project.

export type HandoverStatus = 'draft' | 'submitted' | 'accepted' | 'rejected';

/** The close-out deliverables an ELV client expects before signing acceptance. */
export interface HandoverChecklist {
  omManuals: boolean;
  asBuilts: boolean;
  testCertificates: boolean;
  warrantyDocs: boolean;
  training: boolean;
  spares: boolean;
}

export interface HandoverPackage {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  projectName: string | null;
  code: string;
  title: string;
  status: HandoverStatus;
  checklist: HandoverChecklist;
  /**
   * WHO, not only when. This package had `submittedAt` and `acceptedAt` and no actor on either —
   * the two ends of a contractual handover, both anonymous. Acceptance is what starts the warranty
   * and defects-liability clock, and the only thing it recorded was a free-text
   * `clientRepresentative`; its audit event was attributed to `createdBy`, so the CLIENT'S
   * ACCEPTANCE WAS FILED AGAINST WHOEVER CREATED THE PACKAGE.
   *
   * `clientRepresentative` is kept beside `acceptedBy` and means something different: the named
   * person on the client side, who need not be a platform user at all. The pair is the same shape
   * as a transmittal's `sender` (a label) and `sentBy` (an actor).
   */
  submittedBy: Id | null;
  submittedAt: string | null;
  acceptedBy: Id | null;
  acceptedAt: string | null;
  rejectedBy: Id | null;
  rejectedAt: string | null;
  clientRepresentative: string | null;
  /**
   * WHAT THE CLIENT ACTUALLY SIGNED.
   *
   * The acceptance screen has always shown a pad labelled "Client Representative Acceptance
   * Signature" and thrown the stroke away, so the whole evidence of the contractual close was
   * `clientRepresentative` — free text, typed by one of our own users, naming somebody on the
   * client's side. A name we typed is not a signature they gave.
   *
   * A REFERENCE, not the image. DMS holds the bytes, judges them by the file-type policy under
   * the `signature` category, and decides who may open them; the hash is DMS's own, kept beside
   * the reference so the acceptance record carries its own tamper-evidence.
   *
   * Null means NO SIGNATURE WAS CAPTURED, which every surface reading this is required to say
   * rather than imply one. It is not a refusal: an acceptance signed on paper is still an
   * acceptance, and the record's job is to be honest about which kind it was.
   */
  acceptanceSignatureDocumentId: Id | null;
  acceptanceSignatureHash: string | null;
  warrantyStartDate: string | null;
  warrantyMonths: number | null;
  remarks: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewHandoverPackage {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  projectName?: string | null;
  code: string;
  title: string;
  createdBy?: Id | null;
}

const EMPTY_CHECKLIST: HandoverChecklist = {
  omManuals: false,
  asBuilts: false,
  testCertificates: false,
  warrantyDocs: false,
  training: false,
  spares: false,
};

/** The deliverables that must be attached before a package can be submitted for acceptance. */
/**
 * @deprecated since TC-GATE-4 — kept only so an existing caller cannot break silently.
 *
 * This asked three BOOLEANS whether the package was ready. Two of those three are now derived from
 * the domains that own the evidence (see domain/handover-readiness), and a tick can no longer stand
 * in for them. `submit` takes the assessed readiness instead.
 */
export function isReadyToSubmit(c: HandoverChecklist): boolean {
  return c.omManuals && c.asBuilts && c.testCertificates;
}

export function makeHandoverPackage(input: NewHandoverPackage): HandoverPackage {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    status: 'draft',
    checklist: { ...EMPTY_CHECKLIST },
    submittedBy: null,
    submittedAt: null,
    acceptedBy: null,
    acceptedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    clientRepresentative: null,
    acceptanceSignatureDocumentId: null,
    acceptanceSignatureHash: null,
    warrantyStartDate: null,
    warrantyMonths: null,
    remarks: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Toggle/patch the deliverables checklist. Not allowed once accepted. */
export function updateChecklist(pkg: HandoverPackage, patch: Partial<HandoverChecklist>): HandoverPackage {
  if (pkg.status === 'accepted') throw new Error('conflict: package is already accepted');
  return {
    ...pkg,
    checklist: { ...pkg.checklist, ...patch },
    updatedAt: new Date().toISOString(),
  };
}

/** Submit to the client. Guard: the core deliverables must be attached first. */
/**
 * Submit the package to the client.
 *
 * The gate is now the ASSESSED readiness (TC-GATE-4): the commissioning and as-built items are
 * derived from Testing & Commissioning and Engineering and cannot be ticked around, and the four
 * items nobody owns yet still need their tick. The refusal names what is standing in the way,
 * because "not ready" sends a project manager hunting.
 */
export function submit(
  pkg: HandoverPackage,
  readiness: { readyToSubmit: boolean; items: { id: string; label: string; state: string; reason: string }[] },
  actorId: Id | null = null,
): HandoverPackage {
  if (pkg.status === 'accepted') throw new Error('conflict: package is already accepted');
  if (!readiness.readyToSubmit) {
    const blocking = readiness.items.filter((i) => i.state !== 'READY');
    throw new Error(
      `only a package whose handover evidence is complete can be submitted — ${blocking.map((i) => `${i.label}: ${i.reason}`).join(' ')}`,
    );
  }
  return {
    ...pkg,
    status: 'submitted',
    submittedBy: actorId,
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Client acceptance — the contractual close. Guard: only a submitted package can be accepted;
 * a client representative is required, and this starts the warranty/DLP clock.
 */
export function accept(
  pkg: HandoverPackage,
  patch: {
    clientRepresentative: string;
    warrantyStartDate?: string;
    warrantyMonths?: number;
    /**
     * The stored signature, if one was captured. Both or neither: a reference with no hash cannot
     * be checked against the bytes, and a hash with no reference names nothing — either alone
     * would be a record that looks like evidence and is not.
     */
    signature?: { documentId: Id; hash: string } | null;
  },
  actorId: Id | null = null,
): HandoverPackage {
  if (pkg.status === 'accepted') throw new Error('conflict: package is already accepted');
  if (pkg.status !== 'submitted') throw new Error('only a submitted package can be accepted');
  if (!patch.clientRepresentative?.trim()) {
    throw new Error('validation: a client representative is required to accept handover');
  }
  // SUBMIT /= ACCEPT. Issuing the handover and accepting it are the two sides of a contractual
  // exchange, and one person holding both is not an exchange. The package was submitted by us and
  // is accepted on the client's behalf; if the same account does both, the acceptance records
  // nothing that the submission did not already say.
  if (actorId && pkg.submittedBy && actorId === pkg.submittedBy) {
    throw new Error('the person who submitted this handover may not accept it — acceptance is the client\u2019s side of the exchange, and it starts the warranty clock');
  }
  // A REFERENCE WITHOUT ITS HASH IS NOT EVIDENCE. The pair is written together or not at all, so
  // no acceptance can end up pointing at a document nothing attests to.
  if (patch.signature && !(patch.signature.documentId?.trim() && patch.signature.hash?.trim())) {
    throw new Error('validation: an acceptance signature requires both the stored document and its checksum — one without the other attests to nothing');
  }
  const now = new Date().toISOString();
  return {
    ...pkg,
    status: 'accepted',
    acceptedBy: actorId,
    acceptedAt: now,
    clientRepresentative: patch.clientRepresentative.trim(),
    acceptanceSignatureDocumentId: patch.signature?.documentId ?? null,
    acceptanceSignatureHash: patch.signature?.hash ?? null,
    warrantyStartDate: patch.warrantyStartDate ?? now.slice(0, 10),
    warrantyMonths: patch.warrantyMonths ?? 12,
    updatedAt: now,
  };
}

/** Client rejects the submission — records why and returns it to draft for rework. */
export function reject(pkg: HandoverPackage, reason: string, actorId: Id | null = null): HandoverPackage {
  if (pkg.status === 'accepted') throw new Error('conflict: package is already accepted');
  if (pkg.status !== 'submitted') throw new Error('only a submitted package can be rejected');
  // THE REASON IS REQUIRED HERE, not only at the route. It was `reason?.trim() || pkg.remarks`, so a
  // rejection with no reason silently kept whatever remark happened to be on the package and read
  // afterwards as though someone had explained it. The route guarded this; the domain did not, and
  // a domain that can be called from anywhere should not depend on one caller's manners.
  if (!reason?.trim()) throw new Error('a reason is required to reject a handover \u2014 the package goes back for rework and the record must say what for');
  const now = new Date().toISOString();
  return {
    ...pkg,
    status: 'rejected',
    remarks: reason.trim(),
    rejectedBy: actorId,
    rejectedAt: now,
    updatedAt: now,
  };
}

/**
 * Whether the two sides of the exchange were two different people. Same reporting contract as the
 * document revision and the daily report: `null` means it has not been accepted, so there is nothing
 * to judge; `unverifiable` means it was accepted before these columns existed.
 */
export function handoverSeparation(pkg: HandoverPackage): 'enforced' | 'unverifiable' | null {
  if (!pkg.acceptedBy) return null;
  return pkg.submittedBy ? 'enforced' : 'unverifiable';
}

/**
 * WHAT THE ACCEPTANCE IS EVIDENCED BY — so a surface can never imply a signature it does not have.
 *
 * Same reporting contract as `handoverSeparation`: `null` means it has not been accepted, so there
 * is nothing to describe. `signed` means the client's signature is held in DMS and the reference
 * resolves. `name-only` means the acceptance carries the representative's name and nothing else,
 * which is a real and valid way to record one — a walk-down signed on paper, a confirmation by
 * email — and is exactly what the certificate must SAY instead of printing an empty rule under a
 * sentence claiming the handover was signed.
 */
export function acceptanceEvidence(pkg: HandoverPackage): 'signed' | 'name-only' | null {
  if (pkg.status !== 'accepted') return null;
  return pkg.acceptanceSignatureDocumentId ? 'signed' : 'name-only';
}
