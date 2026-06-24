import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';
import { EventBus } from './event-bus';
import { EVENT_COLUMNS, type EventRow, rowToEvent } from './postgres-event-store';

const POLL_MS = Number(process.env.OUTBOX_POLL_MS ?? 1000);
const BATCH = Number(process.env.OUTBOX_BATCH ?? 100);

/**
 * Transactional-outbox relay. Polls `aura_events` for rows with processed_at IS NULL,
 * publishes each to the in-process EventBus, then stamps processed_at — at-least-once
 * delivery, never a lost event. `FOR UPDATE SKIP LOCKED` claims rows so more than one
 * API instance is safe. Idle (no-op) when there's no DATABASE_URL, so the kernel still
 * boots on the in-memory store.
 *
 * NOTE: a handler failure records `processing_error` and leaves the row unprocessed to
 * retry next tick. A dead-letter cap (max attempts) is a follow-up once modules emit.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OutboxRelay');
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    private readonly pool: Pool | null,
    private readonly bus: EventBus,
  ) {}

  onModuleInit(): void {
    if (!this.pool) {
      this.logger.warn('No DATABASE_URL — outbox relay idle (events use the in-memory store).');
      return;
    }
    this.timer = setInterval(() => void this.drain(), POLL_MS);
    this.timer.unref(); // don't keep the process alive just for the poll
    this.logger.log(`Relay started — draining aura_events every ${POLL_MS}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Drain one batch of unprocessed events. Re-entrancy guarded by `draining`. */
  async drain(): Promise<void> {
    if (!this.pool || this.draining) return;
    this.draining = true;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<EventRow>(
        `SELECT ${EVENT_COLUMNS} FROM public.aura_events
           WHERE processed_at IS NULL
           ORDER BY created_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED`,
        [BATCH],
      );
      for (const row of rows) {
        const event = rowToEvent(row);
        try {
          await this.bus.publish(event);
          await client.query(
            'UPDATE public.aura_events SET processed_at = now(), processing_error = NULL WHERE id = $1',
            [event.id],
          );
        } catch (err) {
          this.logger.error(`Handler failed for ${event.type} (${event.id}): ${String(err)}`);
          await client.query('UPDATE public.aura_events SET processing_error = $2 WHERE id = $1', [
            event.id,
            String(err),
          ]);
        }
      }
      await client.query('COMMIT');
      if (rows.length) this.logger.log(`Relayed ${rows.length} event(s).`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      this.logger.error(`Drain failed: ${String(err)}`);
    } finally {
      client.release();
      this.draining = false;
    }
  }
}
