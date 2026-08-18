// AURA OS — authentication security boundary (S1 of the auth rebuild), over real HTTP.
//
// These are REGRESSION tests for a live auth bypass, not coverage. Before this slice:
//
//   * `POST /auth/login` compared the submitted password to a single deployment-wide
//     `AUTH_DEV_PASSWORD` and accepted ANY password when that var was unset;
//   * `username` defaulted to `u-admin`, so `POST /auth/login {}` minted a token for the
//     wildcard platform admin;
//   * `isActive()` answers `true` for ids it has never seen, so an invented username
//     authenticated;
//   * `POST /auth/mfa/enroll { account }` was unauthenticated, so anyone could enrol — and
//     then activate, holding the secret they were just handed — MFA on someone else's
//     account and lock them out of it.
//
// Every test below fails against that code. The suite is the definition of done for S1: not
// "the new login works" but "the old bypasses are impossible".
//
// The most important assertion here is not a status code. Unknown user, inactive user, wrong
// password, disabled credential and locked credential must return the IDENTICAL response
// body — same status, same `error`, same `message`. A differing message is as good an
// account-enumeration oracle as a 404 would be.
import 'reflect-metadata';

// Must be set before AppModule is imported: AuthService reads the secret at construction and
// PermissionsGuard short-circuits whenever no verifier is configured.
process.env.AUTH_JWT_SECRET = 'e2e-auth-security-secret';
process.env.AUTH_DEFAULT_TENANT = 'sec-tenant';
// Deliberately NOT set: the point is that a deployment with a verifier but no dev password
// must refuse every login rather than accept every password.
delete process.env.AUTH_DEV_PASSWORD;
delete process.env.AUTH_ALLOW_DEV_TOKENS;

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthService, CredentialsService, MfaService, TenantContext, UsersService } from '@aura/core';
import { totpCodeAt } from '@aura/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

const TENANT = 'sec-tenant';
const PASSWORD = 'correct-horse-battery';

/** Registered, active, has a password. The only account that should ever authenticate. */
const ALICE = 'u-alice';
/** Registered but deactivated, with a valid password. */
const DORMANT = 'u-dormant';
/** Registered and active, but with no credential on file. */
const NOPASS = 'u-nopass';
/** Registered, active, credential suspended. */
const SUSPENDED = 'u-suspended';
/** Registered, active, enrolled in MFA. */
const MFA_USER = 'u-mfa';
/** Never registered anywhere. */
const GHOST = 'u-ghost';

/**
 * TOTP fixtures are deliberately spelled-out words rather than random-looking strings.
 *
 * They are still valid RFC 4648 base32 (alphabet A-Z and 2-7), so the TOTP algorithm works
 * exactly as it would with a real secret — but no secret scanner, and no human skimming a
 * diff, can mistake them for a live credential. The first version of this file used
 * realistic high-entropy secrets and tripped the gitleaks gate, correctly: the right fix is
 * a fixture that does not look like a secret, never a suppression rule that teaches the
 * scanner to ignore this file.
 */
const TEST_TOTP_SECRET = 'TESTTESTTESTTESTTESTTESTTESTTEST';

/** The one body every pre-session refusal must produce, byte for byte. */
const INVALID = { statusCode: 401, error: 'Unauthorized', message: 'Invalid credentials' };

describe('authentication security boundary (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let credentials: CredentialsService;
  let users: UsersService;
  let mfa: MfaService;
  let auth: AuthService;
  let mfaSecret: string;

  const login = (body: Record<string, unknown>) => http.post('/api/v1/auth/login').send(body);

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }),
    );

    auth = app.get(AuthService);
    users = app.get(UsersService);
    credentials = app.get(CredentialsService);
    mfa = app.get(MfaService);
    const tenant = app.get(TenantContext);

    // The identity binding main.ts installs, so authenticated routes see an actor.
    app.use(async (req: any, _res: any, next: () => void) => {
      const ctx = await auth.contextFromHeader(req.headers?.authorization);
      if (ctx) tenant.run(ctx, next);
      else next();
    });

    await app.init();
    http = request(app.getHttpServer());

    // --- fixtures ---------------------------------------------------------------
    for (const userId of [ALICE, DORMANT, NOPASS, SUSPENDED, MFA_USER]) {
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }
    await credentials.setPassword(TENANT, ALICE, PASSWORD);
    await credentials.setPassword(TENANT, DORMANT, PASSWORD);
    await credentials.setPassword(TENANT, SUSPENDED, PASSWORD);
    await credentials.setPassword(TENANT, MFA_USER, PASSWORD);

    users.setActive(TENANT, DORMANT, false);
    await credentials.setStatus(TENANT, SUSPENDED, 'disabled');

    mfaSecret = TEST_TOTP_SECRET;
    await mfa.enroll(TENANT, MFA_USER, mfaSecret);
    await mfa.activate(TENANT, MFA_USER, totpCodeAt(mfaSecret));
  });

  afterAll(async () => {
    await app?.close();
  });

  // === the original bypasses ==================================================

  it('refuses an empty body — the bypass that minted a platform-admin token', async () => {
    const res = await login({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
    expect(res.body.token).toBeUndefined();
  });

  it('refuses a username that was never registered, whatever the password', async () => {
    for (const password of [PASSWORD, 'anything', '']) {
      const res = await login({ username: GHOST, password });
      expect(res.status).toBe(401);
      expect(res.body).toEqual(INVALID);
    }
  });

  it('refuses an invented username even with the old shared dev password', async () => {
    // `AUTH_DEV_PASSWORD` is unset in this process; under the old code that meant EVERY
    // password was accepted. It must now authenticate nobody.
    const res = await login({ username: 'u-admin', password: 'e2e-password' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
  });

  it('refuses a registered active user with the wrong password', async () => {
    const res = await login({ username: ALICE, password: 'not-the-password' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
  });

  it('refuses a deactivated user holding the correct password', async () => {
    const res = await login({ username: DORMANT, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
  });

  it('refuses a registered user with no credential on file', async () => {
    const res = await login({ username: NOPASS, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
  });

  it('refuses a suspended credential holding the correct password', async () => {
    const res = await login({ username: SUSPENDED, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
  });

  // === no enumeration =========================================================

  it('returns one identical body for every distinguishable failure mode', async () => {
    const attempts = await Promise.all([
      login({ username: GHOST, password: PASSWORD }), // unknown user
      login({ username: ALICE, password: 'wrong' }), // wrong password
      login({ username: DORMANT, password: PASSWORD }), // inactive user
      login({ username: NOPASS, password: PASSWORD }), // no credential
      login({ username: SUSPENDED, password: PASSWORD }), // disabled credential
    ]);

    const shapes = attempts.map((r) => JSON.stringify({ status: r.status, body: r.body }));
    // Not just "all 401" — all the SAME, so the response leaks nothing about the account.
    expect(new Set(shapes).size).toBe(1);
    expect(attempts[0].body).toEqual(INVALID);
  });

  it('never names the reason in the response, however it failed', async () => {
    const res = await login({ username: DORMANT, password: PASSWORD });
    const body = JSON.stringify(res.body).toLowerCase();
    for (const leak of ['deactivat', 'inactive', 'locked', 'disabled', 'not found', 'unknown', 'password']) {
      expect(body).not.toContain(leak);
    }
  });

  // === lockout ================================================================

  it('locks the account after repeated failures, and still answers with the same body', async () => {
    const target = 'u-lockme';
    users.save({ tenantId: TENANT, userId: target, displayName: target, active: true });
    await credentials.setPassword(TENANT, target, PASSWORD);

    for (let i = 0; i < 6; i += 1) {
      await login({ username: target, password: 'wrong' });
    }

    // Internally locked...
    const record = await credentials.describe(TENANT, target);
    expect(record?.lockedUntil).toBeInstanceOf(Date);
    expect(record!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // ...but externally indistinguishable, and the CORRECT password now fails too.
    const res = await login({ username: target, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
  });

  // === MFA: no session before the second factor ================================

  it('issues NO session for an MFA-enrolled account until the code is verified', async () => {
    const res = await login({ username: MFA_USER, password: PASSWORD });

    expect(res.status).toBe(200); // decided contract: sign-in is not resource creation
    expect(res.body.challenge).toBe('mfa');
    expect(res.body.challengeId).toEqual(expect.any(String));
    // The invariant: no token of any kind comes back with a challenge.
    expect(res.body.token).toBeUndefined();
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('eyJ'); // no JWT anywhere in the payload
  });

  it('refuses a wrong TOTP code and issues no session', async () => {
    const started = await login({ username: MFA_USER, password: PASSWORD });
    const res = await http
      .post('/api/v1/auth/login/mfa')
      .send({ challengeId: started.body.challengeId, code: '000000' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
    expect(res.body.token).toBeUndefined();
  });

  it('issues a session once the correct TOTP code answers the challenge', async () => {
    const started = await login({ username: MFA_USER, password: PASSWORD });
    const res = await http
      .post('/api/v1/auth/login/mfa')
      .send({ challengeId: started.body.challengeId, code: totpCodeAt(mfaSecret) });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ sub: MFA_USER, tenantId: TENANT });
  });

  it('rejects a challenge id that has already been used (single-use)', async () => {
    const started = await login({ username: MFA_USER, password: PASSWORD });
    const code = totpCodeAt(mfaSecret);
    const first = await http.post('/api/v1/auth/login/mfa').send({ challengeId: started.body.challengeId, code });
    expect(first.status).toBe(200);

    const replay = await http.post('/api/v1/auth/login/mfa').send({ challengeId: started.body.challengeId, code });
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual(INVALID);
  });

  it('rejects an invented challenge id', async () => {
    const res = await http
      .post('/api/v1/auth/login/mfa')
      .send({ challengeId: '00000000-0000-4000-8000-000000000000', code: totpCodeAt(mfaSecret) });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
  });

  // === both challenges must be satisfied — neither can skip the other ==========
  //
  // The invariant under test:
  //     required MFA satisfied AND required password change satisfied → session may issue.
  // A forced password change must not become a way around the second factor, and clearing
  // MFA must not become a way around a forced password change.

  it('chains MFA then password change, and issues a session only at the end', async () => {
    const user = 'u-mfa-mustchange';
    users.save({ tenantId: TENANT, userId: user, displayName: user, active: true });
    await credentials.setPassword(TENANT, user, PASSWORD, { mustChange: true });
    const secret = 'FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE';
    await mfa.enroll(TENANT, user, secret);
    await mfa.activate(TENANT, user, totpCodeAt(secret));

    // Step 1 — MFA is challenged FIRST. The must-change state must not pre-empt it.
    const step1 = await login({ username: user, password: PASSWORD });
    expect(step1.status).toBe(200);
    expect(step1.body.challenge).toBe('mfa');
    expect(step1.body.token).toBeUndefined();

    // Step 2 — a correct code still yields NO session, only the password-change challenge.
    const step2 = await http
      .post('/api/v1/auth/login/mfa')
      .send({ challengeId: step1.body.challengeId, code: totpCodeAt(secret) });
    expect(step2.status).toBe(200);
    expect(step2.body.challenge).toBe('password_change');
    expect(step2.body.token).toBeUndefined();
    expect(JSON.stringify(step2.body)).not.toContain('eyJ');

    // Step 3 — only now does a session exist.
    const step3 = await http
      .post('/api/v1/auth/login/password-change')
      .send({ challengeId: step2.body.challengeId, newPassword: 'a-brand-new-password' });
    expect(step3.status).toBe(200);
    expect(step3.body.token).toEqual(expect.any(String));
    expect(step3.body.user).toEqual({ sub: user, tenantId: TENANT });
  });

  it('cannot present an MFA challenge to the password-change step to skip the code', async () => {
    const user = 'u-mfa-skip';
    users.save({ tenantId: TENANT, userId: user, displayName: user, active: true });
    await credentials.setPassword(TENANT, user, PASSWORD, { mustChange: true });
    const secret = 'NOTAREALSECRETNOTAREALSECRETAAAA';
    await mfa.enroll(TENANT, user, secret);
    await mfa.activate(TENANT, user, totpCodeAt(secret));

    const started = await login({ username: user, password: PASSWORD });
    expect(started.body.challenge).toBe('mfa');

    // Feed the *MFA* challenge id to the password-change endpoint: challenges are typed,
    // so this must not be honoured — and must not mint anything.
    const res = await http
      .post('/api/v1/auth/login/password-change')
      .send({ challengeId: started.body.challengeId, newPassword: 'another-new-password' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);

    // The password must be unchanged, so the bypass attempt had no side effect either.
    const check = await credentials.verifyPasswordFor(TENANT, user, 'another-new-password');
    expect(check.ok).toBe(false);
  });

  // === MFA ownership ==========================================================

  it('cannot enrol MFA against another user: the endpoint takes no account at all', async () => {
    const alice = auth.mint({ sub: ALICE, tenantId: TENANT, companyId: null });

    // The original attack, verbatim: name the victim in the body.
    const res = await http
      .post('/api/v1/auth/mfa/enroll')
      .set('Authorization', `Bearer ${alice}`)
      .send({ account: 'u-victim' });

    // It may succeed — but for ALICE, never for the named victim.
    if (res.status < 300) {
      expect(res.body.otpauthUri).toContain(ALICE);
      expect(res.body.otpauthUri).not.toContain('u-victim');
    }
    expect(await mfa.activeSecret(TENANT, 'u-victim')).toBeNull();
  });

  it('refuses anonymous MFA enrolment outright', async () => {
    const res = await http.post('/api/v1/auth/mfa/enroll').send({ account: ALICE });
    expect(res.status).toBe(401);
  });

  // === client-supplied context is never trusted ================================
  //
  // `/api/auth/switch-company` (web BFF) writes an unsigned JSON cookie named
  // `aura-session` and its own docstring claims it "validates the target companyId against
  // the user's authorized companies". It does no such thing — and the real session cookie
  // is `aura_session`, so nothing reads what it writes. It is left in place as a dead
  // compatibility surface until S3 replaces it with `POST /auth/context/company`, which
  // will resolve company context from PROVEN membership.
  //
  // What must hold in the meantime: no client-supplied company context reaches a session.

  it('ignores a company context supplied by the client at login', async () => {
    const res = await login({
      username: ALICE,
      password: PASSWORD,
      companyId: 'company-the-user-does-not-belong-to',
      tenantId: TENANT,
    });
    expect(res.status).toBe(200);

    // The issued token must carry no company at all — a company context has to be proven
    // by membership (S3), never accepted from the request that asks for it.
    const claims = JSON.parse(
      Buffer.from(res.body.token.split('.')[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(claims.companyId ?? null).toBeNull();
    expect(JSON.stringify(claims)).not.toContain('company-the-user-does-not-belong-to');
  });

  it('cannot cross tenants: a token is only ever minted for the resolved tenant', async () => {
    // ALICE exists in TENANT. Asking to sign in to another tenant must not authenticate
    // her there — she is not a registered identity in it.
    const res = await login({ username: ALICE, password: PASSWORD, tenantId: 'other-tenant' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
  });

  // === dev-token mint =========================================================

  it('refuses the dev-token mint when it is not explicitly enabled', async () => {
    const res = await http.post('/api/v1/auth/dev-token').send({ sub: 'u-admin', tenantId: TENANT });
    expect(res.status).toBe(403);
  });

  // === S2 refresh lifecycle: opaque rotation + replay containment ==============

  const loginPair = async (username: string): Promise<{ access: string; refresh: string }> => {
    const res = await login({ username, password: PASSWORD });
    expect(res.status).toBe(200);
    return { access: res.body.token as string, refresh: res.body.refreshToken as string };
  };
  const refresh = (refreshToken: string) => http.post('/api/v1/auth/refresh').send({ refreshToken });

  it('login returns an OPAQUE refresh token beside the access token (not a JWT)', async () => {
    const { access, refresh: r } = await loginPair(ALICE);
    expect(access).toEqual(expect.any(String));
    expect(r).toEqual(expect.any(String));
    expect(r.split('.').length).toBe(1); // opaque secret, not header.payload.sig
  });

  it('rotates a refresh token into a fresh WORKING access token whose JWT is the final shape', async () => {
    const first = await loginPair(ALICE);
    const res = await refresh(first.refresh).expect(200);
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).not.toBe(first.refresh);

    // The freshly minted A2 authenticates …
    expect((await auth.contextFromHeader(`Bearer ${res.body.token}`))?.actorId).toBe(ALICE);
    // … and its claims are EXACTLY {sub, tenantId, sid, iat, exp} — no jti.
    const claims = JSON.parse(Buffer.from((res.body.token as string).split('.')[1], 'base64url').toString('utf8'));
    expect(claims.sub).toBe(ALICE);
    expect(claims.tenantId).toBe(TENANT);
    expect(claims.sid).toEqual(expect.any(String));
    expect(claims.iat).toEqual(expect.any(Number));
    expect(claims.exp).toEqual(expect.any(Number));
    expect(claims.jti).toBeUndefined();
  });

  it('single-use replay proves the FULL chain: family contained → session revoked → A2 rejected', async () => {
    const first = await loginPair(ALICE);
    const rotated = await refresh(first.refresh).expect(200);
    const a2: string = rotated.body.token;
    const successor: string = rotated.body.refreshToken;

    // A2 works while the session is live.
    expect((await auth.contextFromHeader(`Bearer ${a2}`))?.actorId).toBe(ALICE);

    // Replay the already-consumed original → refused …
    await refresh(first.refresh).expect(401);
    // … the successor R2 is dead (family contained) …
    await refresh(successor).expect(401);
    // … and the session was revoked by the containment, so the already-issued A2 is now rejected
    //     at the sid boundary even though its signature and exp are still valid.
    expect(await auth.contextFromHeader(`Bearer ${a2}`)).toBeNull();
  });

  it('refuses an unknown refresh token', async () => {
    await refresh('not-a-real-refresh-token').expect(401);
  });

  it('logout revokes the session AND its refresh family — the refresh token can no longer rotate', async () => {
    const { access, refresh: r } = await loginPair(ALICE);
    await http.post('/api/v1/auth/logout').set('Authorization', `Bearer ${access}`);
    await refresh(r).expect(401);
  });

  it('refuses to refresh for a deactivated account', async () => {
    const { refresh: r } = await loginPair(ALICE);
    users.setActive(TENANT, ALICE, false);
    try {
      await refresh(r).expect(401);
    } finally {
      users.setActive(TENANT, ALICE, true); // restore for the other tests
    }
  });

  // === the decisive sid-boundary revocation ===================================
  // A login token is cryptographically valid until its exp, but it names a session (sid). Revoking
  // that session must refuse the SAME token at the boundary — otherwise a logout or a compromise
  // response leaves a stolen token usable for the full access TTL.
  it('revoking a session refuses its still-valid access token at the boundary (sid, not jti)', async () => {
    const { access } = await loginPair(ALICE);
    expect((await auth.contextFromHeader(`Bearer ${access}`))?.actorId).toBe(ALICE);

    const revoked = await auth.revokeSession(`Bearer ${access}`);
    expect(revoked).toBe(true);

    // Same token, still signature-valid with exp in the future, now refused because the session is gone.
    expect(await auth.contextFromHeader(`Bearer ${access}`)).toBeNull();
  });
});
