import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  type CommittedEvidenceProvider,
  type CommittedEvidenceVerdict,
  DocumentAccessResolver,
  NOT_COMMITTED,
} from '@aura/core';
import type { Document } from '@aura/shared';
import { CommissioningService, HandoverService } from '@aura/commissioning';
import { QualityService } from '@aura/quality';
import { SiteService } from '@aura/site';

/**
 * WHICH DOCUMENTS A COMPLETED ACT HAS ALREADY RELIED ON.
 *
 * `DEFAULT_OWNER_POLICY` gives a document's creator EDIT, which is right for almost everything in
 * the system and wrong for exactly one class: evidence. When a witness signs a sign-off, a client
 * signs an acceptance, a consultant signs an inspection or a supervisor signs a day, the act that
 * relied on those bytes is finished and recorded against them — and `createdBy` is the person who
 * RECORDED the act, so the generic policy handed the recorder EDIT on the very signature that
 * constrains them.
 *
 * ## The rule each provider applies
 *
 * A SIGNATURE IS SEALED FROM THE MOMENT IT IS STORED. The act it evidences is the signing itself;
 * there is no later moment at which it becomes committed, and no window in which replacing the
 * stroke would be legitimate.
 *
 * OTHER EVIDENCE IS SEALED ONCE THE RECORD THAT CITES IT IS TERMINAL. A photograph on a draft
 * daily report is still being assembled and may be replaced; the same photograph on a submitted
 * report is part of what somebody approved.
 *
 * ## How a correction actually happens
 *
 * Not by replacing bytes. Each module's own governed act attaches a NEW document and keeps the
 * old row, so the record shows that it was signed and then signed again — which is the thing an
 * auditor needs and the thing an in-place overwrite destroys. The refusals below say so, because
 * a refusal that only says "denied" sends somebody looking for a permission to grant themselves.
 */

const CORRECTION = 'a correction is made by signing again through the module’s own act, which keeps this one';

@Injectable()
export class SiteEvidenceCommittedProvider implements CommittedEvidenceProvider, OnModuleInit {
  readonly entity = 'site.daily-report';

  constructor(private readonly resolver: DocumentAccessResolver, private readonly site: SiteService) {}

  onModuleInit(): void {
    this.resolver.registerCommittedEvidenceProvider(this);
  }

  async isCommitted(document: Document): Promise<CommittedEvidenceVerdict> {
    const detail = await this.site.getDailyReportDetail(document.tenantId, document.aggregateId);
    if (!detail) return NOT_COMMITTED;
    const row = detail.evidence.find((e) => e.fileId === document.id);
    if (!row) return NOT_COMMITTED;

    if (row.category === 'signature') {
      return {
        committed: true,
        reason: `this is the signature recorded on daily report ${detail.report.reportNumber} and cannot be replaced — ${CORRECTION}`,
      };
    }
    // A photograph on a draft is still being assembled; on a submitted day it is part of what a
    // reviewer approved.
    if (detail.report.status !== 'draft') {
      return {
        committed: true,
        reason: `daily report ${detail.report.reportNumber} has been submitted, so its evidence can no longer be replaced — reopen the report to change what it carries`,
      };
    }
    return NOT_COMMITTED;
  }
}

@Injectable()
export class CommissioningSignoffCommittedProvider implements CommittedEvidenceProvider, OnModuleInit {
  readonly entity = 'commissioning.record';

  constructor(private readonly resolver: DocumentAccessResolver, private readonly commissioning: CommissioningService) {}

  onModuleInit(): void {
    this.resolver.registerCommittedEvidenceProvider(this);
  }

  async isCommitted(document: Document): Promise<CommittedEvidenceVerdict> {
    const detail = await this.commissioning.getDetail(document.aggregateId, document.tenantId);
    if (!detail) return NOT_COMMITTED;
    const row = detail.signoffEvidence.find((e) => e.documentId === document.id);
    if (!row) return NOT_COMMITTED;
    return {
      committed: true,
      reason: `this is the ${row.party.replace(/_/g, ' ')} signature on the witnessed sign-off of ${detail.record.code} and cannot be replaced — ${CORRECTION}`,
    };
  }
}

@Injectable()
export class HandoverAcceptanceCommittedProvider implements CommittedEvidenceProvider, OnModuleInit {
  readonly entity = 'commissioning.handover';

  constructor(private readonly resolver: DocumentAccessResolver, private readonly handover: HandoverService) {}

  onModuleInit(): void {
    this.resolver.registerCommittedEvidenceProvider(this);
  }

  async isCommitted(document: Document): Promise<CommittedEvidenceVerdict> {
    const pkg = await this.handover.get(document.aggregateId, document.tenantId);
    if (!pkg || pkg.acceptanceEvidenceDocumentId !== document.id) return NOT_COMMITTED;
    // An accepted handover is contractually closed and the domain already refuses re-acceptance,
    // so there is no correcting act at all here — which the refusal says rather than implying one.
    return {
      committed: true,
      reason: `this is the evidence client acceptance of ${pkg.code} was recorded on and cannot be replaced — an accepted handover is closed and has no re-acceptance`,
    };
  }
}

@Injectable()
export class InspectionEvidenceCommittedProvider implements CommittedEvidenceProvider, OnModuleInit {
  readonly entity = 'quality.inspection-request';

  constructor(private readonly resolver: DocumentAccessResolver, private readonly quality: QualityService) {}

  onModuleInit(): void {
    this.resolver.registerCommittedEvidenceProvider(this);
  }

  async isCommitted(document: Document): Promise<CommittedEvidenceVerdict> {
    const found = await this.quality.readInspection(document.tenantId, document.aggregateId);
    if (!found) return NOT_COMMITTED;
    const row = found.evidence.find((e) => e.fileId === document.id);
    if (!row) return NOT_COMMITTED;

    if (row.category === 'signature') {
      return {
        committed: true,
        reason: `this is the signature inspection ${found.inspection.irNumber} was resolved on and cannot be replaced — ${CORRECTION}`,
      };
    }
    // A resolved inspection accrues a measured quantity, so the photographs it was approved on
    // are part of what was valued.
    const resolved = found.inspection.status === 'approved' || found.inspection.status === 'rejected';
    if (resolved) {
      return {
        committed: true,
        reason: `inspection ${found.inspection.irNumber} has been ${found.inspection.status}, so the evidence it was decided on can no longer be replaced`,
      };
    }
    return NOT_COMMITTED;
  }
}
