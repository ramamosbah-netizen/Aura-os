import { describe, expect, it, vi } from 'vitest';
import { VectorStoreService } from './vector-store.service';
import type { Pool } from 'pg';
import { LocalProvider } from '@aura/core';

describe('VectorStoreService', () => {
  it('correctly indexes and performs semantic search on documents', async () => {
    // In-memory documents db
    const dbDocs: any[] = [];
    const localProvider = new LocalProvider();

    const mockAiService = {
      embed: vi.fn(async (text: string) => localProvider.embed(text)),
    } as any;

    const mockPool = {
      query: vi.fn(async (sql: string, params: any[]) => {
        if (sql.includes('INSERT INTO')) {
          const [tenantId, content, metadata, embeddingStr] = params;
          const embedding = JSON.parse(embeddingStr.replace('::vector', ''));
          const doc = {
            id: `doc-${dbDocs.length + 1}`,
            tenant_id: tenantId,
            content,
            metadata: JSON.parse(metadata),
            embedding,
            created_at: new Date(),
          };
          dbDocs.push(doc);
          return { rows: [doc] };
        } else if (sql.includes('SELECT')) {
          const [tenantId, queryVectorStr, limit] = params;
          const queryVector = JSON.parse(queryVectorStr.replace('::vector', ''));

          // Compute cosine similarity: 1 - CosineDistance
          // CosineDistance = 1 - (A . B / (||A|| ||B||))
          // Since our embedder normalizes vectors, ||A|| = ||B|| = 1.
          // Therefore, CosineDistance = 1 - (A . B).
          // Similarity = A . B
          const matched = dbDocs
            .filter((d) => d.tenant_id === tenantId)
            .map((d) => {
              let dotProduct = 0;
              for (let i = 0; i < queryVector.length; i++) {
                dotProduct += queryVector[i] * d.embedding[i];
              }
              const similarity = dotProduct;
              return {
                id: d.id,
                tenant_id: d.tenant_id,
                content: d.content,
                metadata: d.metadata,
                created_at: d.created_at,
                similarity,
              };
            });

          // Sort by similarity descending (closest distance first)
          matched.sort((a, b) => b.similarity - a.similarity);
          const limited = matched.slice(0, limit);
          return { rows: limited };
        }
        return { rows: [] };
      }),
    } as unknown as Pool;

    const service = new VectorStoreService(mockPool, mockAiService);

    // 1. Add documents
    await service.addDocument('tenant-1', 'Site Mobilization & Temp Facilities', { category: 'site' });
    await service.addDocument('tenant-1', 'Shoring wall system installation', { category: 'structural' });
    await service.addDocument('tenant-1', 'C35 Concrete in foundations', { category: 'structural' });

    // 2. Perform search
    // Exact match search
    const exactResults = await service.semanticSearch('tenant-1', 'C35 Concrete in foundations', 1, 0.9);
    expect(exactResults).toHaveLength(1);
    expect(exactResults[0].content).toBe('C35 Concrete in foundations');
    expect(exactResults[0].similarity).toBeCloseTo(1.0, 5);

    // Broad search with negative similarity threshold to return nearest items
    const results = await service.semanticSearch('tenant-1', 'C35 Concrete foundations', 2, -1.0);

    expect(results).toHaveLength(2);
    expect(results[0].metadata.category).toBeDefined();
  });
});
