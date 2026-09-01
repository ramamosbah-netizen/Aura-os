import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type AccessTarget, assertSameTenant, type Id, makeEvent, type OrgLevel, sameTenantOrNull } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { type WbsNode, type WbsNodeStatus, makeWbsNode, calculateEvm, type EvmMetrics } from './domain/wbs';
import { WBS_STORE, type WbsNodeFilter, type WbsStore } from './wbs-store';
import { QuantityLedgerService } from './quantity-ledger.service';
import { DeliveryItemMapService } from './delivery-item-map.service';
import { PROJECT_STORE, type ProjectStore } from './project-store';

/** Optional ITP release gate — injected when the Quality module is loaded (mirrors procurement's QUALITY_GATE). */
export const ITP_GATE = Symbol('ITP_GATE');
export interface ItpGate {
  checkItpReleaseGate(tenantId: string, projectId: string): Promise<{ passed: boolean; reason?: string }>;
}

function openingBaselineId(projectId: Id): Id {
  const hex = createHash('sha256').update(`wbs-opening-baseline:${projectId}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

@Injectable()
export class WbsService {
  private readonly logger = new Logger('WbsService');

  constructor(
    @Inject(WBS_STORE) private readonly store: WbsStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
    private readonly quantityLedger: QuantityLedgerService,
    @Optional() @Inject(ITP_GATE) private readonly itpGate?: ItpGate,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(DeliveryItemMapService) private readonly deliveryItemMaps?: DeliveryItemMapService,
    @Optional() @Inject(PROJECT_STORE) private readonly projects: ProjectStore | null = null,
  ) {}

  async create(input: {
    tenantId: Id;
    projectId: Id;
    parentId?: Id | null;
    code: string;
    title: string;
    plannedValue?: number;
    boqItemId?: Id | null;
    createdBy?: Id | null;
  }): Promise<WbsNode> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      const target: AccessTarget = { permission: 'projects.project.update', orgPath };
      this.access.assert(input.createdBy, target);
    }

    if (this.projects) {
      const project = await this.projects.get(input.projectId);
      if (!project || project.tenantId !== input.tenantId) throw new Error(`project ${input.projectId} not found`);
      if (project.wbsBaselineId) {
        throw new Error(`WBS baseline ${project.wbsBaselineId} is immutable; use a governed rebaseline`);
      }
    }

    const node = makeWbsNode({
      tenantId: input.tenantId,
      projectId: input.projectId,
      parentId: input.parentId,
      code: input.code,
      title: input.title,
      plannedValue: input.plannedValue,
      progress: 0,
      actualCost: 0,
      boqItemId: input.boqItemId ?? null,
    });

    await this.store.create(node);
    this.logger.log(`WBS Node created: ${node.code} - ${node.title} on project ${node.projectId}`);

    // Roll up hierarchy if this is a subtask
    if (node.parentId) {
      await this.rollup(node.parentId);
    }

    return node;
  }

  async updateProgress(
    id: Id,
    progress: number,
    status?: WbsNodeStatus,
    actorId?: Id,
    authority: 'manual' | 'quantity' = 'manual',
  ): Promise<WbsNode> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'WBS Node', id);

    if (authority === 'manual') {
      if (await this.isQuantityControlled(existing)) {
        throw new Error(`manual progress is not allowed for quantity-controlled WBS node ${existing.id}`);
      }
      const children = await this.store.list({ parentId: existing.id });
      if (children.length > 0) {
        throw new Error(`manual progress is not allowed for derived parent WBS node ${existing.id}`);
      }
    }

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      const target: AccessTarget = { permission: 'projects.project.update', orgPath };
      this.access.assert(actorId, target);
    }

    const updatedProgress = Math.min(100, Math.max(0, progress));
    const updatedStatus = status ?? (updatedProgress === 100 ? 'completed' : 'in_progress');

    const approvedBaselineAllocation = this.projects
      ? (await this.projects.get(existing.projectId))?.wbsBaselineSnapshot?.allocations.find((allocation) => allocation.nodeId === existing.id)?.plannedValue
      : undefined;
    const evAllocation = approvedBaselineAllocation ?? existing.plannedValue;

    // ITP release gate: a work package cannot close while the project has active ITPs
    // with pending inspection points (mirrors the MAR gate on PO issuance).
    if (updatedStatus === 'completed' && existing.status !== 'completed' && this.itpGate) {
      const gate = await this.itpGate.checkItpReleaseGate(existing.tenantId, existing.projectId);
      if (!gate.passed) {
        throw new Error(`ITP gate blocked WBS completion: ${gate.reason}`);
      }
    }

    const updatedNode: WbsNode = {
      ...existing,
      progress: updatedProgress,
      status: updatedStatus,
      earnedValue: Number((evAllocation * (updatedProgress / 100)).toFixed(2)),
    };

    await this.store.update(updatedNode);
    this.logger.log(`WBS Node ${updatedNode.code} progress updated to ${updatedProgress}%`);

    if (updatedNode.parentId) {
      await this.rollup(updatedNode.parentId);
    }

    return updatedNode;
  }

  /**
   * The Progress Engine (Phase 3): sync every WBS node linked to a BOQ item so its progress = the
   * item's physical % complete (installed / frozen SOLD for mapped items), read off the Quantity Ledger. Updating progress
   * recomputes earnedValue = plannedValue × progress, so Earned Value / SPI / CPI flow automatically
   * from site installation. Returns the nodes it moved. No-op when nothing is linked to the item.
   */
  async syncProgressFromQuantity(tenantId: Id, boqItemId: Id, projectId: Id): Promise<WbsNode[]> {
    // Quantity identifiers are only unique within their project boundary. When the originating
    // installation event carries projectId, keep both the WBS and immutable-map lookup scoped to
    // that project so a reused BOQ id can never move another project's progress.
    const allNodes = await this.store.list({ tenantId, projectId });
    const mappings = this.deliveryItemMaps
      ? await this.deliveryItemMaps.list({ tenantId, projectId })
      : [];
    const mappedEntries = mappings
      .filter((mapping) => mapping.wbsNodeId && (mapping.sourceItemId === boqItemId || mapping.frozenItemKey === boqItemId))
      .map((mapping) => ({ mapping, node: allNodes.find((node) => node.id === mapping.wbsNodeId) }))
      .filter((entry): entry is { mapping: typeof mappings[number]; node: WbsNode } => !!entry.node && entry.node.tenantId === tenantId);
    const entries = mappedEntries.length > 0
      ? mappedEntries
      : allNodes.filter((node) => node.boqItemId === boqItemId).map((node) => ({ mapping: null, node }));
    if (entries.length === 0) return [];
    const moved: WbsNode[] = [];
    for (const { mapping, node } of entries) {
      const ledgerItemId = mapping?.sourceItemId ?? mapping?.frozenItemKey ?? boqItemId;
      const position = await this.quantityLedger.position(tenantId, ledgerItemId);
      const progressPct = mapping
        ? this.progressFromSold(position.installed, position.sold)
        : position.progressPct;
      // WBS.progress is numeric for compatibility. Do not write 0 when the frozen SOLD target is
      // unavailable or invalid; leaving the projection untouched is the fail-closed UNKNOWN state.
      if (progressPct === null) continue;
      if (node.progress === progressPct) continue;
      moved.push(await this.updateProgress(node.id, progressPct, undefined, undefined, 'quantity'));
    }
    if (moved.length > 0) this.logger.log(`Progress Engine: BOQ ${boqItemId} → synced ${moved.length} WBS node(s)`);
    return moved;
  }

  /** Approve the opening WBS BAC baseline. The snapshot is the exact allocation evidence used by EVM. */
  async approveOpeningBaseline(projectId: Id, actorId: Id): Promise<import('./domain/project').Project> {
    if (!this.projects) throw new Error('project store is unavailable');
    const project = await this.projects.get(projectId);
    const tenantId = this.tenant?.boundTenantId() ?? project?.tenantId;
    if (!project || !tenantId || project.tenantId !== tenantId) throw new Error(`project ${projectId} not found`);
    if (project.wbsBaselineSnapshot) return project;

    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: project.tenantId }];
    this.access.assert(actorId, { permission: 'projects.project.update', orgPath });

    const nodes = await this.store.list({ tenantId: project.tenantId, projectId });
    const leaves = nodes.filter((node) => !nodes.some((child) => child.parentId === node.id));
    if (leaves.length === 0) throw new Error('opening BAC baseline requires at least one WBS leaf');
    if (leaves.some((node) => !node.plannedValueKnown || !Number.isFinite(node.plannedValue) || node.plannedValue < 0)) {
      throw new Error('opening BAC baseline requires explicit finite leaf allocations; unknown is not zero');
    }

    const allocations = leaves
      .map((node) => ({ nodeId: node.id, code: node.code, title: node.title, plannedValue: Number(node.plannedValue.toFixed(2)) }))
      .sort((a, b) => a.code.localeCompare(b.code) || a.nodeId.localeCompare(b.nodeId));
    const originalBac = Number(allocations.reduce((sum, allocation) => sum + allocation.plannedValue, 0).toFixed(2));
    const approvedAt = new Date().toISOString();
    const baselineId = openingBaselineId(project.id);
    const snapshot = {
      baselineId,
      approvedAt,
      approvedBy: actorId,
      allocations,
      originalBac,
    } satisfies import('./domain/project').WbsOpeningBaseline;
    const updated = {
      ...project,
      wbsBaselineId: baselineId,
      wbsBaselineApprovedAt: approvedAt,
      wbsBaselineApprovedBy: actorId,
      wbsBaselineSnapshot: snapshot,
    };
    await this.projects.update(updated);
    await this.events.append([makeEvent({
      type: 'projects.wbs.baseline.approved',
      tenantId: project.tenantId,
      companyId: project.companyId,
      actorId,
      aggregateType: 'projects.project',
      aggregateId: project.id,
      payload: { baselineId, originalBac, allocationNodeIds: allocations.map((allocation) => allocation.nodeId) },
    })]);
    return updated;
  }

  private async isQuantityControlled(node: WbsNode): Promise<boolean> {
    if (!this.deliveryItemMaps) return false;
    const mappings = await this.deliveryItemMaps.list({ tenantId: node.tenantId, projectId: node.projectId });
    return mappings.some((mapping) => mapping.wbsNodeId === node.id);
  }

  private progressFromSold(installed: number, sold: number | null): number | null {
    if (sold === null || !Number.isFinite(sold) || sold <= 0 || !Number.isFinite(installed)) return null;
    return Number(Math.min(100, Math.max(0, (installed / sold) * 100)).toFixed(2));
  }

  async recordActualSpend(id: Id, amount: number): Promise<WbsNode> {
    // Compatibility boundary only: WBS actual cost is a rebuildable projection of Cost Ledger
    // history, never an independently authored financial fact.
    void id;
    void amount;
    throw new Error('WBS actual cost is Cost Ledger-owned; use CostLedgerService.post()');
  }

  /** Set the rebuildable actual-cost projection from Cost Ledger truth. Does not alter PV/EV. */
  async reconcileActualProjection(id: Id, actualCost: number): Promise<WbsNode> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'WBS Node', id);
    const updatedNode: WbsNode = { ...existing, actualCost: Number(actualCost.toFixed(2)) };
    await this.store.update(updatedNode);
    if (updatedNode.parentId) await this.rollup(updatedNode.parentId);
    return updatedNode;
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<WbsNode | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  async list(filter?: WbsNodeFilter): Promise<WbsNode[]> {
    return this.store.list(filter);
  }

  async getEvmMetrics(projectId: Id): Promise<EvmMetrics> {
    const nodes = await this.store.list({ projectId });
    // Root level nodes (nodes with parentId === null) contain the rolled-up totals of all children
    const rootNodes = nodes.filter((n) => n.parentId === null);

    let ev = 0;
    let ac = 0;

    const project = this.projects ? await this.projects.get(projectId) : null;
    if (project?.wbsBaselineSnapshot) {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      for (const allocation of project.wbsBaselineSnapshot.allocations) {
        const node = byId.get(allocation.nodeId);
        if (!node) throw new Error(`approved WBS baseline node ${allocation.nodeId} is missing`);
        ev += allocation.plannedValue * (node.progress / 100);
        // Actual cost remains the B6 Cost Ledger-backed projection on the mapped leaf.
        ac += node.actualCost;
      }
    }

    if (!project?.wbsBaselineSnapshot) {
      // Without an approved opening baseline, BAC/EV are not authoritative. AC may still be
      // available from the B6 projection, but no static plannedValue is exposed as PV.
      ac = (rootNodes.length > 0 ? rootNodes : nodes).reduce((sum, node) => sum + node.actualCost, 0);
      return calculateEvm(null, null, ac, null);
    }

    return calculateEvm(project.wbsBaselineSnapshot.originalBac, ev, ac, null);
  }

  /**
   * Recursive roll up of Planned Value, Earned Value, and Actual Cost from children to parent
   */
  private async rollup(parentId: Id): Promise<void> {
    const parent = await this.store.get(parentId);
    if (!parent) return;

    // Get all child nodes of this parent
    const children = await this.store.list({ parentId });
    if (children.length === 0) return;

    let totalPV = 0;
    let totalEV = 0;
    let totalAC = 0;

    for (const child of children) {
      totalPV += child.plannedValue;
      totalEV += child.earnedValue;
      totalAC += child.actualCost;
    }

    const avgProgress = totalPV > 0 ? (totalEV / totalPV) * 100 : 0;

    const updatedParent: WbsNode = {
      ...parent,
      plannedValue: Number(totalPV.toFixed(2)),
      plannedValueKnown: children.every((child) => child.plannedValueKnown),
      earnedValue: Number(totalEV.toFixed(2)),
      actualCost: Number(totalAC.toFixed(2)),
      progress: Number(avgProgress.toFixed(2)),
      status: avgProgress === 100 ? 'completed' : avgProgress > 0 ? 'in_progress' : parent.status,
    };

    await this.store.update(updatedParent);
    this.logger.log(`Rolled up WBS Node ${parent.code}: PV=${totalPV}, EV=${totalEV}, AC=${totalAC}`);

    // Recurse up to parent's parent
    if (parent.parentId) {
      await this.rollup(parent.parentId);
    }
  }

  /**
   * Recalculates and rolls up cost variances (Planned Value - Actual Cost) across the entire
   * project WBS tree, updating parent node EVM metrics from leaf nodes up to root nodes.
   */
  async rollupCostVariances(projectId: Id): Promise<{ nodesRolledUp: number; totalCostVariance: number | null }> {
    const nodes = await this.store.list({ projectId });
    const leafNodes = nodes.filter((n) => !nodes.some((other) => other.parentId === n.id));

    let nodesRolledUp = 0;
    for (const leaf of leafNodes) {
      if (leaf.parentId) {
        await this.rollup(leaf.parentId);
        nodesRolledUp++;
      }
    }

    const evm = await this.getEvmMetrics(projectId);
    this.logger.log(`Cost variance rollup completed for project ${projectId}: EVM CV=${evm.costVariance}, SV=${evm.scheduleVariance}`);
    return { nodesRolledUp, totalCostVariance: evm.costVariance };
  }
}
