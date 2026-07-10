import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

// Service accounts / API keys (Vol 15 §2.5, migration 0138). Machine credentials for
// external integrations: an `aura_sk_…` bearer key resolves to identity `sa:<id>`,
// authorized through the SAME AccessService grants as any user. Only the SHA-256 hash
// is stored; the key is returned exactly once at creation. Hydrate-on-boot so verify()
// is a sync map lookup on the request hot path (AuthService step 0).

export interface ServiceAccount {
  tenantId: string;
  id: string;
  name: string;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

const KEY_PREFIX = 'aura_sk_';
const TOUCH_INTERVAL_MS = 5 * 60_000; // last_used_at writes at most once per 5 min per key

const hash = (key: string): string => crypto.createHash('sha256').update(key).digest('hex');
const mapKey = (tenantId: string, id: string): string => `${tenantId} ${id}`;

@Injectable()
export class ServiceAccountsService implements OnModuleInit {
  private readonly logger = new Logger('ServiceAccounts');
  private readonly byId = new Map<string, ServiceAccount>();
  private readonly byHash = new Map<string, ServiceAccount>();
  private readonly hashById = new Map<string, string>();
  private readonly touched = new Map<string, number>();

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  async onModuleInit(): Promise<void> {
    if (!this.pool) return;
    try {
      const { rows } = await this.pool.query<{
        tenant_id: string;
        id: string;
        name: string;
        key_hash: string;
        active: boolean;
        created_by: string | null;
        created_at: string;
        last_used_at: string | null;
      }>(`SELECT tenant_id, id, name, key_hash, active, created_by, created_at, last_used_at FROM public.aura_service_accounts`);
      for (const r of rows) {
        const account: ServiceAccount = {
          tenantId: r.tenant_id,
          id: r.id,
          name: r.name,
          active: r.active,
          createdBy: r.created_by,
          createdAt: String(r.created_at),
          lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
        };
        this.index(account, r.key_hash);
      }
      if (rows.length) this.logger.log(`Hydrated ${rows.length} service account(s) from Postgres`);
    } catch (err) {
      this.logger.error(`Service-accounts hydrate failed: ${(err as Error).message}`);
    }
  }

  private index(account: ServiceAccount, keyHash: string): void {
    this.byId.set(mapKey(account.tenantId, account.id), account);
    this.byHash.set(keyHash, account);
    this.hashById.set(mapKey(account.tenantId, account.id), keyHash);
  }

  /** Does this bearer token look like a service key (route to verify(), not JWT)? */
  static isServiceKey(token: string): boolean {
    return token.startsWith(KEY_PREFIX);
  }

  /** Sync hot-path verification: key → active account, or null. Touches last_used_at. */
  verify(key: string): ServiceAccount | null {
    const account = this.byHash.get(hash(key)) ?? null;
    if (!account || !account.active) return null;
    const k = mapKey(account.tenantId, account.id);
    const now = Date.now();
    if ((this.touched.get(k) ?? 0) + TOUCH_INTERVAL_MS < now) {
      this.touched.set(k, now);
      account.lastUsedAt = new Date().toISOString();
      if (this.pool) {
        void this.pool
          .query(`UPDATE public.aura_service_accounts SET last_used_at = now() WHERE tenant_id = $1 AND id = $2`, [account.tenantId, account.id])
          .catch(() => undefined);
      }
    }
    return account;
  }

  list(tenantId: string): ServiceAccount[] {
    return [...this.byId.values()]
      .filter((a) => a.tenantId === tenantId)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Create an account and mint its key — the ONLY time the key exists in plaintext. */
  create(tenantId: string, name: string, createdBy: string | null): { account: ServiceAccount; key: string } {
    const id = `svc-${crypto.randomBytes(4).toString('hex')}`;
    const key = KEY_PREFIX + crypto.randomBytes(24).toString('hex');
    const account: ServiceAccount = {
      tenantId,
      id,
      name: name.trim(),
      active: true,
      createdBy,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    const keyHash = hash(key);
    this.index(account, keyHash);
    if (this.pool) {
      void this.pool
        .query(
          `INSERT INTO public.aura_service_accounts (tenant_id, id, name, key_hash, active, created_by) VALUES ($1,$2,$3,$4,true,$5)`,
          [tenantId, id, account.name, keyHash, createdBy],
        )
        .catch((err) => this.logger.error(`persist service account ${id} failed: ${(err as Error).message}`));
    }
    this.logger.log(`Service account created: ${id} ("${account.name}")`);
    return { account, key };
  }

  /** Revoke (deactivate) or reinstate — takes effect on the next request. */
  setActive(tenantId: string, id: string, active: boolean): ServiceAccount | null {
    const account = this.byId.get(mapKey(tenantId, id));
    if (!account) return null;
    account.active = active;
    if (this.pool) {
      void this.pool
        .query(`UPDATE public.aura_service_accounts SET active = $3 WHERE tenant_id = $1 AND id = $2`, [tenantId, id, active])
        .catch((err) => this.logger.error(`persist service account ${id} failed: ${(err as Error).message}`));
    }
    return account;
  }

  remove(tenantId: string, id: string): boolean {
    const k = mapKey(tenantId, id);
    const account = this.byId.get(k);
    if (!account) return false;
    this.byId.delete(k);
    const keyHash = this.hashById.get(k);
    if (keyHash) this.byHash.delete(keyHash);
    this.hashById.delete(k);
    if (this.pool) {
      void this.pool
        .query(`DELETE FROM public.aura_service_accounts WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
        .catch((err) => this.logger.error(`delete service account ${id} failed: ${(err as Error).message}`));
    }
    return true;
  }
}
