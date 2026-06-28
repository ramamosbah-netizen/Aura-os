import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Transmittal, makeTransmittal } from './domain/transmittal';
import { TRANSMITTAL_STORE, type TransmittalStore } from './store.interface';

import { type Correspondence, makeCorrespondence } from './domain/correspondence';
import { CORRESPONDENCE_STORE, type CorrespondenceStore } from './store.interface';

export const DOCCONTROL_EVENT = {
  transmittalSent: 'doccontrol.transmittal.sent',
  correspondenceLogged: 'doccontrol.correspondence.logged',
};

@Injectable()
export class DocControlService {
  private readonly logger = new Logger('DocControl');

  constructor(
    @Inject(TRANSMITTAL_STORE) private readonly transmittalStore: TransmittalStore,
    @Inject(CORRESPONDENCE_STORE) private readonly correspondenceStore: CorrespondenceStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  // ── Transmittals ──────────────────────────────────────────────────────────

  async createTransmittal(input: {
    tenantId: string;
    companyId?: string;
    code: string;
    title: string;
    projectId: string;
    projectName?: string;
    sender?: string;
    recipient?: string;
    createdBy?: string;
  }): Promise<Transmittal> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'doccontrol.transmittal.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const transmittal = makeTransmittal(input);
    const event = makeEvent({
      type: DOCCONTROL_EVENT.transmittalSent,
      tenantId: transmittal.tenantId,
      companyId: transmittal.companyId,
      actorId: input.createdBy || null,
      aggregateType: 'doccontrol.transmittal',
      aggregateId: transmittal.id,
      payload: { code: transmittal.code, title: transmittal.title, projectId: transmittal.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.transmittalStore.save(transmittal, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Transmittal created & sent: ${transmittal.code} (${transmittal.id})`);
    return transmittal;
  }

  async acknowledgeTransmittal(tenantId: Id, actorId: Id | null, id: Id): Promise<Transmittal> {
    const transmittal = await this.transmittalStore.findById(id, tenantId);
    if (!transmittal) throw new Error(`Transmittal with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (transmittal.companyId) orgPath.push({ level: 'company', id: transmittal.companyId });
      this.access.assert(actorId, { permission: 'doccontrol.transmittal.acknowledge', orgPath });
    }

    transmittal.status = 'acknowledged';
    transmittal.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.transmittalStore.save(transmittal, handle);
    });

    this.logger.log(`Transmittal acknowledged: ${transmittal.code} (${transmittal.id})`);
    return transmittal;
  }

  listTransmittals(tenantId: Id): Promise<Transmittal[]> {
    return this.transmittalStore.findAll(tenantId);
  }

  // ── Correspondence ─────────────────────────────────────────────────────────

  async createCorrespondence(input: {
    tenantId: string;
    companyId?: string;
    code: string;
    subject: string;
    projectId: string;
    projectName?: string;
    direction: 'inbound' | 'outbound';
    sender?: string;
    recipient?: string;
    createdBy?: string;
  }): Promise<Correspondence> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'doccontrol.correspondence.create', orgPath });
    }

    const correspondence = makeCorrespondence(input);
    const event = makeEvent({
      type: DOCCONTROL_EVENT.correspondenceLogged,
      tenantId: correspondence.tenantId,
      companyId: correspondence.companyId,
      actorId: input.createdBy || null,
      aggregateType: 'doccontrol.correspondence',
      aggregateId: correspondence.id,
      payload: { code: correspondence.code, subject: correspondence.subject, direction: correspondence.direction, projectId: correspondence.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.correspondenceStore.save(correspondence, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Correspondence logged: ${correspondence.code} (${correspondence.id})`);
    return correspondence;
  }

  async closeCorrespondence(tenantId: Id, actorId: Id | null, id: Id): Promise<Correspondence> {
    const correspondence = await this.correspondenceStore.findById(id, tenantId);
    if (!correspondence) throw new Error(`Correspondence with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (correspondence.companyId) orgPath.push({ level: 'company', id: correspondence.companyId });
      this.access.assert(actorId, { permission: 'doccontrol.correspondence.close', orgPath });
    }

    correspondence.status = 'closed';
    correspondence.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.correspondenceStore.save(correspondence, handle);
    });

    this.logger.log(`Correspondence closed: ${correspondence.code} (${correspondence.id})`);
    return correspondence;
  }

  listCorrespondence(tenantId: Id): Promise<Correspondence[]> {
    return this.correspondenceStore.findAll(tenantId);
  }
}
