import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DocumentAccessResolver, type AccessContextProvider } from '@aura/core';
import type { Document, DocumentActor, DocumentPermissionLevel } from '@aura/shared';
import { LeadService, OpportunityDepthService } from '@aura/crm';

/**
 * Canonical Sales intake document access.
 *
 * A document remains owned by the Lead that received it. After conversion, the persisted
 * Lead.convertedOpportunityId plus the persisted Opportunity deal team gives Pre-Sales and its
 * reviewer read/download access to the same DMS document and versions. Nothing is copied and no
 * URL/body project or opportunity id participates in the decision.
 */
@Injectable()
export class CrmIntakeDocumentAccessProvider implements AccessContextProvider, OnModuleInit {
  readonly entity = 'crm.lead';

  constructor(
    private readonly resolver: DocumentAccessResolver,
    private readonly leads: LeadService,
    private readonly opportunityDepth: OpportunityDepthService,
  ) {}

  onModuleInit(): void {
    this.resolver.registerContextProvider(this);
  }

  async grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]> {
    if (document.aggregateType !== 'crm.lead') return [];
    const lead = await this.leads.get(document.aggregateId);
    if (!lead || lead.tenantId !== actor.tenantId) return [];

    // The current Sales owner maintains the intake record and its document revisions.
    if (lead.assignedTo === actor.userId) return ['VIEW', 'DOWNLOAD', 'EDIT'];

    if (!lead.convertedOpportunityId) return [];
    const team = await this.opportunityDepth.listDealTeam(actor.tenantId, lead.convertedOpportunityId);
    return team.some((member) => member.active && member.userId === actor.userId)
      ? ['VIEW', 'DOWNLOAD']
      : [];
  }
}
