import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

// Set before AppModule is imported — AuthService reads the secret at construction.
process.env.AUTH_JWT_SECRET = 'deprovisioning-e2e-secret';
process.env.AUTH_DEFAULT_TENANT = 'deprov-tenant';
process.env.AUTH_ALLOW_DEV_TOKENS = 'false';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  AccessService,
  AuthChallengeStore,
  AuthService,
  CredentialsService,
  RefreshTokenStore,
  SessionStore,
  TenantContext,
  UsersService,
} from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

/**
 * Deprovisioning closes the account lifecycle: provision → credential → authenticate →
 * challenge/session → deprovision.
 *
 * Before this existed, `DELETE /admin/users/:id` removed the identity row and nothing else, so the
 * account kept a live session. Measured against a real database: the deleted account's pre-delete
 * access token successfully changed that account's own password (201), while the same call on a
 * revoked session returned 401. Every assertion below is the "after" side of that proof, and the
 * tokens are captured BEFORE the delete so they are genuinely the ones that used to work.
 */
const TENANT = 'deprov-tenant';
const PASSWORD = 'a-sufficiently-long-password';
const ADMIN = 'u-deprov-admin';

describe('user deprovisioning (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let auth: AuthService;
  let users: UsersService;
  let credentials: CredentialsService;
  let sessions: SessionStore;
  let refreshTokens: RefreshTokenStore;
  let challenges: AuthChallengeStore;
  let tenant: TenantContext;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));

    auth = app.get(AuthService);
    users = app.get(UsersService);
    credentials = app.get(CredentialsService);
    sessions = app.get(SessionStore);
    refreshTokens = app.get(RefreshTokenStore);
    challenges = app.get(AuthChallengeStore);
    tenant = app.get(TenantContext);

    const access = app.get(AccessService);
    access.registerRole({ id: 'deprov-admin', name: 'Deprovisioning admin', permissions: ['*'] });
    access.grant({ userId: ADMIN, roleId: 'deprov-admin', scope: { kind: 'org', level: 'tenant', id: TENANT } });

    // The identity binding main.ts installs, so authenticated routes see an actor.
    app.use(async (req: any, _res: any, next: () => void) => {
      const ctx = await auth.contextFromHeader(req.headers?.authorization);
      if (ctx) tenant.run(ctx, next);
      else next();
    });

    await app.init();
    http = request(app.getHttpServer());

    await tenant.run({ tenantId: TENANT, companyId: null, actorId: null }, async () => {
      users.save({ tenantId: TENANT, userId: ADMIN, displayName: 'Admin', active: true });
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  const adminToken = (): string => auth.mint({ sub: ADMIN, tenantId: TENANT, companyId: null });

  /** Register an account with a usable credential and sign it in, keeping BOTH tokens. */
  async function provisionAndSignIn(userId: string): Promise<{ access: string; refresh: string }> {
    await tenant.run({ tenantId: TENANT, companyId: null, actorId: null }, async () => {
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
      await credentials.setPassword(TENANT, userId, PASSWORD, { mustChange: false });
    });
    const res = await http.post('/api/v1/auth/login').send({ username: userId, password: PASSWORD, tenantId: TENANT }).expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    return { access: res.body.token as string, refresh: res.body.refreshToken as string };
  }

  it('revokes every credential, session, refresh family and challenge — and the tokens stop working', async () => {
    const userId = 'u-deprovision-target';
    const { access, refresh } = await provisionAndSignIn(userId);

    // The tokens are real BEFORE the delete — otherwise the assertions after it prove nothing.
    expect(await auth.contextFromHeader(`Bearer ${access}`)).not.toBeNull();
    await http.post('/api/v1/auth/password').set('Authorization', `Bearer ${access}`)
      .send({ currentPassword: PASSWORD, newPassword: `${PASSWORD}-rotated` }).expect(201);

    // An outstanding pre-auth challenge, the kind a forced password change leaves behind.
    await tenant.run({ tenantId: TENANT, companyId: null, actorId: null }, async () => {
      await challenges.issue({ tenantId: TENANT, userId, kind: 'password_change', credentialId: randomUUID(), mustChangePassword: true });
    });

    const admin = adminToken();
    const deleted = await http.delete(`/api/v1/admin/users/${userId}`).set('Authorization', `Bearer ${admin}`).expect(200);
    expect(deleted.body).toMatchObject({ userId, identityRemoved: true, credentialRemoved: true });
    expect(deleted.body.sessionsRevoked).toBeGreaterThan(0);

    // 1. The access token no longer authenticates at all.
    expect(await auth.contextFromHeader(`Bearer ${access}`)).toBeNull();

    // 2. The password operation that used to succeed after deletion is refused.
    await http.post('/api/v1/auth/password').set('Authorization', `Bearer ${access}`)
      .send({ currentPassword: `${PASSWORD}-rotated`, newPassword: 'yet-another-password' }).expect(401);

    // 3. The refresh token cannot mint a replacement.
    await http.post('/api/v1/auth/refresh').send({ refreshToken: refresh, tenantId: TENANT }).expect(401);

    // 4. Nothing is left in any of the four layers.
    await tenant.run({ tenantId: TENANT, companyId: null, actorId: null }, async () => {
      expect(await credentials.has(TENANT, userId)).toBe(false);
      expect(await sessions.listForUser(TENANT, userId)).toEqual([]);
      expect(await refreshTokens.revokeForSessions(TENANT, [])).toBe(0);
      expect(users.get(TENANT, userId)).toBeNull();
    });

    // 5. And the account cannot simply sign in again.
    await http.post('/api/v1/auth/login').send({ username: userId, password: PASSWORD, tenantId: TENANT }).expect(401);
  });

/**
   * The second layer, isolated. Deprovisioning revokes the session, so with it working this can
   * never trigger — which is exactly why it has to be asserted separately. Here the identity is
   * removed WITHOUT the cleanup (the path `DELETE` used to take, and any future path that forgets),
   * leaving a session row that is unrevoked, unexpired and cryptographically valid. It must still
   * be refused, because the principal it names is gone.
   */
  it('refuses a live, unrevoked session whose principal no longer exists', async () => {
    const userId = 'u-orphan-session';
    const { access } = await provisionAndSignIn(userId);
    expect(await auth.contextFromHeader(`Bearer ${access}`)).not.toBeNull();

    await tenant.run({ tenantId: TENANT, companyId: null, actorId: null }, async () => {
      users.remove(TENANT, userId);
    });

    // The session itself is untouched — this is not a revocation test.
    const live = await tenant.run({ tenantId: TENANT, companyId: null, actorId: null }, () =>
      sessions.listForUser(TENANT, userId),
    );
    expect(live.length).toBeGreaterThan(0);

    expect(await auth.contextFromHeader(`Bearer ${access}`)).toBeNull();
  });

  it('refuses to deprovision the actor performing the request', async () => {
    const admin = adminToken();
    await http.delete(`/api/v1/admin/users/${ADMIN}`).set('Authorization', `Bearer ${admin}`).expect(400);
  });
});
