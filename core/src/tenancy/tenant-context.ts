import { Injectable } from '@nestjs/common';
import type { Id } from '@aura/shared';

export interface TenantInfo {
  tenantId: Id;
  companyId: Id | null;
  actorId: Id | null;
}

/**
 * Holds the current tenant / company / actor for a request. Phase 0 is a simple
 * holder with a dev default; the production impl uses AsyncLocalStorage so each
 * request is truly isolated. Every event + query is stamped from here.
 */
@Injectable()
export class TenantContext {
  private current: TenantInfo = { tenantId: 'dev-tenant', companyId: null, actorId: null };

  set(info: TenantInfo): void {
    this.current = info;
  }

  get(): TenantInfo {
    return this.current;
  }
}
