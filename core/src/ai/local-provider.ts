import {
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
  localFallbackText,
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
    const embedding = new Array(1536).fill(0);
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed + text.charCodeAt(i)) % 1000003;
    }
    for (let i = 0; i < 1536; i++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      embedding[i] = (seed / 4294967296) * 2 - 1;
    }
    let sumSq = 0;
    for (let i = 0; i < 1536; i++) sumSq += embedding[i] * embedding[i];
    const norm = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < 1536; i++) embedding[i] = Number((embedding[i] / norm).toFixed(6));
    return embedding;
  }
}
