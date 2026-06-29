import { lexicalEmbedding, DEFAULT_EMBEDDING_DIMS } from '@aura/shared';

/**
 * Embedding seam, separate from the chat provider (embeddings are their own API). A real
 * neural provider is used when configured; otherwise the deterministic offline lexical
 * embedding. `AiService.embed()` selects one at boot and falls back to lexical on any
 * remote failure, so the kernel always produces a vector.
 */
export interface Embedder {
  readonly name: string;
  embed(text: string): Promise<number[]>;
}

/** Deterministic, offline, always-available embedder (feature-hashing). */
export class LexicalEmbedder implements Embedder {
  readonly name = 'lexical';
  embed(text: string): Promise<number[]> {
    return Promise.resolve(lexicalEmbedding(text));
  }
}

export interface RemoteEmbedderConfig {
  apiKey: string;
  /** OpenAI-compatible base, e.g. `https://api.openai.com/v1` or `https://api.voyageai.com/v1`. */
  baseUrl: string;
  /** Must emit `dims`-dimensional vectors (e.g. OpenAI `text-embedding-3-small` → 1536). */
  model: string;
  dims: number;
}

/**
 * Real neural embeddings via an OpenAI-compatible endpoint:
 * `POST {baseUrl}/embeddings` with `{ model, input }` → `{ data: [{ embedding }] }`
 * (the shape OpenAI and Voyage both speak). Throws on HTTP error, malformed response, or
 * a dimension mismatch with the pgvector column, so the caller can fall back to lexical.
 */
export class RemoteEmbedder implements Embedder {
  readonly name = 'remote';
  constructor(private readonly cfg: RemoteEmbedderConfig) {}

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.cfg.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({ model: this.cfg.model, input: text }),
    });
    if (!res.ok) throw new Error(`embeddings API HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ embedding?: unknown }> };
    const vec = json?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.some((n) => typeof n !== 'number')) {
      throw new Error('embeddings API: malformed response (no numeric embedding)');
    }
    if (vec.length !== this.cfg.dims) {
      throw new Error(
        `embeddings dim ${vec.length} != expected ${this.cfg.dims} (check EMBEDDINGS_MODEL / EMBEDDINGS_DIMS vs the pgvector column)`,
      );
    }
    return vec as number[];
  }
}

/**
 * Pick the embedder from the environment: a real neural provider when `EMBEDDINGS_API_KEY`
 * is set (OpenAI by default; point `EMBEDDINGS_BASE_URL` at Voyage etc.), else lexical.
 */
export function selectEmbedder(env: NodeJS.ProcessEnv = process.env): Embedder {
  const apiKey = env.EMBEDDINGS_API_KEY?.trim();
  if (!apiKey) return new LexicalEmbedder();
  return new RemoteEmbedder({
    apiKey,
    baseUrl: (env.EMBEDDINGS_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: env.EMBEDDINGS_MODEL?.trim() || 'text-embedding-3-small',
    dims: Number(env.EMBEDDINGS_DIMS?.trim()) || DEFAULT_EMBEDDING_DIMS,
  });
}
