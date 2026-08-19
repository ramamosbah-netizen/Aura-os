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

/**
 * The directory used to answer "active" for an account that had no password at all — the state
 * every invited user sits in. "Registered" and "can sign in" are different questions, and the
 * screen could only see the first one.
 */
describe('UsersAdminController — the directory reports whether an account can sign in', () => {
  const listing = (credential: Partial<Record<string, unknown>> | null, lockedUntil: Date | null = null) =>
    new UsersAdminController(
      { list: () => [{ tenantId: 'dev-tenant', userId: 'u-invited', displayName: '', email: '', companyId: null, active: true }] } as unknown as UsersService,
      { users: async () => [] } as unknown as WorkspaceConfigService,
      { get: () => ({ tenantId: 'dev-tenant', companyId: null, actorId: 'u-admin' }) } as unknown as TenantContext,
      { log: vi.fn() } as unknown as AuditService,
      { describe: async () => (credential ? { ...credential, lockedUntil } : null) } as unknown as CredentialsService,
    );

  it('says "none" for a registered account that has no credential yet', async () => {
    const { users } = await listing(null).list();
    expect(users[0]?.credential).toBe('none');
  });

  it('passes the stored status through for a usable credential', async () => {
    expect((await listing({ status: 'active' }).list()).users[0]?.credential).toBe('active');
    expect((await listing({ status: 'must_change' }).list()).users[0]?.credential).toBe('must_change');
    expect((await listing({ status: 'disabled' }).list()).users[0]?.credential).toBe('disabled');
  });

  it('derives "locked" from a lockout that has not expired', async () => {
    const future = new Date(Date.now() + 60_000);
    expect((await listing({ status: 'active' }, future).list()).users[0]?.credential).toBe('locked');
  });

  it('reads an EXPIRED lockout as usable again — a lockout is a moment, not a status', async () => {
    const past = new Date(Date.now() - 60_000);
    expect((await listing({ status: 'active' }, past).list()).users[0]?.credential).toBe('active');
  });
});
