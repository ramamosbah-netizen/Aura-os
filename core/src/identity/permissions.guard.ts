import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessService } from './access.service';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { ModulesService } from '../config/modules.service';
import { TenantContext } from '../tenancy/tenant-context';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { type AccessTarget, type OrgLevel, type Id, AccessDeniedError } from '@aura/shared';

/** Modules whose routes stay outside the permission taxonomy (public / infra surfaces). */
const DERIVE_EXEMPT_MODULES = new Set(['health', 'auth', 'metrics']);

/**
 * Modules whose routes are scoped to a delivery PROJECT (Project Delivery Workspace, slice P2).
 * On these, when the touched project is knowable from the request, the guard stamps it onto the
 * AccessTarget as `resource: project:<id>`. That makes a project-scoped grant
 * (`resource:project:X`, the membership P1 writes) authorise action on project X and *only* X —
 * while an org/tenant grant still authorises everything (org grants match by `orgPath`, ignoring
 * the resource), so enterprise roles are entirely unaffected. Purely additive.
 */
const PROJECT_SCOPED_MODULES = new Set([
  'projects',
  'engineering',
  'site',
  'quality',
  'hse',
  'commissioning',
  'doccontrol',
]);

/**
 * The project a request acts on, when it is knowable WITHOUT loading the entity: an explicit
 * `:projectId` route param, or a `projectId` in the body (creates) or query (lists). Routes that
 * address an entity only by its own id (e.g. `site/daily-reports/:id`) do not expose the project
 * here; those stay governed by an org grant until a later slice resolves entity→project. Returns
 * a trimmed non-empty string or null.
 */
function pickProjectId(req: {
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): string | null {
  const candidate = req?.params?.projectId ?? req?.body?.projectId ?? req?.query?.projectId;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

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
    // Explicit @Inject: union types emit `Object` in design:paramtypes (see auth.service).
    @Optional() @Inject(UsersService) private readonly users: UsersService | null = null,
    @Optional() @Inject(ModulesService) private readonly modules: ModulesService | null = null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Module Manager gate (Admin Center): a disabled business module is 403 for every
    // request, independent of auth state — it's tenant configuration, not identity.
    if (this.modules && context.getType() === 'http') {
      const ctrl = ((Reflect.getMetadata('path', context.getClass()) as string) ?? '').replace(/^\/+/, '');
      const moduleId = ctrl.split('/')[0];
      if (moduleId && !this.modules.isEnabled(this.tenant.get().tenantId, moduleId)) {
        throw new ForbiddenException(`module '${moduleId}' is disabled for this tenant`);
      }
    }
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

    // Users registry (Vol 15 §2.2): a registered-and-deactivated user is refused on
    // every guarded request, token validity notwithstanding.
    //
    // `ensureTenant` loads this tenant once, then the check itself stays a sync in-memory
    // lookup on the hot path. The request already has its tenant bound, which is what makes
    // the read possible at all under fail-closed RLS — the old cross-tenant boot hydrate
    // returned nothing under the production role and silently degraded to "everyone active".
    if (this.users) await this.users.ensureTenant(tenantId);
    if (this.users && !this.users.isActive(tenantId, actorId)) {
      throw new ForbiddenException(`account ${actorId} is deactivated`);
    }

    const orgPath: Array<{ level: OrgLevel; id: Id }> = [
      { level: 'tenant', id: tenantId },
    ];
    if (companyId) {
      orgPath.push({ level: 'company', id: companyId });
    }

    // Project scope (P2): on a project-scoped module, stamp the touched project onto the target so a
    // project-scoped grant authorises it (and a grant for a *different* project does not). No project
    // in the request → no resource, and org/tenant grants still authorise via `orgPath`.
    let resource: AccessTarget['resource'];
    if (context.getType() === 'http') {
      const ctrlPath = ((Reflect.getMetadata('path', context.getClass()) as string) ?? '').replace(/^\/+/, '');
      const moduleId = ctrlPath.split('/')[0];
      if (PROJECT_SCOPED_MODULES.has(moduleId)) {
        const projectId = pickProjectId(context.switchToHttp().getRequest() ?? {});
        if (projectId) resource = { type: 'project', id: projectId };
      }
    }

    try {
      for (const permission of requiredPermissions) {
        const target: AccessTarget = {
          permission,
          orgPath,
          ...(resource ? { resource } : {}),
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
