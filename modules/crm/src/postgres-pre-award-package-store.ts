import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PreAwardPackageStore } from './pre-award-package-store';
import type { PreAwardPackage, EstimationBasisRevision, EstimateRevision, EstimateBuildUp } from './domain/pre-award-package';
import type { TechnicalStudyContent, TechnicalStudyRevision } from './domain/technical-study';

export class PostgresPreAwardPackageStore implements PreAwardPackageStore {
  constructor(private readonly pool: Pool) {}

  async savePackage(p: PreAwardPackage): Promise<void> {
    await this.pool.query(
      `insert into public.aura_crm_pre_award_packages (id,tenant_id,company_id,opportunity_id,tender_id,route,status,created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set status=excluded.status, updated_at=now()`,
      [p.id, p.tenantId, p.companyId, p.opportunityId, p.tenderId, p.route, p.status, p.createdBy]);
  }

  async saveStudy(s: TechnicalStudyRevision): Promise<void> {
    await this.saveStudyWith(this.pool, s);
  }

  async saveStudyWithClient(tx: TxHandle | null, s: TechnicalStudyRevision): Promise<void> {
    if (tx === null) return this.saveStudy(s);
    await this.saveStudyWith(tx as PoolClient, s);
  }

  private async saveStudyWith(executor: Pool | PoolClient, s: TechnicalStudyRevision): Promise<void> {
    const content: TechnicalStudyContent = {
      scopeSummary: s.scopeSummary, systems: s.systems, requirements: s.requirements,
      surveyFindings: s.surveyFindings, clarifications: s.clarifications, deviations: s.deviations,
      assumptions: s.assumptions, exclusions: s.exclusions, evidence: s.evidence,
    };
    await executor.query(
      `insert into public.aura_crm_technical_study_revisions
       (id,tenant_id,company_id,package_id,revision_no,parent_study_id,title,input_revision,status,content,
        author_id,reviewer_id,created_at,updated_at,submitted_at,reviewed_by,reviewed_at,review_comment)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       on conflict (id) do update set title=excluded.title,input_revision=excluded.input_revision,
         status=excluded.status,content=excluded.content,reviewer_id=excluded.reviewer_id,
         updated_at=excluded.updated_at,submitted_at=excluded.submitted_at,reviewed_by=excluded.reviewed_by,
         reviewed_at=excluded.reviewed_at,review_comment=excluded.review_comment`,
      [s.id, s.tenantId, s.companyId, s.packageId, s.revisionNo, s.parentStudyId, s.title,
       s.inputRevision, s.status, JSON.stringify(content), s.authorId, s.reviewerId, s.createdAt,
       s.updatedAt, s.submittedAt, s.reviewedBy, s.reviewedAt, s.reviewComment],
    );
  }

  /**
   * The conflict clause updates `lines` because a DRAFT basis is editable (the human half of
   * Accept ≠ Approve). Only drafts ever reach here with changed lines — the domain refuses to edit an
   * approved or superseded revision — so the frozen projection an estimate was built on cannot move.
   * Leaving `lines` out of the update is what made an edit return 200 and then vanish on re-read.
   */
  async saveBasis(b: EstimationBasisRevision): Promise<void> {
    await this.pool.query(
      `insert into public.aura_crm_estimation_basis_revisions (id,tenant_id,company_id,package_id,revision_no,source_kind,source_id,source_rev_ref,status,lines,created_by,approved_by,approved_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (id) do update set status=excluded.status, lines=excluded.lines, approved_by=excluded.approved_by, approved_at=excluded.approved_at`,
      [b.id, b.tenantId, b.companyId, b.packageId, b.revisionNo, b.sourceKind, b.sourceId, b.sourceRevRef, b.status, JSON.stringify(b.lines), b.createdBy, b.approvedBy, b.approvedAt]);
  }

  async saveEstimate(e: EstimateRevision): Promise<void> {
    await this.pool.query(
      `insert into public.aura_crm_estimate_revisions (id,tenant_id,company_id,package_id,basis_revision_id,revision_no,status,totals,created_by,frozen_by,frozen_at,approved_by,approved_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (id) do update set status=excluded.status, totals=excluded.totals, frozen_by=excluded.frozen_by, frozen_at=excluded.frozen_at, approved_by=excluded.approved_by, approved_at=excluded.approved_at`,
      [e.id, e.tenantId, e.companyId, e.packageId, e.basisRevisionId, e.revisionNo, e.status, JSON.stringify(e.totals), e.createdBy, e.frozenBy, e.frozenAt, e.approvedBy, e.approvedAt]);
  }

  async saveBuildUps(tenantId: Id, companyId: Id | null, estimateRevisionId: Id, buildUps: EstimateBuildUp[]): Promise<void> {
    // The owning estimate is a draft at build-up time; replace the set for this revision.
    await this.pool.query('delete from public.aura_crm_estimate_build_ups where estimate_revision_id=$1', [estimateRevisionId]);
    for (const b of buildUps) {
      await this.pool.query(
        `insert into public.aura_crm_estimate_build_ups (id,tenant_id,company_id,estimate_revision_id,basis_line_id,components,resources,indirect_percent,overhead_percent,risk_percent,profit_percent,direct_cost,indirect_amount,overhead_amount,risk_amount,profit_amount,selling_rate,notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [b.id, tenantId, companyId, estimateRevisionId, b.basisLineId, JSON.stringify(b.components), b.resources ? JSON.stringify(b.resources) : null,
         b.indirectPercent, b.overheadPercent, b.riskPercent, b.profitPercent, b.directCost, b.indirectAmount, b.overheadAmount, b.riskAmount, b.profitAmount, b.sellingRate, b.notes]);
    }
  }

  async getByOpportunity(tenantId: Id, opportunityId: Id): Promise<PreAwardPackage | null> {
    const r = await this.pool.query<{ id: string; tenant_id: string; company_id: string | null; opportunity_id: string | null; tender_id: string | null; route: string; status: string; created_by: string | null; created_at: Date; updated_at: Date }>(
      'select id,tenant_id,company_id,opportunity_id,tender_id,route,status,created_by,created_at,updated_at from public.aura_crm_pre_award_packages where tenant_id=$1 and opportunity_id=$2::uuid limit 1',
      [tenantId, opportunityId]);
    const p = r.rows[0];
    if (!p) return null;
    return { id: p.id, tenantId: p.tenant_id, companyId: p.company_id, opportunityId: p.opportunity_id, tenderId: p.tender_id, route: p.route as PreAwardPackage['route'], status: p.status as PreAwardPackage['status'], createdBy: p.created_by, createdAt: p.created_at.toISOString(), updatedAt: p.updated_at.toISOString() };
  }

  async getByTender(tenantId: Id, tenderId: Id): Promise<PreAwardPackage | null> {
    const r = await this.pool.query<{ id: string; tenant_id: string; company_id: string | null; opportunity_id: string | null; tender_id: string | null; route: string; status: string; created_by: string | null; created_at: Date; updated_at: Date }>(
      'select id,tenant_id,company_id,opportunity_id,tender_id,route,status,created_by,created_at,updated_at from public.aura_crm_pre_award_packages where tenant_id=$1 and tender_id=$2 limit 1',
      [tenantId, tenderId]);
    const p = r.rows[0];
    if (!p) return null;
    return { id: p.id, tenantId: p.tenant_id, companyId: p.company_id, opportunityId: p.opportunity_id, tenderId: p.tender_id, route: p.route as PreAwardPackage['route'], status: p.status as PreAwardPackage['status'], createdBy: p.created_by, createdAt: p.created_at.toISOString(), updatedAt: p.updated_at.toISOString() };
  }

  async listStudies(tenantId: Id, packageId: Id): Promise<TechnicalStudyRevision[]> {
    const result = await this.pool.query<{
      id: string; tenant_id: string; company_id: string | null; package_id: string; revision_no: number;
      parent_study_id: string | null; title: string; input_revision: string; status: TechnicalStudyRevision['status'];
      content: TechnicalStudyContent; author_id: string; reviewer_id: string; created_at: Date; updated_at: Date;
      submitted_at: Date | null; reviewed_by: string | null; reviewed_at: Date | null; review_comment: string | null;
    }>(
      `select id,tenant_id,company_id,package_id,revision_no,parent_study_id,title,input_revision,status,content,
              author_id,reviewer_id,created_at,updated_at,submitted_at,reviewed_by,reviewed_at,review_comment
         from public.aura_crm_technical_study_revisions
        where tenant_id=$1 and package_id=$2 order by revision_no`,
      [tenantId, packageId],
    );
    return result.rows.map((row) => ({
      id: row.id, tenantId: row.tenant_id, companyId: row.company_id, packageId: row.package_id,
      revisionNo: row.revision_no, parentStudyId: row.parent_study_id, title: row.title,
      inputRevision: row.input_revision, status: row.status, authorId: row.author_id,
      reviewerId: row.reviewer_id, ...(row.content ?? {
        scopeSummary: '', systems: [], requirements: [], surveyFindings: [], clarifications: [],
        deviations: [], assumptions: [], exclusions: [], evidence: [],
      }),
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      submittedAt: row.submitted_at?.toISOString() ?? null, reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at?.toISOString() ?? null, reviewComment: row.review_comment,
    }));
  }

  async listBasis(tenantId: Id, packageId: Id): Promise<EstimationBasisRevision[]> {
    const r = await this.pool.query('select * from public.aura_crm_estimation_basis_revisions where tenant_id=$1 and package_id=$2 order by revision_no', [tenantId, packageId]);
    return r.rows.map((b) => ({ id: b.id, tenantId: b.tenant_id, companyId: b.company_id, packageId: b.package_id, revisionNo: b.revision_no, sourceKind: b.source_kind, sourceId: b.source_id, sourceRevRef: b.source_rev_ref, status: b.status, lines: b.lines ?? [], createdBy: b.created_by, createdAt: b.created_at.toISOString(), approvedBy: b.approved_by, approvedAt: b.approved_at ? b.approved_at.toISOString() : null }));
  }

  async listEstimates(tenantId: Id, packageId: Id): Promise<EstimateRevision[]> {
    const r = await this.pool.query('select * from public.aura_crm_estimate_revisions where tenant_id=$1 and package_id=$2 order by revision_no', [tenantId, packageId]);
    return r.rows.map((e) => ({ id: e.id, tenantId: e.tenant_id, companyId: e.company_id, packageId: e.package_id, basisRevisionId: e.basis_revision_id, revisionNo: e.revision_no, status: e.status, totals: e.totals ?? {}, createdBy: e.created_by, createdAt: e.created_at.toISOString(), frozenBy: e.frozen_by, frozenAt: e.frozen_at ? e.frozen_at.toISOString() : null, approvedBy: e.approved_by, approvedAt: e.approved_at ? e.approved_at.toISOString() : null }));
  }

  async listBuildUps(tenantId: Id, estimateRevisionId: Id): Promise<EstimateBuildUp[]> {
    const r = await this.pool.query('select * from public.aura_crm_estimate_build_ups where tenant_id=$1 and estimate_revision_id=$2', [tenantId, estimateRevisionId]);
    return r.rows.map((b) => ({
      id: b.id, basisLineId: b.basis_line_id,
      components: b.components ?? [], resources: b.resources ?? null,
      indirectPercent: Number(b.indirect_percent), overheadPercent: Number(b.overhead_percent), riskPercent: Number(b.risk_percent), profitPercent: Number(b.profit_percent),
      directCost: Number(b.direct_cost), indirectAmount: Number(b.indirect_amount), overheadAmount: Number(b.overhead_amount), riskAmount: Number(b.risk_amount), profitAmount: Number(b.profit_amount), sellingRate: Number(b.selling_rate),
      notes: b.notes ?? null,
    }));
  }
}
