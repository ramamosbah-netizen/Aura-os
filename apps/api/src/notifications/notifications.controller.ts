import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { TenantContext, type Notification, NotificationService } from '@aura/core';

const DEV_USER = process.env.WORKSPACE_DEV_USER ?? 'u-admin';

/** Notification center — list the tenant's notifications + mark read. */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  list(@Query('unreadOnly') unreadOnly?: string): Promise<Notification[]> {
    const ctx = this.tenant.get();
    return this.notifications.list({ tenantId: ctx.tenantId, userId: ctx.actorId ?? DEV_USER, unreadOnly: unreadOnly === 'true', limit: 100 });
  }

  @Get('unread-count')
  async unreadCount(): Promise<{ count: number }> {
    const ctx = this.tenant.get();
    return { count: await this.notifications.unreadCount(ctx.tenantId, ctx.actorId ?? DEV_USER) };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string): Promise<{ id: string; read: true }> {
    const ctx = this.tenant.get();
    await this.notifications.markRead(ctx.tenantId, id, ctx.actorId ?? DEV_USER);
    return { id, read: true };
  }
}
