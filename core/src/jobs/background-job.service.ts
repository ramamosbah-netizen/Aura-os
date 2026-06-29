import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

export interface BackgroundJob {
  id: string;
  tenantId: string;
  queueName: string;
  payload: any;
  status: string;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  errorMessage?: string;
}

@Injectable()
export class BackgroundJobService {
  private readonly logger = new Logger('BackgroundJobService');
  private readonly localQueue: BackgroundJob[] = [];

  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  async enqueue(
    tenantId: string,
    queueName: string,
    payload: any,
    runAt?: Date
  ): Promise<string> {
    const runTime = runAt || new Date();

    if (!this.pool) {
      const mockId = Math.random().toString(36).substring(7);
      this.localQueue.push({
        id: mockId,
        tenantId,
        queueName,
        payload,
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        runAt: runTime,
      });
      return mockId;
    }

    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO public.aura_background_jobs (tenant_id, queue_name, payload, status, run_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, now(), now())
       RETURNING id`,
      [tenantId, queueName, JSON.stringify(payload), runTime]
    );

    return rows[0].id;
  }

  async pollAndProcess(
    queueName: string,
    processor: (payload: any, tenantId: string) => Promise<void>
  ): Promise<number> {
    if (!this.pool) {
      // Process in-memory queue
      const now = new Date();
      const pending = this.localQueue.filter(
        (job) => job.queueName === queueName && job.status === 'pending' && job.runAt <= now
      );

      for (const job of pending) {
        job.status = 'running';
        job.attempts++;
        try {
          await processor(job.payload, job.tenantId);
          job.status = 'completed';
        } catch (error: any) {
          job.errorMessage = error.message;
          if (job.attempts >= job.maxAttempts) {
            job.status = 'failed';
          } else {
            job.status = 'pending';
          }
        }
      }
      return pending.length;
    }

    // Fetch and lock the next eligible pending jobs
    const { rows } = await this.pool.query<BackgroundJob>(
      `UPDATE public.aura_background_jobs
          SET status = 'running',
              attempts = attempts + 1,
              updated_at = now()
        WHERE id IN (
          SELECT id 
            FROM public.aura_background_jobs
           WHERE queue_name = $1 
             AND status = 'pending' 
             AND run_at <= now()
           ORDER BY run_at ASC
             FOR UPDATE SKIP LOCKED
           LIMIT 10
        )
        RETURNING id, tenant_id as "tenantId", queue_name as "queueName", payload, status, attempts, max_attempts as "maxAttempts", run_at as "runAt"`,
      [queueName]
    );

    let processedCount = 0;

    for (const job of rows) {
      try {
        await processor(job.payload, job.tenantId);
        
        await this.pool.query(
          `UPDATE public.aura_background_jobs
              SET status = 'completed', updated_at = now()
            WHERE id = $1`,
          [job.id]
        );
        processedCount++;
      } catch (err: any) {
        this.logger.error(`Job ${job.id} failed: ${err.message}`);
        const status = job.attempts >= job.maxAttempts ? 'failed' : 'pending';
        
        await this.pool.query(
          `UPDATE public.aura_background_jobs
              SET status = $1, error_message = $2, updated_at = now()
            WHERE id = $3`,
          [status, err.message, job.id]
        );
      }
    }

    return processedCount;
  }
}
