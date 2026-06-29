import Anthropic from '@anthropic-ai/sdk';
import {
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
  buildClaudeMessageParams,
  lexicalEmbedding,
} from '@aura/shared';

/**
 * Claude provider — the kernel's default, via the official @anthropic-ai/sdk.
 * Sends NO sampling params (temperature/top_p/top_k): Opus 4.x rejects them with a
 * 400, so behavior is steered by the prompt. Built from the framework-free
 * `buildClaudeMessageParams` so the request rules stay unit-tested in @aura/shared.
 */
export class ClaudeProvider implements AiProvider {
  readonly name = 'claude';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly defaultModel: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const params = buildClaudeMessageParams(req, { model: this.defaultModel });
    const resp = await this.client.messages.create(
      params as Anthropic.MessageCreateParamsNonStreaming,
    );
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text,
      model: resp.model,
      provider: this.name,
      stopReason: resp.stop_reason ?? undefined,
      usage: {
        inputTokens: resp.usage.input_tokens,
        outputTokens: resp.usage.output_tokens,
      },
    };
  }

  /**
   * Embeddings use the deterministic local LEXICAL embedding (Anthropic exposes no
   * first-party embeddings endpoint via this SDK). Cosine reflects token overlap — good
   * enough for lexical RAG; wire a dedicated embeddings provider for semantic depth.
   */
  async embed(text: string): Promise<number[]> {
    return lexicalEmbedding(text);
  }
}
