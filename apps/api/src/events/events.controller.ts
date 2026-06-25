import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { type DomainEvent, makeEvent } from '@aura/shared';
import { type DeadLetteredEvent, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';

interface EmitDto {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
}

/**
 * Phase-0 proof of the event spine: POST /api/events appends a DomainEvent to the
 * store, which relays it to the bus → SampleEventSubscriber logs it. GET lists them.
 * Real modules will emit from their own services, never from a generic controller.
 */
@Controller('events')
export class EventsController {
  constructor(
    @Inject(EVENT_STORE) private readonly store: EventStore,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  async emit(@Body() dto: EmitDto): Promise<DomainEvent> {
    const ctx = this.tenant.get();
    const event = makeEvent({
      type: dto.type,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      actorId: ctx.actorId,
      aggregateType: dto.aggregateType,
      aggregateId: dto.aggregateId,
      payload: dto.payload ?? {},
    });
    await this.store.append([event]);
    return event;
  }

  @Get()
  list(@Query('type') type?: string): Promise<DomainEvent[]> {
    return this.store.list({ type, limit: 100 });
  }

  /** Events the relay gave up on (dead-lettered after the retry cap) — ops visibility. */
  @Get('dead-letters')
  deadLetters(): Promise<DeadLetteredEvent[]> {
    return this.store.listDeadLettered(50);
  }
}
