import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

// Custom-field values (Form Designer P2, migration 0140). Designer-added `cf_*`
// fields have no column on the entity tables — the enforced endpoints capture their
// values here per created record; GET /forms/:id/values/:recordId reads them back.
// Postgres when configured, in-memory in dev.

@Injectable()
export class FormCustomValuesService {
  private readonly logger = new Logger('FormCustomValues');
  private readonly local = new Map<string, Record<string, unknown>>();

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  private key(tenantId: string, schemaId: string, recordId: string): string {
    return `${tenantId} ${schemaId} ${recordId}`;
  }

  async save(tenantId: string, schemaId: string, recordId: string, values: Record<string, unknown>): Promise<void> {
    if (Object.keys(values).length === 0) return;
    if (!this.pool) {
      this.local.set(this.key(tenantId, schemaId, recordId), values);
      return;
    }
    await this.pool.query(
      `INSERT INTO public.aura_form_custom_values (tenant_id, schema_id, record_id, field_values, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (tenant_id, schema_id, record_id)
       DO UPDATE SET field_values = public.aura_form_custom_values.field_values || excluded.field_values, updated_at = now()`,
      [tenantId, schemaId, recordId, JSON.stringify(values)],
    );
    this.logger.log(`Custom values saved: ${schemaId} · ${recordId} (${Object.keys(values).length} field(s))`);
  }

  async get(tenantId: string, schemaId: string, recordId: string): Promise<Record<string, unknown>> {
    if (!this.pool) return this.local.get(this.key(tenantId, schemaId, recordId)) ?? {};
    const { rows } = await this.pool.query<{ field_values: Record<string, unknown> }>(
      `SELECT field_values FROM public.aura_form_custom_values
        WHERE tenant_id = $1 AND schema_id = $2 AND record_id = $3`,
      [tenantId, schemaId, recordId],
    );
    return rows[0]?.field_values ?? {};
  }
}
