import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessService } from './access.service';
import { AuthService } from './auth.service';
import { TenantContext } from '../tenancy/tenant-context';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { type AccessTarget, type OrgLevel, type Id, AccessDeniedError } from '@aura/shared';

/** Modules whose routes stay outside the permission taxonomy (public / infra surfaces). */
const DERIVE_EXEMPT_MODULES = new Set(['health', 'auth', 'metrics']);

const METHOD_ACTION: Record<string, string> = {
  GET: 'read',
  HEAD: 'read',
  OPTIONS: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/** Naive singular for route nouns: `accounts`→`account`, `policies`→`policy`. */
function singular(seg: string): string {
  if (seg.endsWith('ies')) return `${seg.slice(0, -3)}y`;
  if (seg.endsWith('s') && !seg.endsWith('ss')) return seg.slice(0, -1);
  return seg;
}

/**
 * Derive the default `module.entity.action` permission for a route (gap register Vol 23 #7).
 * Built from the declared @Controller/@Get paths — deterministic, no URL parsing:
 *   POST crm/accounts                 → crm.account.create
 *   PATCH crm/accounts/:id            → crm.account.update
 *   POST finance invoices/:id/approve → finance.invoice.approve
 *   GET  site delay-logs/paged        → site.delay-log.read
 * An explicit @Permissions decorator always overrides. Returns null for exempt modules
 * (health/auth/metrics) and non-HTTP contexts, which stay unguarded.
 */
export function derivePermissionFromRoute(
  method: string,
  controllerPath: string,
  handlerPath: string,
): string | null {
  const segs = `${controllerPath}/${handlerPath}`
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && s !== '/' && !s.startsWith(':'))
    .map((s) => s.replace(/\.csv$/, '').toLowerCase());
  if (segs.length === 0) return null;

  const module = segs[0];
  if (DERIVE_EXEMPT_MODULES.has(module)) return null;

  const entity = singular(segs[1] ?? module);
  const base = METHOD_ACTION[method.toUpperCase()] ?? 'read';

  // Mutating verb routes (POST invoices/:id/approve) take the trailing static verb as action.
  const tail = segs[segs.length - 1];
  const action =
    (base === 'create' || base === 'update') && segs.length > 2 && tail !== segs[1] ? tail : base;

  return `${module}.${entity}.${action}`;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
    private readonly tenant: TenantContext,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Staged pass-through: when auth is OFF (no verifier configured — the dev default) the
    // whole access seam passes through, so requests run as the dev actor (actorId null).
    // The permission guard mirrors that: annotations become no-ops until auth is turned on,
    // exactly like the AI/DB/auth seams. Enforcement engages the moment a verifier is set.
    if (!this.auth.enabled) {
      return true;
    }

    let requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No explicit @Permissions → derive the taxonomy default from the route itself, so the
    // whole surface (~600 handlers) is covered without hand-annotating each one (#7).
    if (!requiredPermissions || requiredPermissions.length === 0) {
      if (context.getType() !== 'http') return true;
      const method: string = context.switchToHttp().getRequest()?.method ?? 'GET';
      const ctrlPath = (Reflect.getMetadata('path', context.getClass()) as string) ?? '';
      const handlerPath = (Reflect.getMetadata('path', context.getHandler()) as string) ?? '';
      const derived = derivePermissionFromRoute(method, ctrlPath, handlerPath);
      if (!derived) return true;
      requiredPermissions = [derived];
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
