import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard } from './permissions.guard';
import { AccessService } from './access.service';
import { TenantContext } from '../tenancy/tenant-context';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { AccessDeniedError } from '@aura/shared';

describe('PermissionsGuard', () => {
  it('allows access when no permissions are required', async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(null),
    } as unknown as Reflector;

    const mockAccess = {} as unknown as AccessService;
    const mockTenant = {} as unknown as TenantContext;

    const guard = new PermissionsGuard(mockReflector, mockAccess, mockTenant);
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
    } as unknown as ExecutionContext;

    const allowed = await guard.canActivate(mockContext);
    expect(allowed).toBe(true);
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

    const guard = new PermissionsGuard(mockReflector, mockAccess, mockTenant);
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

    const guard = new PermissionsGuard(mockReflector, mockAccess, mockTenant);
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(mockContext)).rejects.toThrow('Missing po.create permission');
  });
});
