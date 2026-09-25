import { randomUUID } from 'node:crypto';
import type { Itp } from './itp';
import { checklistPoints, type ChecklistPointInput, type ItpTemplate } from './itp-template';

/**
 * THE PROJECT'S SYSTEM CHECKLIST — layers 2 and 3 of the approved checklist.
 *
 * Quality adopts a published template into the project, adapts its points to the project's
 * specification, and sends the revision for approval. A QA/QC person OTHER than the one who prepared
 * it approves it, and from that moment its system, points, acceptance criteria and mandatory flags are
 * frozen — here, in the service, and in PostgreSQL (migration 0388). A change is the next revision,
 * which supersedes this one for records bound afterwards; a record already bound keeps this one.
 *
 * The system is the TEMPLATE's canonical id. It is never read from the free-text `discipline` of an
 * installation-inspection plan, and never inferred from a title.
 */

const isSystemPlan = (itp: Itp): boolean => itp.kind === 'system_commissioning';

function assertSystemPlan(itp: Itp): void {
  if (!isSystemPlan(itp)) {
    throw new Error(`ITP ${itp.reference} is an installation-inspection plan — revising and approving is not allowed for it; it keeps its own lifecycle`);
  }
}

export function prepareSystemItp(input: {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  reference: string;
  template: ItpTemplate;
  revision: number;
  parent?: Itp | null;
  createdBy: string | null;
}): Itp {
  const { template } = input;
  if (template.status !== 'published') {
    throw new Error(`only a published template can be adopted — ${template.system} v${template.version} is ${template.status}`);
  }
  if (!input.projectId) throw new Error('validation: projectId is required');
  if (!input.reference?.trim()) throw new Error('validation: reference is required');
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error('validation: revision must be a positive integer');
  if (input.parent && (input.parent.system !== template.system || input.parent.projectId !== input.projectId)) {
    throw new Error('the previous revision belongs to a different project or system than the template being adopted');
  }
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    reference: input.reference.trim(),
    title: template.title,
    discipline: 'elv',
    status: 'draft',
    activatedBy: null,
    activatedAt: null,
    closedBy: null,
    closedAt: null,
    points: template.points.map((p) => ({ ...p, result: 'pending' as const })),
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    kind: 'system_commissioning',
    system: template.system,
    revision: input.revision,
    parentItpId: input.parent?.id ?? null,
    sourceTemplateId: template.id,
    sourceTemplateVersion: template.version,
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    supersededBy: null,
    supersededAt: null,
    returnedReason: null,
  };
}

/** The next revision of an approved checklist — its content, to be changed and approved again. */
export function reviseSystemItp(approved: Itp, input: { revision: number; reference?: string; createdBy: string | null }): Itp {
  assertSystemPlan(approved);
  if (approved.status !== 'approved') {
    throw new Error(`only the current approved revision can be revised — revision ${approved.revision} is ${approved.status}`);
  }
  if (!Number.isInteger(input.revision) || input.revision <= (approved.revision ?? 0)) {
    throw new Error('validation: the next revision must be numbered after the approved one');
  }
  const now = new Date().toISOString();
  return {
    ...approved,
    id: randomUUID(),
    reference: input.reference?.trim() || approved.reference,
    status: 'draft',
    points: approved.points.map((p) => ({ ...p, result: 'pending' as const })),
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    revision: input.revision,
    parentItpId: approved.id,
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    supersededBy: null,
    supersededAt: null,
    returnedReason: null,
  };
}

/** Quality adapts the draft to the project's specification. Only a draft changes. */
export function editSystemItp(itp: Itp, patch: { title?: string; points?: ChecklistPointInput[] }): Itp {
  assertSystemPlan(itp);
  if (itp.status !== 'draft') {
    throw new Error(`ITP revision ${itp.revision} can only be changed in draft — it is ${itp.status}; an approved revision is immutable and a change is the next revision`);
  }
  return {
    ...itp,
    title: patch.title !== undefined ? (patch.title.trim() || itp.title) : itp.title,
    points: patch.points !== undefined ? checklistPoints(patch.points) : itp.points,
    updatedAt: new Date().toISOString(),
  };
}

export function submitSystemItp(itp: Itp, actorId: string | null): Itp {
  assertSystemPlan(itp);
  if (itp.status !== 'draft') throw new Error(`ITP revision ${itp.revision} can only be submitted from draft — it is ${itp.status}`);
  if (!actorId) throw new Error('validation: submitting a revision for approval requires an authenticated person');
  if (itp.points.length === 0) throw new Error('validation: a checklist needs at least one test point');
  const now = new Date().toISOString();
  return { ...itp, status: 'submitted', submittedBy: actorId, submittedAt: now, returnedReason: null, updatedAt: now };
}

/** Whoever prepared or submitted the revision is not its approver — nor the one who returns it. */
function assertIndependent(itp: Itp, actorId: string, act: 'approve' | 'return'): void {
  if (actorId === itp.createdBy || actorId === itp.submittedBy) {
    throw new Error(
      `access denied: the person who prepared ITP revision ${itp.revision} may not ${act} it — a checklist is approved by a QA/QC person other than its author`,
    );
  }
}

export function approveSystemItp(itp: Itp, actorId: string | null): Itp {
  assertSystemPlan(itp);
  if (!actorId) throw new Error('validation: approving a revision requires an authenticated person');
  if (itp.status !== 'submitted') throw new Error(`ITP revision ${itp.revision} can only be approved once submitted — it is ${itp.status}`);
  assertIndependent(itp, actorId, 'approve');
  const now = new Date().toISOString();
  return { ...itp, status: 'approved', approvedBy: actorId, approvedAt: now, updatedAt: now };
}

export function returnSystemItp(itp: Itp, actorId: string | null, reason: string | null | undefined): Itp {
  assertSystemPlan(itp);
  if (!actorId) throw new Error('validation: returning a revision requires an authenticated person');
  if (itp.status !== 'submitted') throw new Error(`ITP revision ${itp.revision} can only be returned while submitted — it is ${itp.status}`);
  if (!reason?.trim()) throw new Error('validation: returning a revision requires a reason — the preparer has to know what to change');
  assertIndependent(itp, actorId, 'return');
  return { ...itp, status: 'draft', returnedReason: reason.trim(), updatedAt: new Date().toISOString() };
}

/** The approved revision gives way to the next approved one — for records bound from now on. */
export function supersedeSystemItp(itp: Itp, newerId: string): Itp {
  assertSystemPlan(itp);
  if (itp.status !== 'approved') throw new Error(`ITP revision ${itp.revision} can only be superseded while approved — it is ${itp.status}`);
  const now = new Date().toISOString();
  return { ...itp, status: 'superseded', supersededBy: newerId, supersededAt: now, updatedAt: now };
}
