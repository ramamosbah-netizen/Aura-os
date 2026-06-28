import {
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
  localFallbackText,
  lexicalEmbedding,
} from '@aura/shared';

/**
 * Deterministic, network-free fallback used when no model key is configured — so
 * the kernel (and anything that depends on AI) still boots and runs in dev / CI.
 * It echoes the input rather than calling a model.
 */
export class LocalProvider implements AiProvider {
  readonly name = 'local';

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    return {
      text: localFallbackText(req.messages),
      model: 'local',
      provider: this.name,
      stopReason: 'end_turn',
    };
  }

  async embed(text: string): Promise<number[]> {
    return lexicalEmbedding(text);
  }
}
