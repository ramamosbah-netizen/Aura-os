import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { WebhookSubscription } from '@aura/shared';
import { TenantContext, type WebhookDelivery, WebhookService } from '@aura/core';

interface RegisterWebhookDto {
  url: string;
  eventTypes: string[];
  secret?: string;
}

/**
 * Phase-0 proof of the Integration skeleton: register an outbound webhook, then any
 * matching event on the spine is POSTed to it (signed) by the WebhookDispatcher.
 * GET /deliveries shows the audit log.
 */
@Controller('integration/webhooks')
export class IntegrationController {
  constructor(
    private readonly webhooks: WebhookService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  register(@Body() dto: RegisterWebhookDto): Promise<WebhookSubscription> {
    const ctx = this.tenant.get();
    return this.webhooks.register({
      tenantId: ctx.tenantId,
      url: dto.url,
      eventTypes: dto.eventTypes,
      secret: dto.secret,
    });
  }

  @Get()
  list(): Promise<WebhookSubscription[]> {
    return this.webhooks.listSubscriptions(this.tenant.get().tenantId);
  }

  @Get('deliveries')
  deliveries(@Query('subscriptionId') subscriptionId?: string): Promise<WebhookDelivery[]> {
    return this.webhooks.listDeliveries(subscriptionId, 50);
  }
}
