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
  submittedAt: string | null;
  acceptedAt: string | null;
  clientRepresentative: string | null;
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
    submittedAt: null,
    acceptedAt: null,
    clientRepresentative: null,
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
export function submit(pkg: HandoverPackage): HandoverPackage {
  if (pkg.status === 'accepted') throw new Error('conflict: package is already accepted');
  if (!isReadyToSubmit(pkg.checklist)) {
    throw new Error('only a package with O&M manuals, as-builts and test certificates can be submitted');
  }
  return {
    ...pkg,
    status: 'submitted',
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
  patch: { clientRepresentative: string; warrantyStartDate?: string; warrantyMonths?: number },
): HandoverPackage {
  if (pkg.status === 'accepted') throw new Error('conflict: package is already accepted');
  if (pkg.status !== 'submitted') throw new Error('only a submitted package can be accepted');
  if (!patch.clientRepresentative?.trim()) {
    throw new Error('validation: a client representative is required to accept handover');
  }
  const now = new Date().toISOString();
  return {
    ...pkg,
    status: 'accepted',
    acceptedAt: now,
    clientRepresentative: patch.clientRepresentative.trim(),
    warrantyStartDate: patch.warrantyStartDate ?? now.slice(0, 10),
    warrantyMonths: patch.warrantyMonths ?? 12,
    updatedAt: now,
  };
}

/** Client rejects the submission — records why and returns it to draft for rework. */
export function reject(pkg: HandoverPackage, reason: string): HandoverPackage {
  if (pkg.status === 'accepted') throw new Error('conflict: package is already accepted');
  if (pkg.status !== 'submitted') throw new Error('only a submitted package can be rejected');
  return {
    ...pkg,
    status: 'rejected',
    remarks: reason?.trim() || pkg.remarks,
    updatedAt: new Date().toISOString(),
  };
}
