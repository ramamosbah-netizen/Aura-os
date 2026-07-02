import { Controller, Get } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { InboxService, type InboxItem } from './inbox.service';

/** Universal inbox API — every pending decision across the platform, tenant-scoped. */
@Controller('inbox')
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  list(): Promise<InboxItem[]> {
    return this.inbox.list(this.tenant.get().tenantId);
  }
}
