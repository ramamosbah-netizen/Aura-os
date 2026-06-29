import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

export interface NumberingOptions {
  fiscalYear?: number;
  padWidth?: number;
}

@Injectable()
export class NumberingService {
  private readonly logger = new Logger('NumberingEngine');
  private readonly memoryStore = new Map<string, number>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool | null,
  ) {}

  /**
   * Generates the next gapless, concurrency-safe sequential code for documents.
   * Lock row using SELECT FOR UPDATE to guarantee safety.
   */
  async generateNextNumber(
    tenantId: string,
    companyId: string | null,
    module: string,
    entity: string,
    prefix: string,
    options: NumberingOptions = {},
  ): Promise<string> {
    const padWidth = options.padWidth ?? 6;
    const fiscalYear = options.fiscalYear ?? new Date().getFullYear();

    if (!this.pool) {
      return this.generateInMemory(tenantId, companyId, module, entity, prefix, fiscalYear, padWidth);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Attempt to upsert structural sequence settings (without incrementing sequence yet)
      await client.query(
        `INSERT INTO public.aura_number_sequences 
          (tenant_id, company_id, module, entity, prefix, fiscal_year, current_seq, pad_width)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
         ON CONFLICT (tenant_id, company_id, module, entity, fiscal_year) DO NOTHING`,
        [tenantId, companyId, module, entity, prefix, fiscalYear, padWidth],
      );

      // Select row FOR UPDATE to lock it exclusively
      const selectRes = await client.query(
        `SELECT current_seq, prefix, pad_width 
         FROM public.aura_number_sequences
         WHERE tenant_id = $1 AND coalesce(company_id, '') = coalesce($2, '') 
           AND module = $3 AND entity = $4 AND fiscal_year = $5
         FOR UPDATE`,
        [tenantId, companyId, module, entity, fiscalYear],
      );

      if (selectRes.rows.length === 0) {
        throw new Error('Failed to find or initialize numbering sequence.');
      }

      const activeRow = selectRes.rows[0];
      const nextSeq = Number(activeRow.current_seq) + 1;

      // Update the sequence value in-place
      await client.query(
        `UPDATE public.aura_number_sequences
         SET current_seq = $1
         WHERE tenant_id = $2 AND coalesce(company_id, '') = coalesce($3, '') 
           AND module = $4 AND entity = $5 AND fiscal_year = $6`,
        [nextSeq, tenantId, companyId, module, entity, fiscalYear],
      );

      await client.query('COMMIT');

      const padded = String(nextSeq).padStart(activeRow.pad_width, '0');
      const yearPart = fiscalYear ? `-${fiscalYear}` : '';
      return `${activeRow.prefix}${yearPart}-${padded}`;
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      this.logger.error(`Failed generating sequence code: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  private generateInMemory(
    tenantId: string,
    companyId: string | null,
    module: string,
    entity: string,
    prefix: string,
    fiscalYear: number,
    padWidth: number,
  ): string {
    const key = `${tenantId}:${companyId ?? ''}:${module}:${entity}:${fiscalYear}`;
    const current = this.memoryStore.get(key) ?? 0;
    const next = current + 1;
    this.memoryStore.set(key, next);

    const padded = String(next).padStart(padWidth, '0');
    const yearPart = fiscalYear ? `-${fiscalYear}` : '';
    return `${prefix}${yearPart}-${padded}`;
  }
}
