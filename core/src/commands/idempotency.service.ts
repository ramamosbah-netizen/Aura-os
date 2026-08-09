import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

export interface IdempotencyRecord {
  status: number;
  body: any;
}

/** Outcome of an `acquireLease` attempt. */
export interface LeaseResult {
  status: 'acquired' | 'cached';
  cachedResponse?: { status: number; body: unknown };
}

interface LeaseRow {
  requestHash: string;
  status: 'processing' | 'completed' | 'failed';
  responseStatus: number;
  responseBody: unknown;
  expiresAt: number;
}

/** How long a lease is held before a crashed instance's key can be reclaimed. */
const LEASE_MS = 5 * 60 * 1000;
/** How long a completed response stays replayable. */
const CACHE_MS = 24 * 60 * 60 * 1000;

export function computePayloadHash(payload: unknown): string {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  return createHash('sha256').update(str).digest('hex');
}

/**
 * The single idempotency engine.
 *
 * Two APIs over the same concern:
 *  - `getRecord` / `saveRecord` — the original response cache keyed by `Idempotency-Key`
 *    (table `aura_idempotency_keys`, migration 0033), used by CommandBus.
 *  - `acquireLease` / `completeLease` — exactly-once execution with a payload hash and a
 *    crash-recoverable lease (table `aura_idempotency_records`, migration 0220), used by
 *    IdempotencyInterceptor for offline field replays.
 *
 * Both fall back to an in-process map when no pg pool is bound (tests, no-DB dev boot).
 * The map is per-instance and therefore NOT safe across replicas — the Postgres path is.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger('IdempotencyEngine');
  private readonly memoryCache = new Map<string, { record: IdempotencyRecord; expiresAt: number }>();
  private readonly memoryLeases = new Map<string, LeaseRow>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool | null,
  ) {}

  /**
   * Tries to find a cached response for a given tenant and idempotency key.
   */
  async getRecord(tenantId: string, key: string): Promise<IdempotencyRecord | null> {
    const cacheKey = `${tenantId}:${key}`;

    if (!this.pool) {
      const cached = this.memoryCache.get(cacheKey);
      if (!cached) return null;
      if (Date.now() > cached.expiresAt) {
        this.memoryCache.delete(cacheKey);
        return null;
      }
      return cached.record;
    }

    try {
      const res = await this.pool.query(
        `SELECT response_status, response_body
         FROM public.aura_idempotency_keys
         WHERE tenant_id = $1 AND idempotency_key = $2 AND expires_at > now()`,
        [tenantId, key]
      );
      if (res.rows.length === 0) return null;

      return {
        status: res.rows[0].response_status,
        body: res.rows[0].response_body,
      };
    } catch (error: any) {
      this.logger.error(`Error querying idempotency registry: ${error.message}`);
      return null;
    }
  }

  /**
   * Saves a response status and payload to the idempotency registry.
   */
  async saveRecord(tenantId: string, key: string, status: number, body: any, ttlSeconds = 86400): Promise<void> {
    const cacheKey = `${tenantId}:${key}`;
    const expiresAtMs = Date.now() + ttlSeconds * 1000;

    if (!this.pool) {
      this.memoryCache.set(cacheKey, {
        record: { status, body },
        expiresAt: expiresAtMs,
      });
      return;
    }

    try {
      const expiresAtIso = new Date(expiresAtMs).toISOString();
      await this.pool.query(
        `INSERT INTO public.aura_idempotency_keys
          (tenant_id, idempotency_key, response_status, response_body, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
         SET response_status = EXCLUDED.response_status,
             response_body = EXCLUDED.response_body,
             expires_at = EXCLUDED.expires_at`,
        [tenantId, key, status, JSON.stringify(body), expiresAtIso]
      );
    } catch (error: any) {
      this.logger.error(`Error saving idempotency record: ${error.message}`);
    }
  }

  /**
   * Claim the right to execute `(tenantId, operationId)` exactly once.
   *
   * - first caller wins the lease → `acquired`, run the handler
   * - a completed operation replayed with the same payload → `cached`, replay the response
   * - the same operationId with a *different* payload → 409 (the client has a bug, or a
   *   queued offline item was mutated after it was enqueued)
   * - a live lease held by another in-flight request → 409, the client retries later
   *
   * A lease whose holder died is reclaimed once `expires_at` passes, so a crashed
   * instance cannot wedge an operation id forever.
   */
  async acquireLease(
    tenantId: string,
    operationId: string,
    userId: string,
    endpoint: string,
    method: string,
    payload: unknown,
    attempt = 0,
  ): Promise<LeaseResult> {
    const hash = computePayloadHash(payload);

    if (!this.pool) return this.acquireLeaseInMemory(tenantId, operationId, hash);

    // Win the lease in one statement: insert when absent, and reclaim an expired or failed
    // lease in place. The hash guard in the WHERE means a payload mismatch never reclaims —
    // it falls through to the SELECT below and is rejected there.
    const claimed = await this.pool.query(
      `INSERT INTO public.aura_idempotency_records
         (tenant_id, operation_id, user_id, endpoint, method, request_hash, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'processing', now() + interval '5 minutes')
       ON CONFLICT (tenant_id, operation_id) DO UPDATE
         SET status = 'processing',
             user_id = EXCLUDED.user_id,
             endpoint = EXCLUDED.endpoint,
             method = EXCLUDED.method,
             updated_at = now(),
             expires_at = now() + interval '5 minutes'
         WHERE (public.aura_idempotency_records.status = 'failed'
                OR (public.aura_idempotency_records.status = 'processing'
                    AND public.aura_idempotency_records.expires_at <= now()))
           AND public.aura_idempotency_records.request_hash = EXCLUDED.request_hash
       RETURNING id`,
      [tenantId, operationId, userId, endpoint, method, hash],
    );
    if (claimed.rows.length > 0) return { status: 'acquired' };

    const existing = await this.pool.query(
      `SELECT request_hash, status, response_status, response_body, expires_at
       FROM public.aura_idempotency_records
       WHERE tenant_id = $1 AND operation_id = $2`,
      [tenantId, operationId],
    );
    if (existing.rows.length === 0) {
      // Raced with a delete/expiry sweep between the two statements — safe to run.
      return { status: 'acquired' };
    }

    const row = existing.rows[0];
    const decided = this.decideFromExisting(tenantId, operationId, hash, {
      requestHash: row.request_hash,
      status: row.status,
      responseStatus: row.response_status,
      responseBody: row.response_body ?? {},
      expiresAt: new Date(row.expires_at).getTime(),
    });

    // Reclaimable but the upsert did not take it — the row changed between the two
    // statements. The upsert is the authority, so run it again once; if the race repeats,
    // treat it as a live lease held elsewhere rather than spinning.
    if (decided) return decided;
    if (attempt === 0) {
      return this.acquireLease(tenantId, operationId, userId, endpoint, method, payload, 1);
    }
    throw new ConflictException({
      code: 'IDEMPOTENCY_OPERATION_IN_PROGRESS',
      message: `Operation ${operationId} is already in progress`,
    });
  }

  /** Record the handler's response so a later replay of the same operationId returns it. */
  async completeLease(
    tenantId: string,
    operationId: string,
    responseStatus: number,
    responseBody: unknown,
    resourceType = '',
    resourceId: string | null = null,
  ): Promise<void> {
    if (!this.pool) {
      const lease = this.memoryLeases.get(`${tenantId}:${operationId}`);
      if (!lease) return;
      lease.status = 'completed';
      lease.responseStatus = responseStatus;
      lease.responseBody = responseBody;
      lease.expiresAt = Date.now() + CACHE_MS;
      return;
    }

    try {
      await this.pool.query(
        `UPDATE public.aura_idempotency_records
         SET status = 'completed',
             response_status = $3,
             response_body = $4,
             resource_type = $5,
             resource_id = $6,
             completed_at = now(),
             updated_at = now(),
             expires_at = now() + interval '24 hours'
         WHERE tenant_id = $1 AND operation_id = $2`,
        [tenantId, operationId, responseStatus, JSON.stringify(responseBody), resourceType, resourceId],
      );
    } catch (error: any) {
      this.logger.error(`Error completing idempotency lease: ${error.message}`);
    }
  }

  /**
   * Release a lease whose handler threw, so the client's retry is not blocked for the full
   * lease window. The failed row keeps the payload hash, so a retry with a *different*
   * payload is still rejected.
   */
  async releaseLease(tenantId: string, operationId: string): Promise<void> {
    if (!this.pool) {
      const lease = this.memoryLeases.get(`${tenantId}:${operationId}`);
      if (lease && lease.status === 'processing') lease.status = 'failed';
      return;
    }

    try {
      await this.pool.query(
        `UPDATE public.aura_idempotency_records
         SET status = 'failed', updated_at = now()
         WHERE tenant_id = $1 AND operation_id = $2 AND status = 'processing'`,
        [tenantId, operationId],
      );
    } catch (error: any) {
      this.logger.error(`Error releasing idempotency lease: ${error.message}`);
    }
  }

  private acquireLeaseInMemory(tenantId: string, operationId: string, hash: string): LeaseResult {
    const key = `${tenantId}:${operationId}`;
    const existing = this.memoryLeases.get(key);

    if (existing) {
      const decided = this.decideFromExisting(tenantId, operationId, hash, existing);
      // `decideFromExisting` only returns for a cache hit; anything reclaimable falls through.
      if (decided) return decided;
    }

    this.memoryLeases.set(key, {
      requestHash: hash,
      status: 'processing',
      responseStatus: 200,
      responseBody: {},
      expiresAt: Date.now() + LEASE_MS,
    });
    return { status: 'acquired' };
  }

  /**
   * Shared verdict for an operation id that already exists. Returns a cached replay, throws
   * 409 for a mismatch or a live lease, and returns null when the row is reclaimable.
   */
  private decideFromExisting(
    tenantId: string,
    operationId: string,
    hash: string,
    row: LeaseRow,
  ): LeaseResult | null {
    if (row.requestHash !== hash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
        message: `Operation ${operationId} was already submitted with a different payload`,
      });
    }

    if (row.status === 'completed') {
      this.logger.log(`Idempotency replay for ${tenantId}:${operationId} → ${row.responseStatus}`);
      return { status: 'cached', cachedResponse: { status: row.responseStatus, body: row.responseBody } };
    }

    if (row.status === 'processing' && Date.now() < row.expiresAt) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_OPERATION_IN_PROGRESS',
        message: `Operation ${operationId} is already in progress`,
      });
    }

    return null;
  }
}
