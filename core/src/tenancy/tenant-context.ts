import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Id } from '@aura/shared';

export interface TenantInfo {
  tenantId: Id;
  companyId: Id | null;
  actorId: Id | null;
  correlationId?: string | null;
}

const DEV_DEFAULT: TenantInfo = { tenantId: 'dev-tenant', companyId: null, actorId: null, correlationId: null };

/**
 * Holds the current tenant / company / actor for a request, isolated per request via
 * AsyncLocalStorage — so concurrent requests never see each other's identity. The auth
 * middleware binds it with `run()`; outside any request (boot, seeders, relay timers)
 * `get()` returns the dev default. Every event + query is stamped from here.
 */
@Injectable()
export class TenantContext {
  private readonly als = new AsyncLocalStorage<TenantInfo>();

  /** Bind `info` for the duration of `fn` (one request) — async-isolated. */
  run<T>(info: TenantInfo, fn: () => T): T {
    return this.als.run(info, fn);
  }

  /** Current request context, or the dev default outside any request scope. */
  get(): TenantInfo {
    return this.als.getStore() ?? DEV_DEFAULT;
  }

  /** Mutate the bound context (no-op outside a run scope). */
  set(info: Partial<TenantInfo>): void {
    const store = this.als.getStore();
    if (store) Object.assign(store, info);
  }
}
