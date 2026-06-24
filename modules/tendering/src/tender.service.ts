import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { TENDER_EVENT, type Tender, type NewTender, makeTender } from './domain/tender';
import { TENDER_STORE, type TenderFilter, type TenderStore } from './tender-store';

/**
 * Tendering service — the second deal-chain module, cloned from the CRM template.
 * Owns `aura_tendering_tenders`, goes through the kernel access seam, and emits
 * `tendering.tender.*` on the spine. It REFERENCES CRM accounts by id + snapshot
 * (never joins CRM's tables) — modules compose via events/API, not the database.
 */
@Injectable()
export class TenderService {
  private readonly logger = new Logger('Tendering');

  constructor(
    @Inject(TENDER_STORE) private readonly store: TenderStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
  ) {}

  async create(input: NewTender): Promise<Tender> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'tendering.tender.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const tender = makeTender(input);
    await this.store.create(tender);
    await this.events.append([
      makeEvent({
        type: TENDER_EVENT.created,
        tenantId: tender.tenantId,
        companyId: tender.companyId,
        actorId: tender.createdBy,
        aggregateType: 'tendering.tender',
        aggregateId: tender.id,
        payload: {
          title: tender.title,
          status: tender.status,
          value: tender.value,
          account: tender.accountId
            ? { id: tender.accountId, name: tender.accountName }
            : null,
        },
      }),
    ]);
    this.logger.log(`Tender created: ${tender.title} (${tender.id}) value=${tender.value}`);
    return tender;
  }

  get(id: Id): Promise<Tender | null> {
    return this.store.get(id);
  }

  list(filter?: TenderFilter): Promise<Tender[]> {
    return this.store.list(filter);
  }
}
