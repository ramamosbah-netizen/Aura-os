import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

export interface IdempotencyRecord {
  status: number;
  body: any;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger('IdempotencyEngine');
  private readonly memoryCache = new Map<string, { record: IdempotencyRecord; expiresAt: number }>();

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
}
