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

@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger('DocumentIngestionService');
  private readonly localVectorStore = new Map<string, IngestedChunk[]>();

  constructor(
    private readonly aiService: AiService,
    @Optional() @Inject(PG_POOL) private readonly pool?: Pool,
  ) {}

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
