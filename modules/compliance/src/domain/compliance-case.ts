import { type Id, type ElvSystem, newId, toElvSystem } from '@aura/shared';

/**
 * A compliance case — the unit of work between "this system needs SIRA approval" and a certificate
 * that says it has it (ADR-0018 §2).
 *
 * One model for every authority. SIRA and DCD differ in *data* — which documents, which fee, which
 * validity period — not in mechanics, and data belongs in an applicability rule rather than a
 * forked aggregate.
 */

// ── Scope (ADR-0018 §6) ────────────────────────────────────────────────────────────────────────

/**
 * What the case binds. SIRA licenses the **company** and cards **technicians**; DCD does not.
 * A case therefore attaches to different kinds of subject, and the alternative — `projectId?` +
 * `companyId?` + `personId?` — is three nullable columns that permit a row where all three are
 * null and no constraint can catch it.
 */
export const COMPLIANCE_SCOPES = ['PROJECT', 'COMPANY', 'PERSON'] as const;
export type ComplianceScope = (typeof COMPLIANCE_SCOPES)[number];

/** Which subject type each scope must point at. The service resolves the id; the domain pins the pairing. */
export const SCOPE_SUBJECT: Readonly<Record<ComplianceScope, string>> = {
  PROJECT: 'project',
  COMPANY: 'company',
  PERSON: 'person',
};

// ── Coverage (ADR-0018 §10) ────────────────────────────────────────────────────────────────────

/**
 * What the approval covers. Explicit rather than a bare `deviceIds[]`, which cannot distinguish
 * "covers nothing yet" from "covers everything" — and that ambiguity decides whether a device
 * added after approval is inside the certificate or outside it.
 */
export const COVERAGE_MODES = ['ALL_SYSTEM_DEVICES', 'SELECTED_DEVICES'] as const;
export type CoverageMode = (typeof COVERAGE_MODES)[number];

// ── Status ─────────────────────────────────────────────────────────────────────────────────────

export const CASE_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'inspection',
  'approved',
  'certified',
  'rejected',
  'expired',
  'withdrawn',
] as const;
export type ComplianceCaseStatus = (typeof CASE_STATUSES)[number];

export interface ComplianceCase {
  id: Id;
  tenantId: Id;
  companyId: Id | null;

  /** Which authority, by code — resolved against the Authority reference table. */
  authorityCode: string;
  /** What obligation this case discharges, e.g. `SIRA_SYSTEM_CERTIFICATION`. */
  obligationCode: string;

  scope: ComplianceScope;
  subjectType: string;
  subjectId: Id;

  /** Present for PROJECT-scoped cases: the ELV system being certified. */
  projectId: Id | null;
  system: ElvSystem | null;
  coverage: CoverageMode;
  /** Only meaningful under SELECTED_DEVICES; empty otherwise. */
  deviceIds: Id[];

  reference: string | null;
  status: ComplianceCaseStatus;
  notes: string | null;

  createdAt: string;
  createdBy: Id | null;
  updatedAt: string;
}

export interface NewComplianceCase {
  tenantId: Id;
  companyId?: Id | null;
  authorityCode: string;
  obligationCode: string;
  scope: ComplianceScope;
  subjectId: Id;
  projectId?: Id | null;
  system?: unknown;
  coverage?: CoverageMode;
  deviceIds?: Id[];
  reference?: string | null;
  notes?: string | null;
  createdBy?: Id | null;
}

const trimOrNull = (v: string | null | undefined): string | null => ((v ?? '').trim() || null);

export function makeComplianceCase(input: NewComplianceCase): ComplianceCase {
  if (!input.tenantId) throw new Error('tenantId is required');
  const authorityCode = (input.authorityCode ?? '').trim().toUpperCase();
  if (!authorityCode) throw new Error('authorityCode is required');
  const obligationCode = (input.obligationCode ?? '').trim().toUpperCase();
  if (!obligationCode) throw new Error('obligationCode is required');
  if (!COMPLIANCE_SCOPES.includes(input.scope)) throw new Error(`unknown scope ${String(input.scope)}`);
  if (!input.subjectId) throw new Error('subjectId is required');

  const coverage: CoverageMode = input.coverage ?? 'ALL_SYSTEM_DEVICES';
  const deviceIds = coverage === 'SELECTED_DEVICES' ? [...new Set(input.deviceIds ?? [])] : [];
  if (coverage === 'SELECTED_DEVICES' && deviceIds.length === 0) {
    // The mode says "these specific units"; saying that and naming none is the ambiguity the
    // explicit coverage flag exists to remove.
    throw new Error('SELECTED_DEVICES coverage requires at least one device');
  }

  // A project-scoped case is about a system on a project; the pairing is required together.
  const projectId = input.scope === 'PROJECT' ? (input.projectId ?? input.subjectId) : (input.projectId ?? null);
  if (input.scope === 'PROJECT' && !projectId) throw new Error('a PROJECT-scoped case requires a projectId');

  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    authorityCode,
    obligationCode,
    scope: input.scope,
    subjectType: SCOPE_SUBJECT[input.scope],
    subjectId: input.subjectId,
    projectId,
    system: input.system === undefined || input.system === null ? null : toElvSystem(input.system),
    coverage,
    deviceIds,
    reference: trimOrNull(input.reference),
    status: 'draft',
    notes: trimOrNull(input.notes),
    createdAt: now,
    createdBy: input.createdBy ?? null,
    updatedAt: now,
  };
}

/**
 * Legal transitions.
 *
 * The loop that matters is `rejected → submitted`: a refusal is not the end of a case, it is the
 * middle of one. `certified → submitted` and `expired → submitted` are the renewal path, which is
 * the same journey run again rather than a different kind of object.
 */
const NEXT: Record<ComplianceCaseStatus, ComplianceCaseStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'rejected', 'withdrawn'],
  under_review: ['inspection', 'approved', 'rejected'],
  inspection: ['approved', 'rejected', 'under_review'],
  approved: ['certified', 'rejected'],
  certified: ['expired', 'submitted'],
  rejected: ['submitted', 'withdrawn'],
  expired: ['submitted', 'withdrawn'],
  withdrawn: [],
};

export function setCaseStatus(c: ComplianceCase, status: ComplianceCaseStatus): ComplianceCase {
  if (c.status === status) return c;
  if (!NEXT[c.status].includes(status)) {
    throw new Error(`only ${NEXT[c.status].join(', ') || 'nothing'} can follow ${c.status}`);
  }
  return { ...c, status, updatedAt: new Date().toISOString() };
}

/** Whether a device is inside this case's coverage. */
export function covers(c: ComplianceCase, deviceId: Id): boolean {
  return c.coverage === 'ALL_SYSTEM_DEVICES' ? true : c.deviceIds.includes(deviceId);
}
