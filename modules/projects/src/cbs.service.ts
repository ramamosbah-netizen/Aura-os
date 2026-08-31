import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, sameTenantOrNull } from '@aura/shared';
import { EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { type CbsNode, type NewCbsNode, makeCbsNode, calculateCbsSummary, type CbsSummary } from './domain/cbs';
import { CBS_STORE, type CbsNodeFilter, type CbsStore } from './cbs-store';
import { PROJECT_STORE, type ProjectStore } from './project-store';

@Injectable()
export class CbsService {
  private readonly logger = new Logger('CbsService');

  constructor(
    @Inject(CBS_STORE) private readonly store: CbsStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Optional() @Inject(PROJECT_STORE) private readonly projects: ProjectStore | null = null,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  async create(input: NewCbsNode): Promise<CbsNode> {
    await this.assertProjectBaselineWritable(input.projectId, input.tenantId);
    return this.persistNode(makeCbsNode(input));
  }

  /**
   * Seed the opening CBS baseline from a signed Contract handover.  This is deliberately a
   * separate, non-controller method: generic CBS writers remain blocked once the project is locked,
   * while the contract reactor may persist one immutable opening node when it has a real frozen cost
   * source.  The method refuses an untraceable seed rather than treating a missing cost as zero.
   */
  async createHandoverBaseline(input: NewCbsNode): Promise<CbsNode> {
    if (!input.sourceRevisionId) throw new Error('handover CBS baseline requires frozen source evidence');
    const project = this.projects ? await this.projects.get(input.projectId) : null;
    if (this.projects && (!project || project.tenantId !== input.tenantId || !project.handoverLockedAt)) {
      throw new Error(`project ${input.projectId} is not a locked commercial handover`);
    }
    return this.persistNode(makeCbsNode({ ...input, handoverLocked: true }));
  }

  private async persistNode(node: CbsNode): Promise<CbsNode> {
    await this.store.create(node);
    this.logger.log(`CBS Node created: ${node.code} - ${node.title} (project=${node.projectId})`);

    // Roll up parent hierarchy
    if (node.parentId) await this.rollup(node.parentId);

    await this.events.append([
      makeEvent({
        type: 'projects.cbs.created',
        tenantId: node.tenantId,
        companyId: null,
        actorId: null,
        aggregateType: 'projects.cbs',
        aggregateId: node.id,
        payload: { code: node.code, title: node.title, budgetAmount: node.budgetAmount },
      }),
    ]);

    return node;
  }

  async update(id: Id, patch: Partial<Pick<CbsNode, 'title' | 'category' | 'budgetAmount' | 'committedAmount' | 'actualAmount' | 'forecastAmount' | 'notes'>>): Promise<CbsNode> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'CBS Node', id);
    if (existing.handoverLocked && (patch.title !== undefined || patch.category !== undefined || patch.budgetAmount !== undefined || patch.notes !== undefined)) {
      throw new Error(`CBS baseline node ${id} is immutable after handover; use an approved variation`);
    }

    const budget = patch.budgetAmount ?? existing.budgetAmount;
    const forecast = patch.forecastAmount ?? existing.forecastAmount;

    const updated: CbsNode = {
      ...existing,
      ...patch,
      budgetAmount: budget,
      forecastAmount: forecast,
      variance: Number((budget - forecast).toFixed(2)),
    };

    await this.store.update(updated);
    this.logger.log(`CBS Node updated: ${updated.code} - budget=${updated.budgetAmount}, actual=${updated.actualAmount}`);

    if (updated.parentId) await this.rollup(updated.parentId);
    return updated;
  }

  /** Adjust the approved budget baseline (BAC) of a cost line — e.g. an approved variation
   *  (addition +, omission −). Variance (budget − forecast) is recomputed. */
  async recordBudget(id: Id, amount: number): Promise<CbsNode> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'CBS Node', id);
    if (existing.handoverLocked) {
      throw new Error(`CBS baseline node ${id} budget is immutable after handover; use an approved variation`);
    }

    return this.applyBudgetDelta(existing, amount);
  }

  /**
   * The sole governed exception to the handover budget lock. The approved-variation event is
   * already append-only and idempotent in CostLedgerService; this method is deliberately separate
   * from recordBudget so generic CBS writers can never opt into the exception accidentally.
   */
  async recordApprovedVariationBudget(id: Id, amount: number): Promise<CbsNode> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'CBS Node', id);
    return this.applyBudgetDelta(existing, amount);
  }

  private async applyBudgetDelta(existing: CbsNode, amount: number): Promise<CbsNode> {

    const budget = Number((existing.budgetAmount + amount).toFixed(2));
    const updated: CbsNode = {
      ...existing,
      budgetAmount: budget,
      variance: Number((budget - existing.forecastAmount).toFixed(2)),
    };
    await this.store.update(updated);
    this.logger.log(`CBS Node ${updated.code} budget ${amount >= 0 ? '+' : ''}${amount} (total=${budget})`);

    if (updated.parentId) await this.rollup(updated.parentId);
    return updated;
  }

  async recordCommittedCost(id: Id, amount: number): Promise<CbsNode> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'CBS Node', id);

    const updated: CbsNode = {
      ...existing,
      committedAmount: Number((existing.committedAmount + amount).toFixed(2)),
    };
    await this.store.update(updated);
    this.logger.log(`CBS Node ${updated.code} committed cost +${amount}`);

    if (updated.parentId) await this.rollup(updated.parentId);
    return updated;
  }

  async recordActualCost(id: Id, amount: number): Promise<CbsNode> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'CBS Node', id);

    const actual = Number((existing.actualAmount + amount).toFixed(2));
    const updated: CbsNode = {
      ...existing,
      actualAmount: actual,
      // Auto-adjust forecast: max of current forecast vs actuals (EAC = max(budget, actuals))
      forecastAmount: Math.max(existing.forecastAmount, actual),
      variance: Number((existing.budgetAmount - Math.max(existing.forecastAmount, actual)).toFixed(2)),
    };
    await this.store.update(updated);
    this.logger.log(`CBS Node ${updated.code} actual cost +${amount} (total=${actual})`);

    if (updated.parentId) await this.rollup(updated.parentId);
    return updated;
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<CbsNode | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  async list(filter?: CbsNodeFilter): Promise<CbsNode[]> {
    return this.store.list(filter);
  }

  async getSummary(projectId: Id): Promise<CbsSummary> {
    const nodes = await this.store.list({ projectId });
    // Use only leaf nodes for summation (nodes that have no children)
    const allIds = new Set(nodes.map((n) => n.id));
    const parentIds = new Set(nodes.filter((n) => n.parentId).map((n) => n.parentId!));
    const leafNodes = nodes.filter((n) => !parentIds.has(n.id) || !nodes.some((c) => c.parentId === n.id));
    return calculateCbsSummary(leafNodes.length > 0 ? leafNodes : nodes);
  }

  async delete(id: Id): Promise<void> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'CBS Node', id);
    if (existing.handoverLocked) throw new Error(`CBS baseline node ${id} is immutable after handover`);
    await this.store.delete(id);
    this.logger.log(`CBS Node deleted: ${id}`);
  }

  /** Recursive roll-up of budget, committed, actual, and forecast from children to parent. */
  private async rollup(parentId: Id): Promise<void> {
    const parent = await this.store.get(parentId);
    if (!parent) return;

    const children = await this.store.list({ projectId: parent.projectId, parentId });
    if (children.length === 0) return;

    let budget = 0, committed = 0, actual = 0, forecast = 0;
    for (const c of children) {
      budget += c.budgetAmount;
      committed += c.committedAmount;
      actual += c.actualAmount;
      forecast += c.forecastAmount;
    }

    const updated: CbsNode = {
      ...parent,
      budgetAmount: Number(budget.toFixed(2)),
      committedAmount: Number(committed.toFixed(2)),
      actualAmount: Number(actual.toFixed(2)),
      forecastAmount: Number(forecast.toFixed(2)),
      variance: Number((budget - forecast).toFixed(2)),
    };
    await this.store.update(updated);
    this.logger.log(`CBS rollup ${parent.code}: budget=${budget}, actual=${actual}, forecast=${forecast}`);

    if (parent.parentId) await this.rollup(parent.parentId);
  }

  async syncFromBoq(projectId: Id, tenantId: Id, items: Array<{ itemCode: string; description: string; unit: string; quantity: number; rate: number; totalAmount: number }>): Promise<void> {
    await this.assertProjectBaselineWritable(projectId, tenantId);
    this.logger.log(`Syncing CBS from BOQ for project=${projectId} items=${items.length}`);
    
    const existing = await this.store.list({ projectId });
    const existingMap = new Map<string, CbsNode>();
    for (const node of existing) {
      existingMap.set(node.code, node);
    }

    const sortedItems = [...items].sort((a, b) => {
      const aParts = a.itemCode.split('.').length;
      const bParts = b.itemCode.split('.').length;
      return aParts - bParts;
    });

    const codeToIdMap = new Map<string, Id>();
    for (const node of existing) {
      codeToIdMap.set(node.code, node.id);
    }

    for (const item of sortedItems) {
      const code = item.itemCode.trim();
      if (!code) continue;

      const lastDot = code.lastIndexOf('.');
      const parentCode = lastDot !== -1 ? code.substring(0, lastDot) : null;
      const parentId = parentCode ? codeToIdMap.get(parentCode) : null;

      const existingNode = existingMap.get(code);
      if (existingNode) {
        await this.update(existingNode.id, {
          title: item.description,
          budgetAmount: item.totalAmount,
          forecastAmount: item.totalAmount,
        });
      } else {
        const node = await this.create({
          tenantId,
          projectId,
          parentId: parentId || null,
          code,
          title: item.description,
          budgetAmount: item.totalAmount,
          forecastAmount: item.totalAmount,
          category: 'direct',
        });
        codeToIdMap.set(code, node.id);
      }
    }
  }

  /**
   * CBS creation/synchronisation is a baseline writer. Once the Project handover is locked,
   * delivery changes must come through Variation/rebaseline commands rather than a live BOQ feed.
   * The optional store keeps small in-memory unit tests source-compatible while the application
   * module always provides the durable Project store.
   */
  private async assertProjectBaselineWritable(projectId: Id, tenantId: Id): Promise<void> {
    if (!this.projects) return;
    const project = await this.projects.get(projectId);
    if (project && project.tenantId === tenantId && project.handoverLockedAt) {
      throw new Error(`project ${projectId} CBS baseline is immutable after handover; use an approved variation`);
    }
  }
}
