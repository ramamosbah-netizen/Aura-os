import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessService } from './access.service';
import { TenantContext } from '../tenancy/tenant-context';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { type AccessTarget, type OrgLevel, type Id, AccessDeniedError } from '@aura/shared';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
    private readonly tenant: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { tenantId, companyId, actorId } = this.tenant.get();
    if (!actorId) {
      throw new ForbiddenException('Actor identity is missing from context.');
    }

    const orgPath: Array<{ level: OrgLevel; id: Id }> = [
      { level: 'tenant', id: tenantId },
    ];
    if (companyId) {
      orgPath.push({ level: 'company', id: companyId });
    }

    try {
      for (const permission of requiredPermissions) {
        const target: AccessTarget = {
          permission,
          orgPath,
        };
        this.access.assert(actorId, target);
      }
      return true;
    } catch (error: any) {
      if (error instanceof AccessDeniedError) {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }
}
