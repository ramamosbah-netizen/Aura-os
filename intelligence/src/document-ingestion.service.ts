import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AiService } from '@aura/core';
import { PG_POOL } from '@aura/core';
import type { Pool } from 'pg';

export interface IngestionDocumentInput {
  tenantId: string;
  documentTitle: string;
  documentType: 'boq' | 'tender_spec' | 'contract' | 'supplier_quote' | 'hse_report';
  rawTextContent: string;
  metadata?: Record<string, any>;
}

export interface IngestedChunk {
  chunkId: string;
  tenantId: string;
  documentTitle: string;
  chunkIndex: number;
  textSnippet: string;
  tokenCount: number;
  embedding: number[];
}

export interface IngestionJob {
  jobId: string;
  tenantId: string;
  documentTitle: string;
  documentType: IngestionDocumentInput['documentType'];
  status: 'queued' | 'extracting' | 'chunking' | 'embedding' | 'completed' | 'failed';
  totalChunks: number;
  processedChunks: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger('DocumentIngestionService');
  private readonly localVectorStore = new Map<string, IngestedChunk[]>();
  private readonly ingestionJobs = new Map<string, IngestionJob>();

  constructor(
    private readonly aiService: AiService,
    @Optional() @Inject(PG_POOL) private readonly pool?: Pool,
  ) {}

  /**
   * Enqueue a document for background vector RAG ingestion. Returns immediately with jobId.
   */
  async enqueueAsyncIngestion(input: IngestionDocumentInput): Promise<IngestionJob> {
    const jobId = `job-rag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const job: IngestionJob = {
      jobId,
      tenantId: input.tenantId,
      documentTitle: input.documentTitle,
      documentType: input.documentType,
      status: 'queued',
      totalChunks: 0,
      processedChunks: 0,
      createdAt: new Date(),
    };

    this.ingestionJobs.set(jobId, job);
    this.logger.log(`[DocumentIngestion] Enqueued async RAG job ${jobId} for "${input.documentTitle}"`);

    // Fire background processing asynchronously
    setTimeout(() => {
      this.processIngestionJob(jobId, input).catch((err) => {
        this.logger.error(`[DocumentIngestion] Background RAG job ${jobId} failed: ${err}`);
      });
    }, 10);

    return job;
  }

  /**
   * Query current status of a background ingestion job.
   */
  getIngestionJobStatus(jobId: string): IngestionJob | null {
    return this.ingestionJobs.get(jobId) || null;
  }

  private async processIngestionJob(jobId: string, input: IngestionDocumentInput): Promise<void> {
    const job = this.ingestionJobs.get(jobId);
    if (!job) return;

    try {
      job.status = 'extracting';
      const chunksText = this.chunkText(input.rawTextContent, 300, 50);

      job.status = 'chunking';
      job.totalChunks = chunksText.length;

      job.status = 'embedding';
      const result = await this.ingestDocument(input);

      job.processedChunks = result.totalChunks;
      job.status = 'completed';
      job.completedAt = new Date();
      this.logger.log(`[DocumentIngestion] Background RAG job ${jobId} completed successfully (${result.totalChunks} chunks).`);
    } catch (err: any) {
      job.status = 'failed';
      job.error = err.message || String(err);
      this.logger.error(`[DocumentIngestion] Background RAG job ${jobId} failed: ${job.error}`);
    }
  }

  /**
   * Parse, chunk, embed, and index a document into the RAG vector store.
   */
  async ingestDocument(input: IngestionDocumentInput): Promise<{ documentTitle: string; totalChunks: number; status: string }> {
    this.logger.log(`[DocumentIngestion] Starting ingestion for "${input.documentTitle}" (${input.documentType}, tenant: ${input.tenantId})`);

    // 1. Semantic Chunking (300-word overlapping windows)
    const chunksText = this.chunkText(input.rawTextContent, 300, 50);
    const ingestedChunks: IngestedChunk[] = [];

    for (let i = 0; i < chunksText.length; i++) {
      const textSnippet = chunksText[i]!;
      const embedding = await this.aiService.embed(textSnippet);
      const chunkId = `chk-${Math.random().toString(36).slice(2, 9)}`;

      const chunk: IngestedChunk = {
        chunkId,
        tenantId: input.tenantId,
        documentTitle: input.documentTitle,
        chunkIndex: i,
        textSnippet,
        tokenCount: Math.round(textSnippet.length / 4),
        embedding,
      };

      ingestedChunks.push(chunk);

      // Persist to DB if pool available
      if (this.pool) {
        await this.pool.query(
          `INSERT INTO public.aura_digital_twin_snapshots
             (tenant_id, entity_type, entity_id, snapshot_data)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, entity_type, entity_id)
           DO UPDATE SET snapshot_data = EXCLUDED.snapshot_data, captured_at = now()`,
          [
            input.tenantId,
            `rag_chunk_${input.documentType}`,
            chunkId,
            JSON.stringify({
              title: input.documentTitle,
              chunkIndex: i,
              snippet: textSnippet,
              metadata: input.metadata ?? {},
            }),
          ],
        ).catch((err) => this.logger.warn(`Failed DB persist for chunk ${chunkId}: ${err.message}`));
      }
    }

    this.localVectorStore.set(`${input.tenantId}:${input.documentTitle}`, ingestedChunks);
    this.logger.log(`[DocumentIngestion] Ingested ${ingestedChunks.length} semantic chunks for "${input.documentTitle}".`);

    return {
      documentTitle: input.documentTitle,
      totalChunks: ingestedChunks.length,
      status: 'indexed_successfully',
    };
  }

  /**
   * Simple word-window chunking with overlap.
   */
  private chunkText(text: string, chunkSizeWords: number, overlapWords: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];

    let start = 0;
    while (start < words.length) {
      const end = Math.min(start + chunkSizeWords, words.length);
      const chunk = words.slice(start, end).join(' ');
      if (chunk.trim()) chunks.push(chunk);
      start += chunkSizeWords - overlapWords;
    }

    return chunks.length > 0 ? chunks : [text];
  }
}
