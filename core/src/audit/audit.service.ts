import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';
import { TenantContext } from '../tenancy/tenant-context';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditEngine');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool | null,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Logs a state mutation to the immutable audit database ledger.
   */
  async log(
    tenantId: string,
    companyId: string | null,
    actorId: string | null,
    module: string,
    entityType: string,
    entityId: string,
    action: string,
    changes: Record<string, any> = {},
    metadata: Record<string, any> = {},
    correlationId?: string | null,
  ): Promise<void> {
    const activeCorrelationId = correlationId || this.tenant.get().correlationId || null;

    if (!this.pool) {
      this.logger.log(
        `[AUDIT MEMORY] Tenant: ${tenantId} | Actor: ${actorId} | Correlation: ${activeCorrelationId} | Module: ${module} | Entity: ${entityType}:${entityId} | Action: ${action} | Changes: ${JSON.stringify(changes)}`,
      );
      return;
    }

    try {
      await this.pool.query(
        `INSERT INTO public.aura_audit_log 
          (tenant_id, company_id, actor_id, module, entity_type, entity_id, action, changes, metadata, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tenantId,
          companyId,
          actorId,
          module,
          entityType,
          entityId,
          action,
          JSON.stringify(changes),
          JSON.stringify(metadata),
          activeCorrelationId,
        ],
      );
    } catch (error: any) {
      this.logger.error(`Failed writing to audit log: ${error.message}`);
    }
  }
}
