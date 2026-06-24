import { Injectable, Logger } from '@nestjs/common';
import {
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
  DEFAULT_AI_MODEL,
  selectAiProviderName,
} from '@aura/shared';
import { ClaudeProvider } from './claude-provider';
import { LocalProvider } from './local-provider';

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

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.AI_DEFAULT_MODEL?.trim() || DEFAULT_AI_MODEL;
    if (selectAiProviderName(apiKey) === 'claude') {
      this.provider = new ClaudeProvider(apiKey!.trim(), model);
      this.logger.log(`AI provider: Claude (default model ${model}).`);
    } else {
      this.provider = new LocalProvider();
      this.logger.warn('No ANTHROPIC_API_KEY — AI provider in LOCAL fallback mode (no model calls).');
    }
  }

  complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    return this.provider.complete(req);
  }

  /** Which concrete provider is active: `claude` | `local`. */
  get activeProvider(): string {
    return this.provider.name;
  }
}
