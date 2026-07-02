import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { type WbsNode, type WbsNodeStatus, makeWbsNode, calculateEvm, type EvmMetrics } from './domain/wbs';
import { WBS_STORE, type WbsNodeFilter, type WbsStore } from './wbs-store';

/** Optional ITP release gate — injected when the Quality module is loaded (mirrors procurement's QUALITY_GATE). */
export const ITP_GATE = Symbol('ITP_GATE');
export interface ItpGate {
  checkItpReleaseGate(tenantId: string, projectId: string): Promise<{ passed: boolean; reason?: string }>;
}

@Injectable()
export class WbsService {
  private readonly logger = new Logger('WbsService');

  constructor(
    @Inject(WBS_STORE) private readonly store: WbsStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
    @Optional() @Inject(ITP_GATE) private readonly itpGate?: ItpGate,
  ) {}

  async create(input: {
    tenantId: Id;
    projectId: Id;
    parentId?: Id | null;
    code: string;
    title: string;
    plannedValue?: number;
    createdBy?: Id | null;
  }): Promise<WbsNode> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      const target: AccessTarget = { permission: 'projects.project.update', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const node = makeWbsNode({
      tenantId: input.tenantId,
      projectId: input.projectId,
      parentId: input.parentId,
      code: input.code,
      title: input.title,
      plannedValue: input.plannedValue ?? 0,
      progress: 0,
      actualCost: 0,
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
  ): Promise<WbsNode> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`WBS Node ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      const target: AccessTarget = { permission: 'projects.project.update', orgPath };
      this.access.assert(actorId, target);
    }

    const updatedProgress = Math.min(100, Math.max(0, progress));
    const updatedStatus = status ?? (updatedProgress === 100 ? 'completed' : 'in_progress');

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
      earnedValue: Number((existing.plannedValue * (updatedProgress / 100)).toFixed(2)),
    };

    await this.store.update(updatedNode);
    this.logger.log(`WBS Node ${updatedNode.code} progress updated to ${updatedProgress}%`);

    if (updatedNode.parentId) {
      await this.rollup(updatedNode.parentId);
    }

    return updatedNode;
  }

  async recordActualSpend(id: Id, amount: number): Promise<WbsNode> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`WBS Node ${id} not found`);

    const updatedNode: WbsNode = {
      ...existing,
      actualCost: Number((existing.actualCost + amount).toFixed(2)),
    };

    await this.store.update(updatedNode);
    this.logger.log(`WBS Node ${updatedNode.code} actual spend recorded: +$${amount}`);

    if (updatedNode.parentId) {
      await this.rollup(updatedNode.parentId);
    }

    return updatedNode;
  }

  async get(id: Id): Promise<WbsNode | null> {
    return this.store.get(id);
  }

  async list(filter?: WbsNodeFilter): Promise<WbsNode[]> {
    return this.store.list(filter);
  }

  async getEvmMetrics(projectId: Id): Promise<EvmMetrics> {
    const nodes = await this.store.list({ projectId });
    // Root level nodes (nodes with parentId === null) contain the rolled-up totals of all children
    const rootNodes = nodes.filter((n) => n.parentId === null);

    let pv = 0;
    let ev = 0;
    let ac = 0;

    if (rootNodes.length > 0) {
      // Sum the rolled-up values of all roots
      for (const n of rootNodes) {
        pv += n.plannedValue;
        ev += n.earnedValue;
        ac += n.actualCost;
      }
    } else {
      // If there are no hierarchies, just sum all nodes
      for (const n of nodes) {
        pv += n.plannedValue;
        ev += n.earnedValue;
        ac += n.actualCost;
      }
    }

    return calculateEvm(pv, ev, ac);
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
}
