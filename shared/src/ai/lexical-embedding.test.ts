import { describe, it, expect } from 'vitest';
import { lexicalEmbedding, DEFAULT_EMBEDDING_DIMS } from './ai-provider';

/** Cosine similarity of two L2-normalized vectors = their dot product. */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

describe('lexicalEmbedding (feature-hashing)', () => {
  it('produces a normalized vector of the pgvector dimension', () => {
    const v = lexicalEmbedding('goods receipt against purchase order');
    expect(v.length).toBe(DEFAULT_EMBEDDING_DIMS);
    // unit length (within rounding to 6 dp)
    expect(cosine(v, v)).toBeCloseTo(1, 3);
  });

  it('is deterministic for the same input', () => {
    expect(lexicalEmbedding('hello world')).toEqual(lexicalEmbedding('hello world'));
  });

  it('ranks shared-token overlap above unrelated text (the property the seed-fill lacked)', () => {
    const q = lexicalEmbedding('supplier invoice approved and paid against the purchase order');
    const related = lexicalEmbedding('the purchase order invoice was approved then paid to the supplier');
    const unrelated = lexicalEmbedding('site safety incident report with toolbox talk and permit to work');

    expect(cosine(q, related)).toBeGreaterThan(cosine(q, unrelated));
    expect(cosine(q, unrelated)).toBeLessThan(0.4);
  });

  it('returns a zero vector for empty text (no tokens)', () => {
    const v = lexicalEmbedding('');
    expect(v.length).toBe(DEFAULT_EMBEDDING_DIMS);
    expect(v.every((x) => x === 0)).toBe(true);
  });
});
