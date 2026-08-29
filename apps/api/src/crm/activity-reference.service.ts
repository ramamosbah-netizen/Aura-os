import { BadRequestException, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  AccountService,
  ContactService,
  LeadService,
  OpportunityService,
  QuotationService,
  type ActivityRelatedType,
} from '@aura/crm';
import { TenderService } from '@aura/tendering';
import { ContractService } from '@aura/contracts';
import { ProjectService } from '@aura/projects';

/** Validates polymorphic activity links before any activity is persisted. */
@Injectable()
export class ActivityReferenceService {
  constructor(
    private readonly accounts: AccountService,
    private readonly contacts: ContactService,
    private readonly leads: LeadService,
    private readonly opportunities: OpportunityService,
    private readonly quotations: QuotationService,
    private readonly tenders: TenderService,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
  ) {}

  async validate(tenantId: string, relatedType?: ActivityRelatedType | null, relatedId?: string | null): Promise<void> {
    if (!relatedType && !relatedId) return;
    if (!relatedType || !relatedId) throw new BadRequestException('relatedType and relatedId must be supplied together');
    if (!isUUID(relatedId)) throw new BadRequestException('relatedId must be a UUID');

    const lookups: Record<ActivityRelatedType, () => Promise<{ tenantId?: string } | null>> = {
      account: () => this.accounts.get(relatedId),
      contact: () => this.contacts.get(relatedId),
      lead: () => this.leads.get(relatedId),
      opportunity: () => this.opportunities.get(relatedId),
      quotation: () => this.quotations.get(relatedId),
      tender: () => this.tenders.get(relatedId),
      contract: () => this.contracts.get(relatedId),
      project: () => this.projects.get(relatedId),
    };
    const record = await lookups[relatedType]();
    // Same response for missing and foreign rows prevents cross-tenant enumeration.
    if (!record || record.tenantId !== tenantId) throw new BadRequestException('related record not found');
  }
}
