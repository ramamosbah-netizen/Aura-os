import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiService, PG_POOL } from '@aura/core';
import type { Pool } from 'pg';

export interface VectorDocument {
  id: string;
  tenantId: string;
  content: string;
  metadata: Record<string, any>;
  createdAt: Date;
  similarity?: number;
}

@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger('Intelligence:VectorStore');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly aiService: AiService,
  ) {}

  /**
   * Generates embedding for the text content and saves it to aura_vector_store.
   */
  async addDocument(tenantId: string, content: string, metadata: Record<string, any> = {}): Promise<VectorDocument> {
    const embedding = await this.aiService.embed(content);
    const vectorStr = `[${embedding.join(',')}]`;

    const res = await this.pool.query(
      `INSERT INTO public.aura_vector_store (tenant_id, content, metadata, embedding)
       VALUES ($1, $2, $3, $4::vector)
       RETURNING id, tenant_id, content, metadata, created_at`,
      [tenantId, content, JSON.stringify(metadata), vectorStr]
    );

    const row = res.rows[0];
    this.logger.log(`Indexed document ${row.id} for tenant ${tenantId} (embedding dims: ${embedding.length})`);

    return {
      id: row.id,
      tenantId: row.tenant_id,
      content: row.content,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Performs semantic search using pgvector cosine distance operator (<=>).
   * Returns top matching documents sorted by similarity descending.
   */
  async semanticSearch(
    tenantId: string,
    queryText: string,
    limit = 5,
    minSimilarity = 0.3,
  ): Promise<VectorDocument[]> {
    const embedding = await this.aiService.embed(queryText);
    const vectorStr = `[${embedding.join(',')}]`;

    const res = await this.pool.query(
      `SELECT id, tenant_id, content, metadata, created_at,
              (1 - (embedding <=> $2::vector)) AS similarity
       FROM public.aura_vector_store
       WHERE tenant_id = $1
       ORDER BY embedding <=> $2::vector ASC
       LIMIT $3`,
      [tenantId, vectorStr, limit]
    );

    const docs = res.rows
      .map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        content: row.content,
        metadata: row.metadata,
        createdAt: new Date(row.created_at),
        similarity: Number(row.similarity),
      }))
      .filter((doc) => doc.similarity >= minSimilarity);

    this.logger.log(`Semantic search for "${queryText}" matched ${docs.length} documents above threshold ${minSimilarity}`);
    return docs;
  }
}
