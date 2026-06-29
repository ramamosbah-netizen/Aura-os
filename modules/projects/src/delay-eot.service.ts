import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  type DelayEvent, type NewDelayEvent, makeDelayEvent, type DelayStatus,
  type EotClaim, type NewEotClaim, makeEotClaim, type EotStatus,
  calculateDelayAnalysis, type DelayAnalysisSummary,
} from './domain/delay-eot';
import { DELAY_STORE, EOT_STORE, type DelayFilter, type DelayStore, type EotFilter, type EotStore } from './delay-eot-store';

@Injectable()
export class DelayEotService {
  private readonly logger = new Logger('DelayEotService');

  constructor(
    @Inject(DELAY_STORE) private readonly delays: DelayStore,
    @Inject(EOT_STORE) private readonly eotClaims: EotStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  // ── DELAY EVENTS ─────────────────────────────────────────────────────

  async createDelay(input: NewDelayEvent): Promise<DelayEvent> {
    const event = makeDelayEvent(input);
    await this.delays.create(event);
    this.logger.log(`Delay event created: ${event.title} (${event.causeCategory}, ${event.delayDays}d)`);

    await this.events.append([
      makeEvent({
        type: 'projects.delay.created',
        tenantId: event.tenantId,
        companyId: null,
        actorId: null,
        aggregateType: 'projects.delay',
        aggregateId: event.id,
        payload: { title: event.title, causeCategory: event.causeCategory, delayDays: event.delayDays },
      }),
    ]);

    return event;
  }

  async updateDelayStatus(id: Id, status: DelayStatus): Promise<DelayEvent> {
    const existing = await this.delays.get(id);
    if (!existing) throw new Error(`Delay event ${id} not found`);
    const updated: DelayEvent = { ...existing, status };
    await this.delays.update(updated);
    this.logger.log(`Delay event ${id} status → ${status}`);
    return updated;
  }

  async listDelays(filter?: DelayFilter): Promise<DelayEvent[]> {
    return this.delays.list(filter);
  }

  async getDelay(id: Id): Promise<DelayEvent | null> {
    return this.delays.get(id);
  }

  // ── EOT CLAIMS ───────────────────────────────────────────────────────

  async createEotClaim(input: NewEotClaim): Promise<EotClaim> {
    const claim = makeEotClaim(input);
    await this.eotClaims.create(claim);
    this.logger.log(`EOT Claim #${claim.claimNumber} created: ${claim.title} (${claim.submittedDays}d)`);

    await this.events.append([
      makeEvent({
        type: 'projects.eot.created',
        tenantId: claim.tenantId,
        companyId: null,
        actorId: null,
        aggregateType: 'projects.eot',
        aggregateId: claim.id,
        payload: { claimNumber: claim.claimNumber, submittedDays: claim.submittedDays },
      }),
    ]);

    return claim;
  }

  async submitEotClaim(id: Id): Promise<EotClaim> {
    const existing = await this.eotClaims.get(id);
    if (!existing) throw new Error(`EOT Claim ${id} not found`);
    if (existing.status !== 'draft') throw new Error(`EOT Claim ${id} is not in draft status`);

    const updated: EotClaim = {
      ...existing,
      status: 'submitted',
      submittedAt: new Date().toISOString(),
    };
    await this.eotClaims.update(updated);
    this.logger.log(`EOT Claim #${existing.claimNumber} submitted`);
    return updated;
  }

  async decideEotClaim(id: Id, decision: {
    status: 'approved' | 'partially_approved' | 'rejected';
    approvedDays: number;
    decidedBy: string;
    revisedCompletionDate?: string | null;
  }): Promise<EotClaim> {
    const existing = await this.eotClaims.get(id);
    if (!existing) throw new Error(`EOT Claim ${id} not found`);

    const updated: EotClaim = {
      ...existing,
      status: decision.status,
      approvedDays: decision.approvedDays,
      decidedAt: new Date().toISOString(),
      decidedBy: decision.decidedBy,
      revisedCompletionDate: decision.revisedCompletionDate ?? existing.revisedCompletionDate,
    };
    await this.eotClaims.update(updated);
    this.logger.log(`EOT Claim #${existing.claimNumber} decided: ${decision.status} (${decision.approvedDays}d approved)`);

    await this.events.append([
      makeEvent({
        type: 'projects.eot.decided',
        tenantId: updated.tenantId,
        companyId: null,
        actorId: decision.decidedBy,
        aggregateType: 'projects.eot',
        aggregateId: updated.id,
        payload: { status: decision.status, approvedDays: decision.approvedDays },
      }),
    ]);

    return updated;
  }

  async listEotClaims(filter?: EotFilter): Promise<EotClaim[]> {
    return this.eotClaims.list(filter);
  }

  async getEotClaim(id: Id): Promise<EotClaim | null> {
    return this.eotClaims.get(id);
  }

  // ── ANALYSIS ─────────────────────────────────────────────────────────

  async getDelayAnalysis(projectId: Id): Promise<DelayAnalysisSummary> {
    const [delays, eots] = await Promise.all([
      this.delays.list({ projectId }),
      this.eotClaims.list({ projectId }),
    ]);
    return calculateDelayAnalysis(delays, eots);
  }
}
