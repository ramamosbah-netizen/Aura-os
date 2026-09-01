import { Inject, Injectable, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, sameTenantOrNull } from '@aura/shared';
import { AccessService, AuditService, EVENT_STORE, TenantContext, type EventStore } from '@aura/core';
import { type ProjectStore, PROJECT_STORE } from './project-store';
import type { Project } from './domain/project';
import { type WbsStore, WBS_STORE } from './wbs-store';
import { type CbsStore, CBS_STORE } from './cbs-store';
import { isFrozenDeliverySource, verifyHandoverSnapshotHash, type FrozenDeliverySourceItem } from './domain/handover';
import { type DeliveryItemMap, makeDeliveryItemMap, type NewDeliveryItemMap } from './domain/delivery-item-map';
import { DELIVERY_ITEM_MAP_STORE, type DeliveryItemMapFilter, type DeliveryItemMapStore } from './delivery-item-map-store';

export type DeliveryItemMapInput = NewDeliveryItemMap;

/** Owns the immutable handover-item → WBS/CBS membership proof. */
@Injectable()
export class DeliveryItemMapService {
  constructor(
    @Inject(DELIVERY_ITEM_MAP_STORE) private readonly store: DeliveryItemMapStore,
    @Inject(PROJECT_STORE) private readonly projects: ProjectStore,
    @Inject(WBS_STORE) private readonly wbs: WbsStore,
    @Inject(CBS_STORE) private readonly cbs: CbsStore,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(EVENT_STORE) private readonly events: EventStore | null = null,
    @Optional() @Inject(AuditService) private readonly audit: AuditService | null = null,
    @Optional() @Inject(AccessService) private readonly access: AccessService | null = null,
  ) {}

  async create(input: DeliveryItemMapInput): Promise<DeliveryItemMap> {
    if (input.sourceKind !== 'DIRECT' && input.sourceKind !== 'TENDER') {
      throw new Error('mapping source kind must be DIRECT or TENDER');
    }
    const actorId = this.tenant?.get().actorId ?? null;
    if (actorId && this.access) {
      this.access.assert(actorId, {
        permission: 'projects.project.update',
        orgPath: [{ level: 'tenant', id: input.tenantId }],
      });
    }
    const candidate = makeDeliveryItemMap(input);
    await this.validate(candidate);
    const persisted = await this.store.create(candidate);
    if (!this.sameMapping(persisted, candidate)) {
      throw new Error(`conflicting immutable delivery item mapping for ${input.frozenItemKey}`);
    }
    // Only the insert winner emits an event/audit row; identity replays remain side-effect free.
    if (persisted.id === candidate.id) {
      const context = this.tenant?.get();
      const payload = {
        handoverId: persisted.handoverId,
        frozenItemKey: persisted.frozenItemKey,
        sourceKind: persisted.sourceKind,
        sourceId: persisted.sourceId,
        sourceRevisionRef: persisted.sourceRevisionRef,
        sourceItemId: persisted.sourceItemId,
        wbsNodeId: persisted.wbsNodeId,
        cbsNodeId: persisted.cbsNodeId,
      };
      if (this.events) {
        await this.events.append([makeEvent({
          type: 'projects.delivery_item_map.created',
          tenantId: persisted.tenantId,
          companyId: context?.companyId ?? null,
          actorId,
          correlationId: context?.correlationId ?? null,
          aggregateType: 'projects.delivery_item_map',
          aggregateId: persisted.id,
          payload,
        })]);
      }
      if (this.audit) {
        await this.audit.log(
          persisted.tenantId,
          context?.companyId ?? null,
          actorId,
          'projects',
          'delivery_item_map',
          persisted.id,
          'created',
          payload,
          { source: 'projects.delivery_item_map.created', handoverId: persisted.handoverId, frozenItemKey: persisted.frozenItemKey },
          context?.correlationId ?? null,
        );
      }
    }
    return persisted;
  }

  /** Validate a persisted mapping against the B1 snapshot before another ledger can consume it. */
  async validate(mapping: DeliveryItemMap, expectedContractId?: Id): Promise<FrozenDeliverySourceItem> {
    const project = assertSameTenant(await this.projects.get(mapping.projectId), this.tenant?.boundTenantId(), 'project', mapping.projectId);
    if (project.tenantId !== mapping.tenantId) {
      throw new Error(`project ${mapping.projectId} does not belong to tenant ${mapping.tenantId}`);
    }
    this.assertProjectHandover(project, mapping);
    if (expectedContractId !== undefined && project.contractId !== expectedContractId) {
      throw new Error(`project ${project.id} contract does not match certified contract ${expectedContractId}`);
    }
    const item = this.frozenItem(project, mapping.frozenItemKey);
    this.assertFrozenIdentity(item, mapping);
    await this.assertDeliveryNodes(mapping, project);
    return item;
  }

  async get(id: Id): Promise<DeliveryItemMap | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  async list(filter: DeliveryItemMapFilter = {}): Promise<DeliveryItemMap[]> {
    const tenantId = this.tenant?.boundTenantId();
    return this.store.list({ ...filter, ...(tenantId ? { tenantId } : {}) });
  }

  private assertProjectHandover(project: Project, input: DeliveryItemMapInput): void {
    if (project.origin !== 'commercial_handover' || !project.handoverId || !project.handoverSnapshot) {
      throw new Error(`project ${project.id} has no immutable commercial handover`);
    }
    if (project.handoverId !== input.handoverId) {
      throw new Error(`handover ${input.handoverId} does not match project ${project.id}`);
    }
    if (!isFrozenDeliverySource(project.handoverSnapshot)) {
      throw new Error(`project ${project.id} handover snapshot is not a valid frozen source envelope`);
    }
    if (project.handoverSnapshot.handoverId !== project.handoverId) {
      throw new Error(`project ${project.id} handover identity is inconsistent`);
    }
    if (project.handoverSnapshot.tenantId !== project.tenantId) {
      throw new Error(`project ${project.id} handover tenant is inconsistent`);
    }
    if (!project.handoverSnapshotHash || !verifyHandoverSnapshotHash(project.handoverSnapshot, project.handoverSnapshotHash)) {
      throw new Error(`project ${project.id} handover snapshot hash is invalid`);
    }
  }

  private frozenItem(project: Project, key: string): FrozenDeliverySourceItem {
    const snapshot = project.handoverSnapshot;
    if (!snapshot || !Array.isArray(snapshot.sourceItems)) {
      throw new Error(`frozen item evidence is unavailable for project ${project.id}`);
    }
    const item = (snapshot.sourceItems as FrozenDeliverySourceItem[]).find((candidate) => candidate.frozenItemKey === key);
    if (!item) throw new Error(`frozen item ${key} is not present in the immutable handover snapshot`);
    return item;
  }

  private assertFrozenIdentity(item: FrozenDeliverySourceItem, input: DeliveryItemMapInput): void {
    if (item.sourceKind !== input.sourceKind) throw new Error('mapping source kind does not match frozen item evidence');
    if ((item.sourceId ?? null) !== (input.sourceId ?? null)) throw new Error('mapping source id does not match frozen item evidence');
    if ((item.sourceRevisionRef ?? null) !== (input.sourceRevisionRef ?? null)) throw new Error('mapping source revision does not match frozen item evidence');
    if ((item.sourceItemId ?? null) !== (input.sourceItemId ?? null)) throw new Error('mapping source item id does not match frozen item evidence');
  }

  private async assertDeliveryNodes(input: DeliveryItemMapInput, project: Project): Promise<void> {
    if (input.wbsNodeId) {
      const node = await this.wbs.get(input.wbsNodeId);
      if (!node || node.tenantId !== project.tenantId || node.projectId !== project.id) {
        throw new Error(`WBS node ${input.wbsNodeId} does not belong to project ${project.id}`);
      }
    }
    if (input.cbsNodeId) {
      const node = await this.cbs.get(input.cbsNodeId);
      if (!node || node.tenantId !== project.tenantId || node.projectId !== project.id) {
        throw new Error(`CBS node ${input.cbsNodeId} does not belong to project ${project.id}`);
      }
    }
  }

  private sameMapping(a: DeliveryItemMap, b: DeliveryItemMap): boolean {
    return a.tenantId === b.tenantId
      && a.projectId === b.projectId
      && a.handoverId === b.handoverId
      && a.frozenItemKey === b.frozenItemKey
      && a.sourceKind === b.sourceKind
      && a.sourceId === b.sourceId
      && a.sourceRevisionRef === b.sourceRevisionRef
      && a.sourceItemId === b.sourceItemId
      && a.wbsNodeId === b.wbsNodeId
      && a.cbsNodeId === b.cbsNodeId;
  }
}
