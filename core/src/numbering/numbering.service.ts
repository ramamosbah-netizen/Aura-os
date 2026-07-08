import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

export interface NumberingOptions {
  fiscalYear?: number;
  padWidth?: number;
}

/** A configured document-numbering sequence (for the admin screen). */
export interface NumberSequence {
  companyId: string | null;
  module: string;
  entity: string;
  prefix: string;
  fiscalYear: number;
  padWidth: number;
  currentSeq: number;
}

interface SeqRecord extends NumberSequence {
  tenantId: string;
}

@Injectable()
export class NumberingService {
  private readonly logger = new Logger('NumberingEngine');
  private readonly memoryStore = new Map<string, SeqRecord>();

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
    const rec: SeqRecord = this.memoryStore.get(key) ?? { tenantId, companyId, module, entity, prefix, fiscalYear, padWidth, currentSeq: 0 };
    rec.currentSeq += 1;
    rec.prefix = prefix; // keep the latest caller-supplied format
    rec.padWidth = padWidth;
    this.memoryStore.set(key, rec);

    const padded = String(rec.currentSeq).padStart(padWidth, '0');
    const yearPart = fiscalYear ? `-${fiscalYear}` : '';
    return `${prefix}${yearPart}-${padded}`;
  }

  /** All configured sequences for a tenant (for the admin screen). */
  async listSequences(tenantId: string): Promise<NumberSequence[]> {
    if (!this.pool) {
      return [...this.memoryStore.values()]
        .filter((r) => r.tenantId === tenantId)
        .map(({ companyId, module, entity, prefix, fiscalYear, padWidth, currentSeq }) => ({ companyId, module, entity, prefix, fiscalYear, padWidth, currentSeq }));
    }
    const { rows } = await this.pool.query<{ module: string; entity: string; prefix: string; fiscal_year: number; pad_width: number; current_seq: number; company_id: string | null }>(
      `SELECT module, entity, prefix, fiscal_year, pad_width, current_seq, company_id
         FROM public.aura_number_sequences WHERE tenant_id = $1 ORDER BY module, entity, fiscal_year`,
      [tenantId],
    );
    return rows.map((r) => ({
      companyId: r.company_id,
      module: r.module,
      entity: r.entity,
      prefix: r.prefix,
      fiscalYear: r.fiscal_year,
      padWidth: r.pad_width,
      currentSeq: Number(r.current_seq),
    }));
  }

  /** Admin: set a sequence's current value (+ optional prefix/padWidth). Next code is currentSeq+1. */
  async setSequence(
    tenantId: string,
    input: { module: string; entity: string; fiscalYear: number; currentSeq: number; prefix?: string; padWidth?: number; companyId?: string | null },
  ): Promise<void> {
    const companyId = input.companyId ?? null;
    if (!this.pool) {
      const key = `${tenantId}:${companyId ?? ''}:${input.module}:${input.entity}:${input.fiscalYear}`;
      const rec: SeqRecord = this.memoryStore.get(key) ?? {
        tenantId, companyId, module: input.module, entity: input.entity, prefix: input.prefix ?? '', fiscalYear: input.fiscalYear, padWidth: input.padWidth ?? 6, currentSeq: 0,
      };
      rec.currentSeq = input.currentSeq;
      if (input.prefix !== undefined) rec.prefix = input.prefix;
      if (input.padWidth !== undefined) rec.padWidth = input.padWidth;
      this.memoryStore.set(key, rec);
      return;
    }
    await this.pool.query(
      `INSERT INTO public.aura_number_sequences (tenant_id, company_id, module, entity, prefix, fiscal_year, current_seq, pad_width)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, company_id, module, entity, fiscal_year)
       DO UPDATE SET current_seq = excluded.current_seq, prefix = excluded.prefix, pad_width = excluded.pad_width`,
      [tenantId, companyId, input.module, input.entity, input.prefix ?? '', input.fiscalYear, input.currentSeq, input.padWidth ?? 6],
    );
    this.logger.log(`[Numbering] Set ${input.module}/${input.entity} ${input.fiscalYear} → next ${input.currentSeq + 1} (tenant ${tenantId})`);
  }
}
