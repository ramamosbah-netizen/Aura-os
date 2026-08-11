import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ExpiryStatus, type Id, type Page, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { type Authority, type NewAuthority, makeAuthority } from './domain/authority';
import {
  type ComplianceCase,
  type ComplianceCaseStatus,
  type NewComplianceCase,
  makeComplianceCase,
  setCaseStatus,
} from './domain/compliance-case';
import {
  type ComplianceCertificate,
  type ComplianceDecision,
  type ComplianceInspection,
  type ComplianceSubmission,
  type DecisionOutcome,
  type InspectionOutcome,
  type NewComplianceCertificate,
  certificateStatus,
  currentCertificate,
  makeCertificate,
  makeDecision,
  makeInspection,
  makeSubmission,
  recordInspectionOutcome,
  renew,
} from './domain/case-records';
import { COMPLIANCE_STORE, type CaseFilter, type ComplianceStore } from './store.interface';

/**
 * Compliance Core service (ADR-0018).
 *
 * Ships with **zero seeded rules** by explicit decision: authorities are added by hand and no
 * obligation, fee or validity period is written until it is sourced. The core works with an empty
 * rule set — it simply cannot tell anyone what SIRA requires until someone tells it.
 *
 * Every read takes the tenant explicitly (see store.interface); the service owns what the store
 * cannot — the scope↔subject invariant, the case state machine, attempt numbering, and the
 * append-only guarantees on decisions and certificates.
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger('Compliance');

  constructor(
    @Inject(COMPLIANCE_STORE) private readonly store: ComplianceStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  // ── Authorities ──────────────────────────────────────────────────────────────

  async registerAuthority(input: NewAuthority): Promise<Authority> {
    const authority = makeAuthority(input);
    const clash = await this.store.findAuthorityByCode(authority.tenantId, authority.code);
    if (clash) throw new Error(`authority ${authority.code} already exists`);
    await this.store.saveAuthority(authority);
    this.logger.log(`Authority registered: ${authority.code} (${authority.jurisdiction})`);
    return authority;
  }

  listAuthorities(tenantId: Id): Promise<Authority[]> {
    return this.store.listAuthorities(tenantId);
  }

  // ── Cases ────────────────────────────────────────────────────────────────────

  async openCase(input: NewComplianceCase): Promise<ComplianceCase> {
    const c = makeComplianceCase(input);

    // The authority must exist as reference data. Cheaper to refuse here than to discover at
    // submission time that the case names a regulator nobody configured.
    const authority = await this.store.findAuthorityByCode(c.tenantId, c.authorityCode);
    if (!authority) throw new Error(`authority ${c.authorityCode} not found`);
    if (!authority.active) throw new Error(`authority ${c.authorityCode} is inactive`);

    await this.store.saveCase(c);
    await this.events.append([
      makeEvent({
        type: 'compliance.case.opened',
        aggregateId: c.id,
        aggregateType: 'compliance_case',
        tenantId: c.tenantId,
        companyId: c.companyId,
        payload: { authorityCode: c.authorityCode, obligationCode: c.obligationCode, scope: c.scope, subjectId: c.subjectId },
      }),
    ]);
    return c;
  }

  getCase(id: Id, tenantId: Id): Promise<ComplianceCase | null> {
    return this.store.findCase(id, tenantId);
  }

  listCases(tenantId: Id, filter?: CaseFilter): Promise<ComplianceCase[]> {
    return this.store.listCases(tenantId, filter);
  }

  listCasesPaged(tenantId: Id, page: PageParams, filter?: CaseFilter): Promise<Page<ComplianceCase>> {
    return this.store.listCasesPaged(tenantId, page, filter);
  }

  private async requireCase(id: Id, tenantId: Id): Promise<ComplianceCase> {
    const c = await this.store.findCase(id, tenantId);
    if (!c) throw new Error(`compliance case ${id} not found`);
    return c;
  }

  /** Guarded transition — the sequence lives in the domain. */
  async changeCaseStatus(id: Id, tenantId: Id, status: ComplianceCaseStatus): Promise<ComplianceCase> {
    const existing = await this.requireCase(id, tenantId);
    const updated = setCaseStatus(existing, status);
    await this.store.saveCase(updated);
    await this.events.append([
      makeEvent({
        type: 'compliance.case.status_changed',
        aggregateId: updated.id,
        aggregateType: 'compliance_case',
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        payload: { from: existing.status, to: status, authorityCode: updated.authorityCode },
      }),
    ]);
    return updated;
  }

  // ── Submissions ──────────────────────────────────────────────────────────────

  /**
   * Submit, or resubmit. The attempt number is derived rather than supplied — a caller passing its
   * own would eventually pass 1 twice and overwrite the history this table exists to keep.
   */
  async submit(
    caseId: Id,
    tenantId: Id,
    input: { submittedAt: string; submittedBy?: Id | null; reference?: string | null; fee?: number | null; currency?: string | null; notes?: string | null },
  ): Promise<ComplianceSubmission> {
    const c = await this.requireCase(caseId, tenantId);
    const prior = await this.store.listSubmissions(tenantId, caseId);
    const submission = makeSubmission({ tenantId, caseId, attempt: prior.length + 1, ...input });

    await this.store.addSubmission(submission);
    // draft → submitted, or rejected/expired/certified → submitted for a resubmission or renewal.
    if (c.status !== 'submitted') await this.changeCaseStatus(caseId, tenantId, 'submitted');
    return submission;
  }

  listSubmissions(tenantId: Id, caseId: Id): Promise<ComplianceSubmission[]> {
    return this.store.listSubmissions(tenantId, caseId);
  }

  // ── Inspections (optional) ───────────────────────────────────────────────────

  async scheduleInspection(
    caseId: Id,
    tenantId: Id,
    input: { requestedAt?: string | null; scheduledAt?: string | null } = {},
  ): Promise<ComplianceInspection> {
    await this.requireCase(caseId, tenantId);
    const inspection = makeInspection({ tenantId, caseId, ...input });
    await this.store.saveInspection(inspection);
    return inspection;
  }

  async recordInspection(
    inspectionId: Id,
    tenantId: Id,
    outcome: InspectionOutcome,
    on: string,
    extras: { notes?: string | null; inspectorReference?: string | null; inspectionReference?: string | null; reinspectionDate?: string | null } = {},
  ): Promise<ComplianceInspection> {
    const existing = await this.store.findInspection(inspectionId, tenantId);
    if (!existing) throw new Error(`inspection ${inspectionId} not found`);
    const updated = recordInspectionOutcome(existing, outcome, on, extras);
    await this.store.saveInspection(updated);
    return updated;
  }

  listInspections(tenantId: Id, caseId: Id): Promise<ComplianceInspection[]> {
    return this.store.listInspections(tenantId, caseId);
  }

  // ── Decisions (append-only) ──────────────────────────────────────────────────

  /**
   * Record the authority's decision. Never replaces a previous one: a case that was rejected and
   * later approved keeps both, and the first refusal's reason is the record a dispute turns on.
   */
  async decide(
    caseId: Id,
    tenantId: Id,
    input: { outcome: DecisionOutcome; decisionDate: string; decisionBy?: string | null; reference?: string | null; conditions?: string | null; reason?: string | null; submissionId?: Id | null },
  ): Promise<ComplianceDecision> {
    await this.requireCase(caseId, tenantId);
    const decision = makeDecision({ tenantId, caseId, ...input });
    await this.store.addDecision(decision);

    await this.changeCaseStatus(caseId, tenantId, decision.outcome === 'rejected' ? 'rejected' : 'approved');
    await this.events.append([
      makeEvent({
        type: 'compliance.case.decided',
        aggregateId: caseId,
        aggregateType: 'compliance_case',
        tenantId,
        payload: { outcome: decision.outcome, decisionDate: decision.decisionDate },
      }),
    ]);
    return decision;
  }

  listDecisions(tenantId: Id, caseId: Id): Promise<ComplianceDecision[]> {
    return this.store.listDecisions(tenantId, caseId);
  }

  // ── Certificates (append-only series) ────────────────────────────────────────

  async issueCertificate(caseId: Id, tenantId: Id, input: Omit<NewComplianceCertificate, 'tenantId' | 'caseId'>): Promise<ComplianceCertificate> {
    await this.requireCase(caseId, tenantId);
    const existing = await this.store.listCertificates(tenantId, caseId);
    const live = currentCertificate(existing);

    // A live certificate is renewed, never edited — the previous row keeps its own dates so
    // "what was valid on 14 March" stays answerable.
    if (live) {
      const { previous, current } = renew(live, { tenantId, caseId, ...input });
      // The NEW certificate first: `previous.supersededByCertificateId` points at it, and the
      // foreign key will not accept a reference to a row that does not exist yet. The in-memory
      // adapter has no such constraint, so this order only matters against Postgres — which is
      // why it took a live probe to find.
      await this.store.saveCertificate(current);
      await this.store.saveCertificate(previous);
      await this.changeCaseStatus(caseId, tenantId, 'certified').catch(() => undefined);
      return current;
    }

    const certificate = makeCertificate({ tenantId, caseId, ...input });
    await this.store.saveCertificate(certificate);
    await this.changeCaseStatus(caseId, tenantId, 'certified');
    await this.events.append([
      makeEvent({
        type: 'compliance.certificate.issued',
        aggregateId: caseId,
        aggregateType: 'compliance_case',
        tenantId,
        payload: { number: certificate.number, expiresAt: certificate.expiresAt },
      }),
    ]);
    return certificate;
  }

  listCertificates(tenantId: Id, caseId: Id): Promise<ComplianceCertificate[]> {
    return this.store.listCertificates(tenantId, caseId);
  }

  /**
   * The renewal watch-list. Uses the shared expiry projection, so an already-expired certificate
   * stays on the list rather than dropping off it — operating on an expired approval is the most
   * urgent item here, not the least.
   */
  async renewalWatchlist(
    tenantId: Id,
    asOf: string,
    withinDays = 90,
  ): Promise<Array<{ certificate: ComplianceCertificate; status: ExpiryStatus; daysToExpiry: number | null }>> {
    const live = await this.store.listLiveCertificates(tenantId);
    return live
      .map((certificate) => ({ certificate, ...certificateStatus(certificate, asOf, withinDays) }))
      .filter((row) => row.status !== 'valid')
      .sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0));
  }
}
