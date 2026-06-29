import { describe, it, expect, vi, afterEach } from 'vitest';
import { DEFAULT_EMBEDDING_DIMS } from '@aura/shared';
import { selectEmbedder, RemoteEmbedder, LexicalEmbedder } from './embedder';
import { AiService } from './ai.service';

afterEach(() => vi.unstubAllGlobals());

describe('selectEmbedder', () => {
  it('uses lexical when no EMBEDDINGS_API_KEY', () => {
    expect(selectEmbedder({}).name).toBe('lexical');
  });
  it('uses the remote neural provider when EMBEDDINGS_API_KEY is set', () => {
    expect(selectEmbedder({ EMBEDDINGS_API_KEY: 'sk-x' }).name).toBe('remote');
  });
});

describe('LexicalEmbedder', () => {
  it('returns a vector of the pgvector dimension', async () => {
    expect((await new LexicalEmbedder().embed('hello world')).length).toBe(DEFAULT_EMBEDDING_DIMS);
  });
});

describe('RemoteEmbedder (OpenAI-compatible)', () => {
  const cfg = { apiKey: 'sk-x', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small', dims: 4 };

  it('POSTs {baseUrl}/embeddings and returns the embedding', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const vec = await new RemoteEmbedder(cfg).embed('hi');
    expect(vec).toEqual([0.1, 0.2, 0.3, 0.4]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer sk-x');
    expect(JSON.parse(init.body)).toEqual({ model: 'text-embedding-3-small', input: 'hi' });
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    await expect(new RemoteEmbedder(cfg).embed('hi')).rejects.toThrow('HTTP 401');
  });

  it('throws on dimension mismatch with the pgvector column', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ embedding: [1, 2] }] }) }));
    await expect(new RemoteEmbedder(cfg).embed('hi')).rejects.toThrow('dim 2 != expected 4');
  });
});

describe('AiService embeddings fallback', () => {
  const OLD_ENV = process.env;
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('falls back to lexical when the remote provider errors (still returns a vector)', async () => {
    process.env = { ...OLD_ENV, EMBEDDINGS_API_KEY: 'sk-x', ANTHROPIC_API_KEY: '' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

    const svc = new AiService();
    expect(svc.embeddingsProvider).toBe('remote');
    const vec = await svc.embed('hello');
    expect(vec.length).toBe(DEFAULT_EMBEDDING_DIMS); // lexical fallback, not a throw
  });
});
