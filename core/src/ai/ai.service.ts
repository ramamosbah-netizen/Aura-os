import { Injectable, Logger } from '@nestjs/common';
import {
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
  DEFAULT_AI_MODEL,
  readSecret,
  selectAiProviderName,
  lexicalEmbedding,
} from '@aura/shared';
import { ClaudeProvider } from './claude-provider';
import { LocalProvider } from './local-provider';
import { type Embedder, selectEmbedder } from './embedder';

/**
 * The kernel AI seam. Every layer injects this and calls `complete()`; none talks to
 * a vendor SDK directly. The concrete provider is chosen at boot from the environment:
 * Claude when ANTHROPIC_API_KEY is set, the local fallback otherwise — so the API
 * always boots. Default model overridable via AI_DEFAULT_MODEL.
 *
 * Adding OpenAI / Gemini / Azure later = a new `AiProvider` impl + a branch here; no
 * consumer changes.
 */
@Injectable()
export class AiService implements AiProvider {
  readonly name = 'ai';
  private readonly logger = new Logger('AiService');
  private readonly provider: AiProvider;
  private readonly embedder: Embedder;

  constructor() {
    const apiKey = readSecret('ANTHROPIC_API_KEY') ?? undefined;
    const model = process.env.AI_DEFAULT_MODEL?.trim() || DEFAULT_AI_MODEL;
    if (selectAiProviderName(apiKey) === 'claude') {
      this.provider = new ClaudeProvider(apiKey!, model);
      this.logger.log(`AI provider: Claude (default model ${model}).`);
    } else {
      this.provider = new LocalProvider();
      this.logger.warn('No ANTHROPIC_API_KEY — AI provider in LOCAL fallback mode (no model calls).');
    }

    this.embedder = selectEmbedder(process.env);
    this.logger.log(
      this.embedder.name === 'remote'
        ? 'Embeddings: remote neural provider (EMBEDDINGS_API_KEY set).'
        : 'Embeddings: local lexical (set EMBEDDINGS_API_KEY for neural embeddings).',
    );
  }

  complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    return this.provider.complete(req);
  }

  /** Embed via the configured provider; fall back to the lexical embedding on remote failure. */
  async embed(text: string): Promise<number[]> {
    try {
      return await this.embedder.embed(text);
    } catch (err) {
      if (this.embedder.name === 'lexical') throw err;
      this.logger.warn(
        `Embeddings provider '${this.embedder.name}' failed (${(err as Error).message}); falling back to lexical.`,
      );
      return lexicalEmbedding(text);
    }
  }

  /** Which concrete chat provider is active: `claude` | `local`. */
  get activeProvider(): string {
    return this.provider.name;
  }

  /** Which embeddings provider is active: `remote` | `lexical`. */
  get embeddingsProvider(): string {
    return this.embedder.name;
  }
}
