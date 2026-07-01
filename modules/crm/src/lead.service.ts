import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import { CRM_EVENT, type Lead, type NewLead, makeLead } from '@aura/shared';
import { CRM_LEAD_STORE, type LeadFilter, type LeadStore } from './lead-store';

@Injectable()
export class LeadService {
  private readonly logger = new Logger('CRM-Leads');

  constructor(
    @Inject(CRM_LEAD_STORE) private readonly store: LeadStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  async create(input: NewLead & { actorId?: Id | null }): Promise<Lead> {
    if (input.actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(input.actorId, target);
    }

    const lead = makeLead(input);
    const event = makeEvent({
      type: CRM_EVENT.leadCreated,
      tenantId: lead.tenantId,
      companyId: lead.companyId,
      actorId: input.actorId ?? null,
      aggregateType: 'crm.lead',
      aggregateId: lead.id,
      payload: { name: lead.name, companyName: lead.companyName, status: lead.status },
    });

    await this.tx.run(async (handle) => {
      await this.store.createWithClient(handle, lead);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Lead created: ${lead.name} (${lead.id})`);
    return lead;
  }

  async update(id: Id, updates: Partial<Pick<Lead, 'name' | 'companyName' | 'email' | 'phone' | 'status' | 'source'>>, actorId?: Id | null): Promise<Lead> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Lead ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      if (existing.companyId) orgPath.push({ level: 'company', id: existing.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(actorId, target);
    }

    const updated: Lead = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const event = makeEvent({
      type: CRM_EVENT.leadUpdated,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: actorId ?? null,
      aggregateType: 'crm.lead',
      aggregateId: updated.id,
      payload: { status: updated.status, changes: updates },
    });

    await this.tx.run(async (handle) => {
      await this.store.update(updated); // Note: update does not support tx handle, so it runs directly (or we can add handle support)
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Lead updated: ${updated.name} (${updated.id})`);
    return updated;
  }

  get(id: Id): Promise<Lead | null> {
    return this.store.get(id);
  }

  list(filter?: LeadFilter): Promise<Lead[]> {
    return this.store.list(filter);
  }

  listPaged(filter: LeadFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
