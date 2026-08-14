import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard, derivePermissionFromRoute } from './permissions.guard';
import { AccessService } from './access.service';
import type { AuthService } from './auth.service';
import { TenantContext } from '../tenancy/tenant-context';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { AccessDeniedError } from '@aura/shared';

// Auth ON — the guard enforces. (When OFF it pass-throughs; see the dedicated test.)
const authOn = { enabled: true } as unknown as AuthService;

/** An http ExecutionContext whose class/handler carry real `path` metadata. */
function httpContext(
  method: string,
  ctrlPath: string,
  handlerPath: string,
  req: { params?: Record<string, unknown>; body?: Record<string, unknown>; query?: Record<string, unknown> } = {},
): ExecutionContext {
  class Ctrl {}
  const handler = () => undefined;
  Reflect.defineMetadata('path', ctrlPath, Ctrl);
  Reflect.defineMetadata('path', handlerPath, handler);
  return {
    getHandler: () => handler,
    getClass: () => Ctrl,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method, ...req }) }),
  } as unknown as ExecutionContext;
}

describe('derivePermissionFromRoute (gap #7 — taxonomy coverage)', () => {
  it('derives module.entity.action for CRUD routes', () => {
    expect(derivePermissionFromRoute('POST', 'crm/accounts', '')).toBe('crm.account.create');
    expect(derivePermissionFromRoute('GET', 'crm/accounts', 'paged')).toBe('crm.account.read');
    expect(derivePermissionFromRoute('PATCH', 'crm/accounts', ':id')).toBe('crm.account.update');
    expect(derivePermissionFromRoute('DELETE', 'admin/settings', '')).toBe('admin.setting.delete');
  });

  it('takes the trailing verb for mutating action routes', () => {
    expect(derivePermissionFromRoute('POST', 'finance', 'invoices/:id/approve')).toBe('finance.invoice.approve');
    expect(derivePermissionFromRoute('PUT', 'site', 'instructions/:id/close')).toBe('site.instruction.close');
  });

  it('keeps read for GET sub-routes and strips .csv', () => {
    expect(derivePermissionFromRoute('GET', 'finance', 'invoices/aging.csv')).toBe('finance.invoice.read');
    expect(derivePermissionFromRoute('GET', 'audit', 'export.csv')).toBe('audit.export.read');
  });

  it('exempts public/infra modules', () => {
    expect(derivePermissionFromRoute('GET', 'health', '')).toBeNull();
    expect(derivePermissionFromRoute('POST', 'auth', 'login')).toBeNull();
    expect(derivePermissionFromRoute('GET', 'metrics', '')).toBeNull();
  });
});

describe('PermissionsGuard', () => {
  it('derives and asserts a route permission when no decorator is present (auth on)', async () => {
    const mockReflector = { getAllAndOverride: vi.fn().mockReturnValue(null) } as unknown as Reflector;
    const mockAssert = vi.fn();
    const mockAccess = { assert: mockAssert } as unknown as AccessService;
    const mockTenant = { get: () => ({ tenantId: 't1', companyId: null, actorId: 'u1' }) } as unknown as TenantContext;

    const guard = new PermissionsGuard(mockReflector, mockAccess, mockTenant, authOn);
    await expect(guard.canActivate(httpContext('POST', 'crm/accounts', ''))).resolves.toBe(true);
    expect(mockAssert).toHaveBeenCalledWith('u1', expect.objectContaining({ permission: 'crm.account.create' }));
  });

  it('allows undecorated exempt routes (health) even with auth on', async () => {
    const mockReflector = { getAllAndOverride: vi.fn().mockReturnValue(null) } as unknown as Reflector;
    const mockAccess = { assert: vi.fn(() => { throw new Error('should not assert'); }) } as unknown as AccessService;
    const mockTenant = { get: () => ({ tenantId: 't1', companyId: null, actorId: null }) } as unknown as TenantContext;

    const guard = new PermissionsGuard(mockReflector, mockAccess, mockTenant, authOn);
    await expect(guard.canActivate(httpContext('GET', 'health', ''))).resolves.toBe(true);
  });

  it('asserts and allows access when permissions are satisfied', async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['po.create']),
    } as unknown as Reflector;

    const mockAssert = vi.fn();
    const mockAccess = {
      assert: mockAssert,
    } as unknown as AccessService;

    const mockTenant = {
      get: () => ({ tenantId: 't1', companyId: 'c1', actorId: 'u1' }),
    } as unknown as TenantContext;

    const guard = new PermissionsGuard(mockReflector, mockAccess, mockTenant, authOn);
    const mockContext = httpContext('POST', 'po', '');

    const allowed = await guard.canActivate(mockContext);
    expect(allowed).toBe(true);
    expect(mockAssert).toHaveBeenCalledWith('u1', {
      permission: 'po.create',
      orgPath: [
        { level: 'tenant', id: 't1' },
        { level: 'company', id: 'c1' },
      ],
    });
  });

  it('throws ForbiddenException when assert throws AccessDeniedError', async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['po.create']),
    } as unknown as Reflector;

    const mockAssert = vi.fn().mockImplementation(() => {
      throw new AccessDeniedError('Missing po.create permission');
    });
    const mockAccess = {
      assert: mockAssert,
    } as unknown as AccessService;

    const mockTenant = {
      get: () => ({ tenantId: 't1', companyId: null, actorId: 'u1' }),
    } as unknown as TenantContext;

    const guard = new PermissionsGuard(mockReflector, mockAccess, mockTenant, authOn);
    const mockContext = httpContext('POST', 'po', '');

    await expect(guard.canActivate(mockContext)).rejects.toThrow('Missing po.create permission');
  });

  // ── Project scope (Project Delivery Workspace, slice P2) ─────────────────────────────────────
  const tenantU1 = { get: () => ({ tenantId: 't1', companyId: null, actorId: 'u1' }) } as unknown as TenantContext;
  const noDeco = { getAllAndOverride: vi.fn().mockReturnValue(null) } as unknown as Reflector;

  it('stamps the touched project onto the target on a project-scoped module (body/query/param)', async () => {
    const cases: Array<[string, string, string, Record<string, unknown>]> = [
      ['POST', 'site', 'daily-reports', { body: { projectId: 'PA' } }],
      ['GET', 'site', 'daily-reports', { query: { projectId: 'PA' } }],
      ['GET', 'projects', ':projectId/members', { params: { projectId: 'PA' } }],
    ];
    for (const [method, ctrl, handler, req] of cases) {
      const assert = vi.fn();
      const guard = new PermissionsGuard(noDeco, { assert } as unknown as AccessService, tenantU1, authOn);
      await guard.canActivate(httpContext(method, ctrl, handler, req));
      expect(assert).toHaveBeenCalledWith('u1', expect.objectContaining({ resource: { type: 'project', id: 'PA' } }));
    }
  });

  it('does NOT stamp a resource off a project-scoped module, or when no project is in the request', async () => {
    for (const [ctrl, req] of [
      ['crm', { body: { projectId: 'PA' } }], // crm is not project-scoped
      ['site', {}], //                           project-scoped but no projectId anywhere
    ] as Array<[string, Record<string, unknown>]>) {
      const assert = vi.fn();
      const guard = new PermissionsGuard(noDeco, { assert } as unknown as AccessService, tenantU1, authOn);
      await guard.canActivate(httpContext('POST', ctrl, 'accounts', req));
      expect(assert).toHaveBeenCalledWith('u1', expect.not.objectContaining({ resource: expect.anything() }));
    }
  });

  it('a project-scoped grant authorises its own project and is refused on another (real AccessService)', async () => {
    const access = new AccessService();
    access.registerRole({ id: 'r-site', name: 'Site Engineer', permissions: ['site.daily-report.create'] });
    access.grant({ userId: 'eng', roleId: 'r-site', scope: { kind: 'resource', resourceType: 'project', resourceId: 'PA' } });
    const tenantEng = { get: () => ({ tenantId: 't1', companyId: null, actorId: 'eng' }) } as unknown as TenantContext;
    const guard = new PermissionsGuard(noDeco, access, tenantEng, authOn);

    // own project → allowed
    await expect(guard.canActivate(httpContext('POST', 'site', 'daily-reports', { body: { projectId: 'PA' } }))).resolves.toBe(true);
    // a different project → refused (their grant does not reach it, and they hold no org grant)
    await expect(guard.canActivate(httpContext('POST', 'site', 'daily-reports', { body: { projectId: 'PB' } }))).rejects.toThrow(/Access denied/);
  });

  it('an org/tenant grant is unaffected by project scope — authorises every project', async () => {
    const access = new AccessService();
    access.registerRole({ id: 'r-admin', name: 'Admin', permissions: ['*'] });
    access.grant({ userId: 'boss', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: 't1' } });
    const tenantBoss = { get: () => ({ tenantId: 't1', companyId: null, actorId: 'boss' }) } as unknown as TenantContext;
    const guard = new PermissionsGuard(noDeco, access, tenantBoss, authOn);

    for (const pid of ['PA', 'PB']) {
      await expect(guard.canActivate(httpContext('POST', 'site', 'daily-reports', { body: { projectId: pid } }))).resolves.toBe(true);
    }
  });

  it('passes through when auth is OFF, even with a null actor (staged pass-through)', async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['procurement.po.approve']),
    } as unknown as Reflector;
    // assert must never be reached while auth is off.
    const mockAccess = { assert: vi.fn(() => { throw new Error('should not assert'); }) } as unknown as AccessService;
    const mockTenant = { get: () => ({ tenantId: 't1', companyId: null, actorId: null }) } as unknown as TenantContext;
    const authOff = { enabled: false } as unknown as AuthService;

    const guard = new PermissionsGuard(mockReflector, mockAccess, mockTenant, authOff);
    const mockContext = { getHandler: vi.fn(), getClass: vi.fn() } as unknown as ExecutionContext;

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
  });
});
