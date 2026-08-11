import type { Pool } from 'pg';
import { type Page, type PageParams, makePage, toElvSystem } from '@aura/shared';
import type { CaseFilter, ComplianceStore } from './store.interface';
import type { Authority } from './domain/authority';
import type { ComplianceCase, ComplianceCaseStatus, ComplianceScope, CoverageMode } from './domain/compliance-case';
import type {
  ComplianceCertificate,
  ComplianceDecision,
  ComplianceInspection,
  ComplianceSubmission,
  DecisionOutcome,
  InspectionOutcome,
} from './domain/case-records';

// Postgres adapter for the Compliance Core. Date columns are read via ::text to avoid the
// timezone-drift hazard — a certificate reading as valid on the day it expires is the exact bug
// the shared expiry projection's UTC anchoring exists to prevent, and it starts here.

const AUTH_COLS = 'id, tenant_id, code, name, jurisdiction, portal_url, active, created_at, updated_at';
const CASE_COLS = `id, tenant_id, company_id, authority_code, obligation_code, scope, subject_type,
  subject_id, project_id, system, coverage, device_ids, reference, status, notes, created_by,
  created_at, updated_at`;
const SUB_COLS = `id, tenant_id, case_id, attempt, submitted_at::text, submitted_by, reference, fee,
  currency, notes`;
const INSP_COLS = `id, tenant_id, case_id, requested_at::text, scheduled_at::text, conducted_at::text,
  inspector_reference, inspection_reference, outcome, notes, reinspection_required,
  reinspection_date::text`;
const DEC_COLS = `id, tenant_id, case_id, submission_id, outcome, decision_date::text, decision_by,
  reference, conditions, reason`;
const CERT_COLS = `id, tenant_id, case_id, number, issued_at::text, expires_at::text,
  superseded_by_certificate_id, notes`;

export class PostgresComplianceStore implements ComplianceStore {
  constructor(private readonly pool: Pool) {}

  // ── Authorities ──────────────────────────────────────────────────────────────
  async saveAuthority(a: Authority): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_compliance_authorities (${AUTH_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, jurisdiction = EXCLUDED.jurisdiction,
         portal_url = EXCLUDED.portal_url, active = EXCLUDED.active, updated_at = EXCLUDED.updated_at`,
      [a.id, a.tenantId, a.code, a.name, a.jurisdiction, a.portalUrl, a.active, a.createdAt, a.updatedAt],
    );
  }

  async findAuthority(id: string, tenantId: string): Promise<Authority | null> {
    const r = await this.pool.query(
      `SELECT ${AUTH_COLS} FROM public.aura_compliance_authorities WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return r.rows[0] ? toAuthority(r.rows[0]) : null;
  }

  async findAuthorityByCode(tenantId: string, code: string): Promise<Authority | null> {
    const r = await this.pool.query(
      `SELECT ${AUTH_COLS} FROM public.aura_compliance_authorities WHERE tenant_id = $1 AND code = $2`,
      [tenantId, code.trim().toUpperCase()],
    );
    return r.rows[0] ? toAuthority(r.rows[0]) : null;
  }

  async listAuthorities(tenantId: string): Promise<Authority[]> {
    const r = await this.pool.query(
      `SELECT ${AUTH_COLS} FROM public.aura_compliance_authorities WHERE tenant_id = $1 ORDER BY code ASC`,
      [tenantId],
    );
    return r.rows.map(toAuthority);
  }

  // ── Cases ────────────────────────────────────────────────────────────────────
  async saveCase(c: ComplianceCase): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_compliance_cases (${CASE_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO UPDATE SET coverage = EXCLUDED.coverage, device_ids = EXCLUDED.device_ids,
         reference = EXCLUDED.reference, status = EXCLUDED.status, notes = EXCLUDED.notes,
         updated_at = EXCLUDED.updated_at`,
      [
        c.id, c.tenantId, c.companyId, c.authorityCode, c.obligationCode, c.scope, c.subjectType,
        c.subjectId, c.projectId, c.system, c.coverage, JSON.stringify(c.deviceIds), c.reference,
        c.status, c.notes, c.createdBy, c.createdAt, c.updatedAt,
      ],
    );
  }

  async findCase(id: string, tenantId: string): Promise<ComplianceCase | null> {
    const r = await this.pool.query(
      `SELECT ${CASE_COLS} FROM public.aura_compliance_cases WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return r.rows[0] ? toCase(r.rows[0]) : null;
  }

  async listCases(tenantId: string, filter?: CaseFilter): Promise<ComplianceCase[]> {
    const { where, params } = whereForCases(tenantId, filter);
    const r = await this.pool.query(
      `SELECT ${CASE_COLS} FROM public.aura_compliance_cases ${where} ORDER BY created_at DESC`,
      params,
    );
    return r.rows.map(toCase);
  }

  async listCasesPaged(tenantId: string, page: PageParams, filter?: CaseFilter): Promise<Page<ComplianceCase>> {
    const { where, params } = whereForCases(tenantId, filter);
    const total = await this.pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM public.aura_compliance_cases ${where}`,
      params,
    );
    const r = await this.pool.query(
      `SELECT ${CASE_COLS} FROM public.aura_compliance_cases ${where}
       ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, page.limit, page.offset],
    );
    return makePage(r.rows.map(toCase), Number(total.rows[0]?.c ?? 0), page);
  }

  // ── Submissions ──────────────────────────────────────────────────────────────
  async addSubmission(s: ComplianceSubmission): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_compliance_submissions
        (id, tenant_id, case_id, attempt, submitted_at, submitted_by, reference, fee, currency, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [s.id, s.tenantId, s.caseId, s.attempt, s.submittedAt, s.submittedBy, s.reference, s.fee, s.currency, s.notes],
    );
  }

  async listSubmissions(tenantId: string, caseId: string): Promise<ComplianceSubmission[]> {
    const r = await this.pool.query(
      `SELECT ${SUB_COLS} FROM public.aura_compliance_submissions
       WHERE tenant_id = $1 AND case_id = $2 ORDER BY attempt ASC`,
      [tenantId, caseId],
    );
    return r.rows.map(toSubmission);
  }

  // ── Inspections ──────────────────────────────────────────────────────────────
  async saveInspection(i: ComplianceInspection): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_compliance_inspections
        (id, tenant_id, case_id, requested_at, scheduled_at, conducted_at, inspector_reference,
         inspection_reference, outcome, notes, reinspection_required, reinspection_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET conducted_at = EXCLUDED.conducted_at,
         inspector_reference = EXCLUDED.inspector_reference,
         inspection_reference = EXCLUDED.inspection_reference, outcome = EXCLUDED.outcome,
         notes = EXCLUDED.notes, reinspection_required = EXCLUDED.reinspection_required,
         reinspection_date = EXCLUDED.reinspection_date`,
      [
        i.id, i.tenantId, i.caseId, i.requestedAt, i.scheduledAt, i.conductedAt, i.inspectorReference,
        i.inspectionReference, i.outcome, i.notes, i.reinspectionRequired, i.reinspectionDate,
      ],
    );
  }

  async findInspection(id: string, tenantId: string): Promise<ComplianceInspection | null> {
    const r = await this.pool.query(
      `SELECT ${INSP_COLS} FROM public.aura_compliance_inspections WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return r.rows[0] ? toInspection(r.rows[0]) : null;
  }

  async listInspections(tenantId: string, caseId: string): Promise<ComplianceInspection[]> {
    const r = await this.pool.query(
      `SELECT ${INSP_COLS} FROM public.aura_compliance_inspections
       WHERE tenant_id = $1 AND case_id = $2 ORDER BY created_at ASC`,
      [tenantId, caseId],
    );
    return r.rows.map(toInspection);
  }

  // ── Decisions ────────────────────────────────────────────────────────────────
  async addDecision(d: ComplianceDecision): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_compliance_decisions
        (id, tenant_id, case_id, submission_id, outcome, decision_date, decision_by, reference, conditions, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [d.id, d.tenantId, d.caseId, d.submissionId, d.outcome, d.decisionDate, d.decisionBy, d.reference, d.conditions, d.reason],
    );
  }

  async listDecisions(tenantId: string, caseId: string): Promise<ComplianceDecision[]> {
    const r = await this.pool.query(
      `SELECT ${DEC_COLS} FROM public.aura_compliance_decisions
       WHERE tenant_id = $1 AND case_id = $2 ORDER BY decision_date ASC, created_at ASC`,
      [tenantId, caseId],
    );
    return r.rows.map(toDecision);
  }

  // ── Certificates ─────────────────────────────────────────────────────────────
  async saveCertificate(c: ComplianceCertificate): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_compliance_certificates
        (id, tenant_id, case_id, number, issued_at, expires_at, superseded_by_certificate_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         superseded_by_certificate_id = EXCLUDED.superseded_by_certificate_id, notes = EXCLUDED.notes`,
      [c.id, c.tenantId, c.caseId, c.number, c.issuedAt, c.expiresAt, c.supersededByCertificateId, c.notes],
    );
  }

  async listCertificates(tenantId: string, caseId: string): Promise<ComplianceCertificate[]> {
    const r = await this.pool.query(
      `SELECT ${CERT_COLS} FROM public.aura_compliance_certificates
       WHERE tenant_id = $1 AND case_id = $2 ORDER BY issued_at ASC`,
      [tenantId, caseId],
    );
    return r.rows.map(toCertificate);
  }

  async listLiveCertificates(tenantId: string): Promise<ComplianceCertificate[]> {
    const r = await this.pool.query(
      `SELECT ${CERT_COLS} FROM public.aura_compliance_certificates
       WHERE tenant_id = $1 AND superseded_by_certificate_id IS NULL AND expires_at IS NOT NULL
       ORDER BY expires_at ASC`,
      [tenantId],
    );
    return r.rows.map(toCertificate);
  }
}

// ── row → domain ───────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const toAuthority = (r: any): Authority => ({
  id: r.id, tenantId: r.tenant_id, code: r.code, name: r.name, jurisdiction: r.jurisdiction,
  portalUrl: r.portal_url, active: r.active, createdAt: r.created_at, updatedAt: r.updated_at,
});

const toCase = (r: any): ComplianceCase => ({
  id: r.id, tenantId: r.tenant_id, companyId: r.company_id, authorityCode: r.authority_code,
  obligationCode: r.obligation_code, scope: r.scope as ComplianceScope, subjectType: r.subject_type,
  subjectId: r.subject_id, projectId: r.project_id,
  system: r.system ? toElvSystem(r.system) : null,
  coverage: r.coverage as CoverageMode,
  deviceIds: Array.isArray(r.device_ids) ? r.device_ids : JSON.parse(r.device_ids ?? '[]'),
  reference: r.reference, status: r.status as ComplianceCaseStatus, notes: r.notes,
  createdAt: r.created_at, createdBy: r.created_by, updatedAt: r.updated_at,
});

const toSubmission = (r: any): ComplianceSubmission => ({
  id: r.id, tenantId: r.tenant_id, caseId: r.case_id, attempt: r.attempt, submittedAt: r.submitted_at,
  submittedBy: r.submitted_by, reference: r.reference,
  fee: r.fee === null ? null : Number(r.fee), currency: r.currency, notes: r.notes,
});

const toInspection = (r: any): ComplianceInspection => ({
  id: r.id, tenantId: r.tenant_id, caseId: r.case_id, requestedAt: r.requested_at,
  scheduledAt: r.scheduled_at, conductedAt: r.conducted_at, inspectorReference: r.inspector_reference,
  inspectionReference: r.inspection_reference, outcome: (r.outcome as InspectionOutcome) ?? null,
  notes: r.notes, reinspectionRequired: r.reinspection_required, reinspectionDate: r.reinspection_date,
});

const toDecision = (r: any): ComplianceDecision => ({
  id: r.id, tenantId: r.tenant_id, caseId: r.case_id, submissionId: r.submission_id,
  outcome: r.outcome as DecisionOutcome, decisionDate: r.decision_date, decisionBy: r.decision_by,
  reference: r.reference, conditions: r.conditions, reason: r.reason,
});

const toCertificate = (r: any): ComplianceCertificate => ({
  id: r.id, tenantId: r.tenant_id, caseId: r.case_id, number: r.number, issuedAt: r.issued_at,
  expiresAt: r.expires_at, supersededByCertificateId: r.superseded_by_certificate_id, notes: r.notes,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

function whereForCases(tenantId: string, filter?: CaseFilter): { where: string; params: unknown[] } {
  const clauses = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  const add = (col: string, val?: string): void => {
    if (!val) return;
    params.push(val);
    clauses.push(`${col} = $${params.length}`);
  };
  add('authority_code', filter?.authorityCode?.toUpperCase());
  add('scope', filter?.scope);
  add('subject_id', filter?.subjectId);
  add('project_id', filter?.projectId);
  add('status', filter?.status);
  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}
