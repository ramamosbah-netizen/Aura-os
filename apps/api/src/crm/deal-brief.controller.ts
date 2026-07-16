import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { AiService, TenantContext } from '@aura/core';
import {
  ActivityService,
  AccountService,
  OpportunityService,
  buildDealFacts,
  dealBriefPrompt,
  followUpEmailPrompt,
  meetingSummaryPrompt,
  lastActivityByRecord,
  nextOpenActivityByRecord,
  type AiPrompt,
  type DealFacts,
} from '@aura/crm';

// C8 (§9 AI) — advisory AI on a deal. Three rules hold this together:
//
// 1. **The facts are the product.** `GET .../brief` returns the deterministic fact pack whether or
//    not a model exists. The prose is an extra, and it is labelled as one.
// 2. **No model ⇒ no prose, never a fake one.** With no ANTHROPIC_API_KEY the kernel's AI provider
//    falls back to LocalProvider, which by design ECHOES the prompt back instead of calling a
//    model. Returning that as a "summary" would hand someone their own input dressed as analysis —
//    which is exactly the failure this whole slice is built to avoid. So when the provider is
//    `local`, `narrative` is null and `narrativeUnavailable` says why.
// 3. **Nothing is sent, scheduled or saved.** A draft is text in a response body. The human owns
//    every outbound action, per §9's advisory-only rule.

interface BriefResponse {
  facts: DealFacts;
  /** Model-written prose over those facts. Null when no model is configured. */
  narrative: string | null;
  /** Why there is no narrative, in words a user can act on. Null when there is one. */
  narrativeUnavailable: string | null;
  /** Which provider wrote it — so nobody has to guess whether a model was involved. */
  provider: string;
}

interface DraftResponse {
  draft: string;
  provider: string;
  /** Restated in the payload because a draft can be copied out of the UI and out of context. */
  advisory: true;
}

interface EmailDraftDto {
  intent?: string;
  recipientName?: string;
}

interface MeetingSummaryDto {
  notes?: string;
  opportunityId?: string;
}

const NO_MODEL =
  'No AI model is configured (ANTHROPIC_API_KEY is unset), so the platform is in local fallback ' +
  'mode and would only echo the prompt back. The facts above are complete and unaffected.';

@Controller('crm')
export class DealBriefController {
  constructor(
    private readonly opportunities: OpportunityService,
    private readonly activities: ActivityService,
    private readonly accounts: AccountService,
    private readonly ai: AiService,
    private readonly tenant: TenantContext,
  ) {}

  /** True when a real model is behind the seam. `local` is the key-less echo provider. */
  private get hasModel(): boolean {
    return this.ai.activeProvider !== 'local';
  }

  private async factsFor(id: string): Promise<DealFacts> {
    const tenantId = this.tenant.get().tenantId;
    const opportunity = await this.opportunities.get(id);
    if (!opportunity || opportunity.tenantId !== tenantId) {
      throw new NotFoundException(`opportunity ${id} not found`);
    }

    const activities = await this.activities.list({ tenantId, limit: 5000 });
    const mine = activities.filter((a) => a.relatedId === id);
    const next = nextOpenActivityByRecord(activities).get(id) ?? null;

    let accountName: string | null = null;
    if (!opportunity.accountName && opportunity.accountId) {
      // The deal's accountName is a snapshot that is only written when supplied; fall back to what
      // the account is called now rather than briefing someone about "acc-9f3e…".
      const account = await this.accounts.get(opportunity.accountId);
      accountName = account?.name ?? null;
    }

    return buildDealFacts({
      opportunity,
      lastTouchIso: lastActivityByRecord(activities).get(id) ?? null,
      nextAction: next ? { subject: next.subject, dueIso: next.dueIso } : null,
      activityCount: mine.length,
      accountName,
    });
  }

  private async prose(prompt: AiPrompt): Promise<string> {
    const result = await this.ai.complete({
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    });
    return result.text.trim();
  }

  @Get('opportunities/:id/brief')
  async brief(@Param('id') id: string): Promise<BriefResponse> {
    const facts = await this.factsFor(id);
    if (!this.hasModel) {
      return { facts, narrative: null, narrativeUnavailable: NO_MODEL, provider: this.ai.activeProvider };
    }
    return {
      facts,
      narrative: await this.prose(dealBriefPrompt(facts)),
      narrativeUnavailable: null,
      provider: this.ai.activeProvider,
    };
  }

  @Post('opportunities/:id/email-draft')
  async emailDraft(@Param('id') id: string, @Body() dto: EmailDraftDto): Promise<DraftResponse> {
    const facts = await this.factsFor(id);
    // A draft is prose or it is nothing — there is no factual fallback for "write me an email", so
    // this refuses rather than returning an echo of its own prompt.
    if (!this.hasModel) throw new BadRequestException(NO_MODEL);
    const draft = await this.prose(followUpEmailPrompt(facts, { intent: dto?.intent, recipientName: dto?.recipientName }));
    return { draft, provider: this.ai.activeProvider, advisory: true };
  }

  @Post('meeting-summary')
  async meetingSummary(@Body() dto: MeetingSummaryDto): Promise<DraftResponse> {
    const notes = dto?.notes?.trim();
    if (!notes) throw new BadRequestException('notes are required — there is nothing to summarise');
    if (!this.hasModel) throw new BadRequestException(NO_MODEL);
    const facts = dto.opportunityId ? await this.factsFor(dto.opportunityId) : null;
    const draft = await this.prose(meetingSummaryPrompt(notes, facts));
    return { draft, provider: this.ai.activeProvider, advisory: true };
  }
}
