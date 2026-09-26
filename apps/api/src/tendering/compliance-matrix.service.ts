import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DmsService, EVENT_STORE, TenantContext, type EventStore } from '@aura/core';
import { makeEvent } from '@aura/shared';
import {
  COMPLIANCE_MATRIX_STORE,
  TenderService,
  awaitingVerdict,
  makeComplianceMatrixIssue,
  summariseMatrix,
  type ComplianceMatrixIssue,
  type ComplianceMatrixRow,
  type ComplianceMatrixStore,
  type Tender,
} from '@aura/tendering';
import { PurchaseRequestService, TechnicalComplianceService } from '@aura/procurement';
import * as XLSX from 'xlsx';

/** The kind the matrix is filed under in the tender's DMS dossier — sealed from the moment it is stored. */
export const COMPLIANCE_MATRIX_KIND = 'technical_compliance_matrix';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const VERDICT_LABEL: Record<string, string> = {
  compliant: 'Compliant',
  compliant_with_deviation: 'Compliant with deviation',
  non_compliant: 'Not compliant',
};

/**
 * EST-12 — THE TECHNICAL COMPLIANCE MATRIX, composed where tendering meets procurement.
 *
 * Procurement owns every fact in it — the requisition, the suppliers' revisions and lines, and the
 * Technical Manager's verdicts (SUP-13, ADR-0022) — and hands them over through a technical-only read
 * that carries no price. Tendering adds the BOQ lineage and owns the issued revisions. This layer only
 * joins the two, renders the controlled workbook and files it; it decides nothing about compliance.
 */
@Injectable()
export class TenderComplianceMatrixService {
  private readonly logger = new Logger('TenderComplianceMatrix');

  constructor(
    private readonly tenders: TenderService,
    private readonly prs: PurchaseRequestService,
    private readonly technical: TechnicalComplianceService,
    @Inject(COMPLIANCE_MATRIX_STORE) private readonly store: ComplianceMatrixStore,
    private readonly dms: DmsService,
    private readonly tenant: TenantContext,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  private async tenderOr404(id: string): Promise<Tender> {
    const tender = await this.tenders.get(id);
    if (!tender || tender.tenantId !== this.tenant.get().tenantId) throw new NotFoundException(`tender ${id} not found`);
    return tender;
  }

  private actor() {
    const ctx = this.tenant.get();
    return { userId: ctx.actorId ?? 'anonymous', tenantId: ctx.tenantId, companyId: ctx.companyId ?? null };
  }

  /** The matrix as the verdicts stand NOW — what the next issue would freeze. */
  private async liveRows(tender: Tender): Promise<ComplianceMatrixRow[]> {
    const tenantId = tender.tenantId;
    const requisitions = await this.prs.list({ tenantId, sourceTenderId: tender.id, purpose: 'tender_pricing', limit: 50 });
    const offers = await this.technical.forRequisitions(tenantId, requisitions.map((r) => r.id));
    const boq = await this.tenders.getBOQByTender(tenantId, tender.id);
    const items = new Map((boq?.items ?? []).map((item) => [item.id, item]));
    return offers.map((o): ComplianceMatrixRow => {
      const item = o.sourceBoqItemId ? items.get(o.sourceBoqItemId) : undefined;
      return {
        boqItemId: o.sourceBoqItemId,
        boqItemCode: item?.itemCode ?? null,
        boqDescription: item?.description ?? null,
        prId: o.prId,
        prLineId: o.prLineId,
        prLineNo: o.prLineNo,
        materialCode: o.materialCode,
        materialName: o.materialName,
        requested: o.requested,
        supplierName: o.supplierName,
        supplierQuotationRef: o.supplierQuotationRef,
        offerLabel: o.offerLabel,
        revisionId: o.revisionId,
        revisionNo: o.revisionNo,
        supplierRevisionRef: o.supplierRevisionRef,
        quotationLineId: o.quotationLineId,
        response: o.response,
        offered: o.offered,
        complianceClaim: o.complianceClaim,
        deviations: o.deviations,
        exclusions: o.exclusions,
        verdict: o.verdict,
        rationale: o.rationale,
        evaluatedBy: o.evaluatedBy,
        evaluatedAt: o.evaluatedAt,
        amendmentReason: o.amendmentReason,
      };
    });
  }

  /** The live matrix, whether it can be issued, and every revision issued so far. */
  async view(tenderId: string) {
    const tender = await this.tenderOr404(tenderId);
    const rows = await this.liveRows(tender);
    const issues = await this.store.listByTender(tender.tenantId, tender.id);
    return {
      tender: { id: tender.id, title: tender.title, reference: tender.reference },
      live: { rows, summary: summariseMatrix(rows), awaiting: awaitingVerdict(rows).length },
      current: issues.find((i) => !i.supersededBy) ?? null,
      issues,
    };
  }

  /**
   * ISSUE the matrix — the Technical Manager's controlled act.
   *
   * Everything is checked before anything is written (at least one supplier offer, every quoted line
   * judged, a reason for a re-issue, no commercial figure anywhere). Then the workbook is rendered on
   * the server from the frozen rows, filed in the tender's dossier as a NEW sealed document, and the
   * issue is recorded with that document and its hash — superseding the revision before it.
   */
  async issue(tenderId: string, reason?: string | null): Promise<ComplianceMatrixIssue> {
    const ctx = this.tenant.get();
    const tender = await this.tenderOr404(tenderId);
    const rows = await this.liveRows(tender);
    const previous = (await this.store.listByTender(tender.tenantId, tender.id)).find((i) => !i.supersededBy) ?? null;
    const draft = makeComplianceMatrixIssue({
      tenantId: tender.tenantId, companyId: tender.companyId ?? null, tender: { id: tender.id, reference: tender.reference },
      previous, rows, issuedBy: ctx.actorId ?? null, reason, documentId: 'pending', checksum: 'pending',
    });

    const bytes = renderComplianceWorkbook(draft, tender);
    const filed = await this.dms.createDocument({
      tenantId: tender.tenantId,
      companyId: tender.companyId ?? null,
      kind: COMPLIANCE_MATRIX_KIND,
      title: `${draft.matrixNumber} Rev ${draft.revision} — Technical Compliance Matrix`,
      aggregateType: 'tendering.tender',
      aggregateId: tender.id,
      createdBy: draft.issuedBy,
    }, { fileName: `${draft.matrixNumber}-rev-${draft.revision}.xlsx`, contentType: XLSX_TYPE, data: bytes });

    const checksum = filed.versions[0]?.checksum;
    if (!checksum) throw new ConflictException('the filed matrix came back without a content hash — it cannot be issued as a controlled document');
    const issue: ComplianceMatrixIssue = { ...draft, documentId: filed.document.id, checksum };
    await this.store.issue(null, issue, previous);
    await this.events.append([makeEvent({
      type: 'tendering.compliance_matrix.issued',
      tenantId: tender.tenantId, companyId: tender.companyId ?? null, actorId: issue.issuedBy,
      aggregateType: 'tendering.tender', aggregateId: tender.id,
      payload: {
        issueId: issue.id, matrixNumber: issue.matrixNumber, revision: issue.revision, documentId: issue.documentId,
        reason: issue.reason, summary: issue.summary, supersedes: previous?.id ?? null,
      },
    })]);
    this.logger.log(`${issue.matrixNumber} Rev ${issue.revision} issued for tender ${tender.id} by ${issue.issuedBy} — ${issue.summary.offers} supplier line(s)`);
    return issue;
  }

  /** The controlled workbook, read back from the dossier and checked against the hash it was issued with. */
  async workbook(tenderId: string, issueId: string): Promise<{ fileName: string; bytes: Buffer }> {
    const tender = await this.tenderOr404(tenderId);
    const issue = await this.store.get(tender.tenantId, issueId);
    if (!issue || issue.tenderId !== tender.id) throw new NotFoundException(`compliance matrix issue ${issueId} not found on this tender`);
    const verified = await this.dms.verifyCommittedChecksum(issue.documentId, issue.checksum);
    if (verified === 'mismatch') {
      throw new ConflictException(`${issue.matrixNumber} Rev ${issue.revision} no longer matches the document it was issued as — the filed bytes have changed`);
    }
    const { bytes, version } = await this.dms.downloadVersion(issue.documentId, 1, this.actor());
    return { fileName: version.fileName, bytes };
  }
}

/** The controlled workbook — rendered from the FROZEN issue, never from live records. */
export function renderComplianceWorkbook(issue: ComplianceMatrixIssue, tender: Pick<Tender, 'title' | 'reference'>): Buffer {
  const s = issue.summary;
  const header = XLSX.utils.aoa_to_sheet([
    ['TECHNICAL COMPLIANCE MATRIX'],
    ['Matrix', issue.matrixNumber],
    ['Revision', issue.revision],
    ['Tender', `${tender.reference ?? ''} ${tender.title}`.trim()],
    ['Issued by', issue.issuedBy],
    ['Issued at', issue.issuedAt],
    ['Reason for this revision', issue.reason ?? 'First issue'],
    ['Classification', 'INTERNAL tender dossier — technical only. Commercial figures are excluded. Not part of the client submission.'],
    ['Summary', `${s.offers} supplier line(s) on ${s.requirements} requirement(s): ${s.compliant} compliant, ${s.compliantWithDeviation} compliant with deviation, ${s.nonCompliant} not compliant, ${s.noBid} no bid`],
  ]);
  const matrix = XLSX.utils.json_to_sheet(issue.rows.map((r) => ({
    'BOQ item': r.boqItemCode ?? '',
    'BOQ description': r.boqDescription ?? '',
    'PR line': r.prLineNo,
    Material: `${r.materialCode} — ${r.materialName}`,
    Requested: [`${r.requested.quantity} ${r.requested.uom}`, r.requested.manufacturer, r.requested.model, r.requested.specification].filter(Boolean).join(' · '),
    Supplier: r.supplierName,
    'Supplier quotation': [r.supplierQuotationRef, r.offerLabel].filter(Boolean).join(' · '),
    // AURA's own revision number beside the supplier's reference — the two count differently.
    'Quotation revision': `Rev ${r.revisionNo}${r.supplierRevisionRef ? ` · supplier ref ${r.supplierRevisionRef}` : ''}`,
    'Quotation line': r.quotationLineId,
    Response: r.response === 'no_bid' ? 'No bid' : 'Quoted',
    Offered: [r.offered.manufacturer, r.offered.model, r.offered.partNumber, r.offered.description].filter(Boolean).join(' · '),
    'Supplier claim': r.complianceClaim ?? '',
    Deviations: r.deviations ?? '',
    Exclusions: r.exclusions ?? '',
    Verdict: r.verdict ? VERDICT_LABEL[r.verdict] : r.response === 'no_bid' ? 'Not evaluated — no bid' : '',
    Rationale: r.rationale ?? '',
    'Evaluated by': r.evaluatedBy ?? '',
    'Evaluated at': r.evaluatedAt ?? '',
    'Amended because': r.amendmentReason ?? '',
  })));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, header, 'Issue');
  XLSX.utils.book_append_sheet(workbook, matrix, 'Matrix');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}
