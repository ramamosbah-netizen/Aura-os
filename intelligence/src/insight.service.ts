import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { AiService, EVENT_STORE, type EventStore } from '@aura/core';
import { PipelineProjection } from './pipeline-projection';
import type { Funnel } from './pipeline';
import { INSIGHT_EVENT, buildBriefingPrompt } from './briefing';

export interface Briefing {
  text: string;
  provider: string;
  model: string;
  funnel: Funnel;
}

/**
 * Executive copilot — a read-only consumer that turns the deal-chain projection into a
 * natural-language briefing via the kernel AI seam (Claude when keyed, local echo
 * otherwise), then emits `intelligence.insight.generated` back onto the spine so the
 * insight is itself auditable + webhook-deliverable. It observes + proposes; it never
 * writes a business module's tables.
 */
@Injectable()
export class InsightService {
  private readonly logger = new Logger('Intelligence');

  constructor(
    private readonly projection: PipelineProjection,
    private readonly ai: AiService,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async generateBriefing(tenantId: Id, actorId: Id | null = null): Promise<Briefing> {
    const funnel = this.projection.snapshot(tenantId);
    const result = await this.ai.complete(buildBriefingPrompt(funnel));
    await this.events.append([
      makeEvent({
        type: INSIGHT_EVENT,
        tenantId,
        actorId,
        aggregateType: 'intelligence.insight',
        aggregateId: 'pipeline-briefing',
        payload: { provider: result.provider, model: result.model, funnel, text: result.text },
      }),
    ]);
    this.logger.log(`Insight generated for ${tenantId} via ${result.provider} (${result.model}).`);
    return { text: result.text, provider: result.provider, model: result.model, funnel };
  }
}
