import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { EVENT_STORE, type EventStore } from '../events/event-store';
import { EventBus } from '../events/event-bus';
import { PG_POOL } from '../events/pg-pool';
import { Projection } from './projection.types';
import type { DomainEvent } from '@aura/shared';

@Injectable()
export class ProjectionEngine implements OnModuleInit {
  private readonly logger = new Logger('ProjectionEngine');
  private readonly projections = new Map<string, Projection>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool | null,
    @Inject(EVENT_STORE) private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
  ) {}

  onModuleInit() {
    // Subscribe to EventBus to process projections in real-time
    this.eventBus.subscribe('*', async (event) => {
      await this.handleLiveEvent(event);
    });
  }

  /**
   * Bind an event's tenant to the transaction-local RLS GUC on `client`, so a projection's
   * write to a tenant-scoped read-model table satisfies the policy under the enforced `aura_app`
   * role. Projections run on the outbox relay's connection (live) or a rebuild stream (replay) —
   * neither is a request — so the tenant must come from the event itself, per event. `is_local`
   * = true keeps it scoped to the current transaction and self-resets on COMMIT/ROLLBACK.
   */
  private async bindEventTenant(client: PoolClient, event: DomainEvent): Promise<void> {
    await client.query('SELECT set_config($1, $2, true), set_config($3, $4, true)', [
      'app.current_tenant_id', event.tenantId ?? '',
      'app.current_company_id', event.companyId ?? '',
    ]);
  }

  register(projection: Projection): void {
    if (this.projections.has(projection.name)) {
      throw new Error(`Projection ${projection.name} is already registered.`);
    }
    this.projections.set(projection.name, projection);
    this.logger.log(`Registered projection: ${projection.name} (V${projection.version})`);
    
    // Asynchronously align projection status (rebuild if version changed)
    this.alignProjection(projection.name).catch((err) => {
      this.logger.error(`Failed to align projection ${projection.name}: ${err.message}`, err.stack);
    });
  }

  async replay(name: string): Promise<void> {
    const projection = this.projections.get(name);
    if (!projection) {
      throw new Error(`Projection ${name} not found.`);
    }

    if (!this.pool) {
      this.logger.log(`No database pool present. Running in-memory replay for ${name}.`);
      if (projection.reset) {
        await projection.reset(null);
      }
      const events = await this.eventStore.list({ limit: 100000 });
      for (const event of events) {
        await projection.handle(event, null);
      }
      return;
    }

    this.logger.log(`Starting replay rebuild for projection: ${name} (V${projection.version})`);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Set rebuilding status
      await client.query(
        `INSERT INTO public.aura_projection_status (projection_name, version, rebuilding, updated_at)
         VALUES ($1, $2, true, now())
         ON CONFLICT (projection_name) DO UPDATE SET rebuilding = true, version = $2, updated_at = now()`,
        [name, projection.version]
      );

      // Invoke reset hook if present
      if (projection.reset) {
        await projection.reset(client);
      }

      // Stream all events in order of occurrence
      const events = await this.eventStore.list({ limit: 100000 });
      let lastEventId: string | null = null;
      let lastOccurredAt: string | null = null;

      for (const event of events) {
        // Rebuild streams events across every tenant on one system connection; re-scope the RLS
        // GUC to each event's tenant before its write so isolation holds under `aura_app`.
        await this.bindEventTenant(client, event);
        await projection.handle(event, client);
        lastEventId = event.id;
        lastOccurredAt = event.occurredAt;
      }

      // Mark rebuilding complete
      await client.query(
        `UPDATE public.aura_projection_status
            SET rebuilding = false,
                last_event_id = $2,
                last_occurred_at = $3,
                updated_at = now()
          WHERE projection_name = $1`,
        [name, lastEventId, lastOccurredAt ? new Date(lastOccurredAt) : null]
      );

      await client.query('COMMIT');
      this.logger.log(`Replay rebuild complete for projection: ${name}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      this.logger.error(`Replay rebuild failed for projection ${name}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async alignProjection(name: string): Promise<void> {
    if (!this.pool) return;
    const projection = this.projections.get(name)!;

    const { rows } = await this.pool.query<{
      version: number;
      rebuilding: boolean;
    }>(
      `SELECT version, rebuilding FROM public.aura_projection_status WHERE projection_name = $1`,
      [name]
    );

    if (rows.length === 0 || rows[0].version !== projection.version) {
      // First register or version mismatch: trigger rebuild
      await this.replay(name);
    }
  }

  private async handleLiveEvent(event: DomainEvent): Promise<void> {
    if (!this.pool) {
      // In-memory fallback execution
      for (const projection of this.projections.values()) {
        try {
          await projection.handle(event, null);
        } catch (err: any) {
          this.logger.error(`Error in in-memory projection ${projection.name}: ${err.message}`);
        }
      }
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // The relay already restored the event's tenant into TenantContext (which connect() binds
      // at the session level), but bind it transaction-locally too so a projection's write is
      // RLS-scoped to the event's tenant regardless of ambient state — belt and suspenders.
      await this.bindEventTenant(client, event);

      for (const projection of this.projections.values()) {
        // Fetch current checkpoint status of the projection
        const { rows } = await client.query<{
          version: number;
          rebuilding: boolean;
        }>(
          `SELECT version, rebuilding FROM public.aura_projection_status WHERE projection_name = $1`,
          [projection.name]
        );

        const status = rows[0];
        if (status && status.rebuilding) {
          // Skip live updates while rebuilding (handled by replay stream)
          continue;
        }

        if (status && status.version === projection.version) {
          // Process event
          await projection.handle(event, client);

          // Update checkpoint status
          await client.query(
            `UPDATE public.aura_projection_status
                SET last_event_id = $2,
                    last_occurred_at = $3,
                    updated_at = now()
              WHERE projection_name = $1`,
            [projection.name, event.id, new Date(event.occurredAt)]
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      this.logger.error(`Live event projection handling failed:`, error);
    } finally {
      client.release();
    }
  }
}
