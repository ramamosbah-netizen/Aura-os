import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { DomainEvent } from '@aura/shared';
import { EVENT_STORE, EventBus, type EventStore } from '@aura/core';
import { type Funnel, emptyFunnel, foldEvent, isDealChainEvent } from './pipeline';
import { type ProjectLedger, foldProjectLedgers, isLedgerEvent } from './project-ledger';

/**
 * Read-only deal-chain projection. Rebuilds an in-memory funnel from the event log on
 * boot — the log is the source of truth, the read-model is derived, schema-free state —
 * then folds live events off the bus. Idempotent by event id, because the outbox spine
 * is at-least-once. It only OBSERVES; it never writes another module's tables.
 */
@Injectable()
export class PipelineProjection implements OnModuleInit {
  private readonly logger = new Logger('Intelligence');
  private readonly byTenant = new Map<string, Funnel>();
  private readonly ledgerEvents = new Map<string, DomainEvent[]>();
  private readonly seen = new Set<string>();

  constructor(
    @Inject(EVENT_STORE) private readonly store: EventStore,
    private readonly bus: EventBus,
  ) {}

  async onModuleInit(): Promise<void> {
    // Subscribe first, then replay — so an event arriving mid-replay is never missed
    // (the id-dedupe makes the overlap harmless).
    this.bus.subscribe('*', (e) => this.apply(e));
    const history = await this.store.list({ limit: 5000 });
    for (const e of history) this.apply(e);
    this.logger.log(
      `Pipeline projection ready — replayed ${history.length} event(s) across ${this.byTenant.size} tenant(s).`,
    );
  }

  /** Idempotent fold of one event into its tenant's read-models (funnel + project ledger). */
  private apply(e: DomainEvent): void {
    if (this.seen.has(e.id)) return;
    this.seen.add(e.id);
    if (isDealChainEvent(e.type)) {
      this.byTenant.set(e.tenantId, foldEvent(this.byTenant.get(e.tenantId) ?? emptyFunnel(), e));
    }
    if (isLedgerEvent(e.type)) {
      const list = this.ledgerEvents.get(e.tenantId) ?? [];
      list.push(e);
      this.ledgerEvents.set(e.tenantId, list);
    }
  }

  snapshot(tenantId: string): Funnel {
    return this.byTenant.get(tenantId) ?? emptyFunnel();
  }

  /** Per-project profitability (budget vs committed/invoiced), folded from kept ledger events. */
  ledgers(tenantId: string): ProjectLedger[] {
    return foldProjectLedgers(this.ledgerEvents.get(tenantId) ?? []);
  }
}
