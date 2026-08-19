import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuditService, CredentialsService, TenantContext, UsersService } from '@aura/core';
import { UsersAdminController } from './users-admin.controller';
import type { WorkspaceConfigService } from '../workspace/workspace-config.service';

/**
 * Setting another account's password is the step that was missing after the credential rebuild:
 * sign-in requires a registered identity WITH a credential, and nothing but the dev bootstrap
 * could create one — so an invited user could never actually get in.
 */
function build(registered: string[] = ['u-new']) {
  const setPassword = vi.fn(async () => undefined);
  const log = vi.fn(async () => undefined);
  const controller = new UsersAdminController(
    { get: (_t: string, id: string) => (registered.includes(id) ? { userId: id } : null) } as unknown as UsersService,
    {} as unknown as WorkspaceConfigService,
    { get: () => ({ tenantId: 'dev-tenant', companyId: null, actorId: 'u-admin' }) } as unknown as TenantContext,
    { log } as unknown as AuditService,
    { setPassword } as unknown as CredentialsService,
  );
  return { controller, setPassword, log };
}

describe('UsersAdminController — set another account password', () => {
  it('sets the credential and forces a change by default', async () => {
    const { controller, setPassword } = build();
    const result = await controller.setPassword('u-new', { password: 'a-long-enough-secret' });
    expect(setPassword).toHaveBeenCalledWith('dev-tenant', 'u-new', 'a-long-enough-secret', { mustChange: true });
    expect(result).toEqual({ userId: 'u-new', mustChange: true });
  });

  it('lets a caller opt out of the forced change explicitly', async () => {
    const { controller, setPassword } = build();
    await controller.setPassword('u-new', { password: 'a-long-enough-secret', mustChange: false });
    expect(setPassword).toHaveBeenCalledWith('dev-tenant', 'u-new', 'a-long-enough-secret', { mustChange: false });
  });

  it('refuses an account that is not registered — a credential without an identity is not a user', async () => {
    const { controller, setPassword } = build([]);
    await expect(controller.setPassword('u-ghost', { password: 'a-long-enough-secret' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('turns a rejected password into a 400 carrying the policy reason', async () => {
    const { controller } = build();
    const failing = new UsersAdminController(
      { get: () => ({ userId: 'u-new' }) } as unknown as UsersService,
      {} as unknown as WorkspaceConfigService,
      { get: () => ({ tenantId: 'dev-tenant', companyId: null, actorId: 'u-admin' }) } as unknown as TenantContext,
      { log: vi.fn() } as unknown as AuditService,
      { setPassword: vi.fn(async () => { throw new Error('password must be at least 12 characters'); }) } as unknown as CredentialsService,
    );
    await expect(failing.setPassword('u-new', { password: 'short' })).rejects.toThrow(/at least 12 characters/);
    await expect(failing.setPassword('u-new', { password: 'short' })).rejects.toBeInstanceOf(BadRequestException);
    expect(controller).toBeDefined();
  });

  it('never writes the password into the audit trail', async () => {
    const { controller, log } = build();
    await controller.setPassword('u-new', { password: 'a-long-enough-secret' });
    const payload = JSON.stringify(log.mock.calls[0]);
    expect(payload).not.toContain('a-long-enough-secret');
    expect(payload).toContain('password.set');
  });
});
