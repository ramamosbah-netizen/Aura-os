import { type Id, newId } from '@aura/shared';

// Handover domain — framework-free. A HandoverPackage is the project-level acceptance event
// that follows commissioning: the contractor compiles the deliverables (O&M manuals, as-built
// drawings, test certificates, warranty documents, training, spares), submits them to the
// client, and the client formally accepts — which starts the warranty/DLP clock. It is the
// contractual close of delivery and the trigger for AMC. One package per project.

export type HandoverStatus = 'draft' | 'submitted' | 'accepted' | 'rejected';

/**
 * HOW THE CLIENT ACCEPTED — and therefore what has to be on file.
 *
 * An electronic signature is not mandatory. An acceptance signed on paper at a walk-down, or
 * confirmed by email, is a real acceptance and refusing it would push people into recording a
 * fiction. What is mandatory is that the METHOD IS DECLARED and the evidence for it is kept:
 *
 *   electronic   the signature the client gave on the pad
 *   paper        a copy of the signed acceptance document
 *   email        the message, or the document, that proves the acceptance
 *
 * The absence of a method is the fourth case and is deliberately NOT a member of this type: a
 * `name-only` acceptance is recorded against the representative's name with no evidencing
 * document. Those are kept as they are. What they may never do is produce a claim that somebody
 * signed — which is why `acceptanceEvidence` below reports them as their own answer rather than
 * as a weaker kind of signature.
 */
export type AcceptanceMethod = 'electronic' | 'paper' | 'email';

export const ACCEPTANCE_METHODS: readonly AcceptanceMethod[] = ['electronic', 'paper', 'email'];

/** What each method's evidence IS, in the words a certificate can print. */
export const ACCEPTANCE_METHOD_EVIDENCE: Record<AcceptanceMethod, string> = {
  electronic: 'the signature the client gave',
  paper: 'the signed acceptance document',
  email: 'the message confirming acceptance',
};

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
  acceptanceMethod: AcceptanceMethod | null;
  acceptanceEvidenceDocumentId: Id | null;
  acceptanceEvidenceHash: string | null;
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
    acceptanceMethod: null,
    acceptanceEvidenceDocumentId: null,
    acceptanceEvidenceHash: null,
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
     * HOW they accepted and WHAT proves it — together or not at all.
     *
     * A method with no document is a claim; a document with no method is a file nobody can
     * describe. And a reference with no hash cannot be checked against the bytes while a hash
     * with no reference names nothing. All four move as one, so no surface can ever read a
     * half-record as evidence.
     *
     * Omitted entirely means the legacy `name-only` acceptance, which stays valid and stays
     * distinguishable.
     */
    evidence?: { method: AcceptanceMethod; documentId: Id; hash: string } | null;
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
  // A REFERENCE WITHOUT ITS HASH IS NOT EVIDENCE, and neither is a method without a document.
  // Written together or not at all, so no acceptance can point at something nothing attests to
  // or describe a proof it does not hold.
  if (patch.evidence) {
    const { method, documentId, hash } = patch.evidence;
    if (!ACCEPTANCE_METHODS.includes(method)) {
      throw new Error(`validation: an acceptance method must be one of ${ACCEPTANCE_METHODS.join(', ')}`);
    }
    if (!(documentId?.trim() && hash?.trim())) {
      throw new Error('validation: an acceptance method requires both the stored evidence and its checksum \u2014 one without the other attests to nothing');
    }
  }
  const now = new Date().toISOString();
  return {
    ...pkg,
    status: 'accepted',
    acceptedBy: actorId,
    acceptedAt: now,
    clientRepresentative: patch.clientRepresentative.trim(),
    acceptanceMethod: patch.evidence?.method ?? null,
    acceptanceEvidenceDocumentId: patch.evidence?.documentId ?? null,
    acceptanceEvidenceHash: patch.evidence?.hash ?? null,
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
 * WHAT THE ACCEPTANCE IS EVIDENCED BY — so no surface can imply a proof it does not hold.
 *
 * Same reporting contract as `handoverSeparation`: `null` means it has not been accepted, so there
 * is nothing to describe.
 *
 * The three methods each return themselves, because they are NOT interchangeable on a document: a
 * captured signature can be shown, a scanned signed page can be named, and an emailed
 * confirmation is neither and must not be printed as though somebody had signed.
 *
 * `recorded-without-evidence` is the legacy `name-only` acceptance. It is a real acceptance and it
 * is kept — but it is its own answer, never a weaker kind of signature, so a certificate reading
 * this value cannot render it as one.
 *
 * A method with no document, or a document with no method, is impossible by construction in
 * `accept`. If one is ever seen it is reported as `recorded-without-evidence` rather than trusted:
 * a half-record is not proof, and the safe direction is to claim less.
 */
export function acceptanceEvidence(
  pkg: HandoverPackage,
): AcceptanceMethod | 'recorded-without-evidence' | null {
  if (pkg.status !== 'accepted') return null;
  if (!pkg.acceptanceMethod || !pkg.acceptanceEvidenceDocumentId) return 'recorded-without-evidence';
  return pkg.acceptanceMethod;
}

/**
 * May this acceptance be described as SIGNED?
 *
 * Only two of the four can: an electronic signature and a scanned signed document. An email
 * confirmation proves acceptance and proves nothing about a signature, and a name-only record
 * proves neither. Certificates ask this rather than testing for the presence of a file, because
 * “has a document” and “was signed” are different questions and conflating them is how an email
 * becomes a signature on a printed page.
 */
export function acceptanceIsSigned(pkg: HandoverPackage): boolean {
  const evidence = acceptanceEvidence(pkg);
  return evidence === 'electronic' || evidence === 'paper';
}
