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
function httpContext(method: string, ctrlPath: string, handlerPath: string): ExecutionContext {
  class Ctrl {}
  const handler = () => undefined;
  Reflect.defineMetadata('path', ctrlPath, Ctrl);
  Reflect.defineMetadata('path', handlerPath, handler);
  return {
    getHandler: () => handler,
    getClass: () => Ctrl,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
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
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
    } as unknown as ExecutionContext;

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
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(mockContext)).rejects.toThrow('Missing po.create permission');
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
