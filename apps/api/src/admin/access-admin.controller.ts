import { BadRequestException, Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { AccessService, Permissions, TenantContext } from '@aura/core';
import type { Grant, Role } from '@aura/shared';

/**
 * Roles & Access admin (gap register Vol 23 #12 admin center + #7 roles UI). The read/write
 * surface behind the Roles screen — it manages the very roles/grants the global PermissionsGuard
 * enforces. Guarded by `admin.access.manage` (dogfoods the guard). Phase-1 store is the in-memory
 * AccessService (mutations live for the process; a Postgres-backed store swaps in behind the same
 * shape — see the AccessService note).
 */
@Controller('admin/access')
export class AccessAdminController {
  constructor(
    private readonly access: AccessService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('admin.access.manage')
  @Get()
  overview(): { roles: Role[]; grants: Grant[] } {
    return { roles: this.access.listRoles(), grants: this.access.listGrants() };
  }

  @Permissions('admin.access.manage')
  @Post('roles')
  createRole(@Body() dto: { id?: string; name?: string; permissions?: string[] }): Role {
    const id = dto?.id?.trim();
    const name = dto?.name?.trim();
    if (!id) throw new BadRequestException('id is required');
    if (!name) throw new BadRequestException('name is required');
    const permissions = Array.isArray(dto.permissions)
      ? dto.permissions.map((p) => String(p).trim()).filter(Boolean)
      : [];
    const role: Role = { id, name, permissions };
    this.access.registerRole(role);
    return role;
  }

  @Permissions('admin.access.manage')
  @Post('grants')
  grant(@Body() dto: { userId?: string; roleId?: string; tenantId?: string }): { ok: true } {
    const userId = dto?.userId?.trim();
    const roleId = dto?.roleId?.trim();
    if (!userId) throw new BadRequestException('userId is required');
    if (!roleId) throw new BadRequestException('roleId is required');
    if (!this.access.listRoles().some((r) => r.id === roleId)) {
      throw new BadRequestException(`unknown roleId: ${roleId}`);
    }
    const tenantId = dto?.tenantId?.trim() || this.tenant.get().tenantId;
    this.access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: tenantId } });
    return { ok: true };
  }

  @Permissions('admin.access.manage')
  @Delete('grants')
  revoke(@Query('userId') userId?: string, @Query('roleId') roleId?: string): { revoked: boolean } {
    if (!userId?.trim()) throw new BadRequestException('userId is required');
    if (!roleId?.trim()) throw new BadRequestException('roleId is required');
    return { revoked: this.access.revoke(userId.trim(), roleId.trim()) };
  }
}
