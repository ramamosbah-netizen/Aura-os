import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { AuditService, Permissions, ServiceAccountsService, TenantContext, type ServiceAccount } from '@aura/core';

/**
 * Service accounts / API keys admin (Vol 15 §2.5). Machine credentials for external
 * integrations (the published @aura/sdk pairs with these): create returns the
 * `aura_sk_…` key EXACTLY ONCE — only its hash is stored. The account acts as
 * `sa:<id>` and is authorized through the same role grants as any user
 * (grant roles at /admin/access). Revocation takes effect on the next request.
 */
@Controller('admin/service-accounts')
export class ServiceAccountsAdminController {
  constructor(
    private readonly accounts: ServiceAccountsService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private auditLog(entityId: string, action: string, payload: Record<string, unknown>): void {
    const ctx = this.tenant.get();
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'service-account', entityId, action, payload);
  }

  @Permissions('admin.security.manage')
  @Get()
  list(): { accounts: ServiceAccount[] } {
    return { accounts: this.accounts.list(this.tenant.get().tenantId) };
  }

  /** Create — the response carries the key once; it can never be retrieved again. */
  @Permissions('admin.security.manage')
  @Post()
  create(@Body() dto: { name?: string }): { account: ServiceAccount; key: string; grantHint: string } {
    const name = dto?.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    const ctx = this.tenant.get();
    const { account, key } = this.accounts.create(ctx.tenantId, name, ctx.actorId ?? null);
    this.auditLog(account.id, 'created', { name: account.name });
    return {
      account,
      key,
      grantHint: `Grant roles to user id "sa:${account.id}" at /admin/access — the key has no permissions until you do.`,
    };
  }

  /** Revoke (deactivate) or reinstate a key. */
  @Permissions('admin.security.manage')
  @Post(':id/active')
  setActive(@Param('id') id: string, @Body() dto: { active?: boolean }): ServiceAccount {
    const active = dto?.active !== false;
    const account = this.accounts.setActive(this.tenant.get().tenantId, id, active);
    if (!account) throw new NotFoundException(`service account ${id} not found`);
    this.auditLog(id, active ? 'reinstated' : 'revoked', {});
    return account;
  }

  @Permissions('admin.security.manage')
  @Delete(':id')
  remove(@Param('id') id: string): { removed: boolean } {
    const removed = this.accounts.remove(this.tenant.get().tenantId, id);
    if (removed) this.auditLog(id, 'removed', {});
    return { removed };
  }
}
