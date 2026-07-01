import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { TenantContext, type Notification, NotificationService } from '@aura/core';

/** Notification center — list the tenant's notifications + mark read. */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  list(@Query('unreadOnly') unreadOnly?: string): Promise<Notification[]> {
    return this.notifications.list({ tenantId: this.tenant.get().tenantId, unreadOnly: unreadOnly === 'true', limit: 100 });
  }

  @Get('unread-count')
  async unreadCount(): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(this.tenant.get().tenantId) };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string): Promise<{ id: string; read: true }> {
    await this.notifications.markRead(this.tenant.get().tenantId, id);
    return { id, read: true };
  }
}
