import { Injectable, Logger, Optional } from '@nestjs/common';
import { dummyVerify, verifyTotp } from '@aura/shared';
import { AuditService } from '../audit/audit.service';
import { AuthChallengeStore } from './auth-challenge.store';
import { CredentialsService, type CredentialFailure } from './credentials.service';
import { MfaService } from './mfa.service';
import { SessionService, type AuthSession } from './session.service';
import { UsersService } from './users.service';
import { TenantContext } from '../tenancy/tenant-context';

// The authentication flow, composed (S1 of the auth rebuild).
//
//   AuthenticationService                ← this file: orchestration only
//        ├── UsersService                registered identity: exists? active?
//        ├── CredentialsService          password, failed attempts, lockout, status
//        ├── MfaService                  second factor
//        ├── AuthChallengeStore          the state between "password proved" and "session"
//        └── SessionService              the ONLY thing that issues a session/token
//
// Two invariants this file exists to hold:
//
// 1. NO SESSION BEFORE MFA. When an account has an active enrolment the password step
//    returns a challenge id and nothing else — no session, no access token, no refresh
//    token. `SessionService.create` is unreachable from that branch. It is a challenge
//    exchange, not a flag the caller could forget to check.
//
// 2. NO DENIAL REASON CROSSES THE BOUNDARY. Unknown user, inactive user, wrong password,
//    disabled credential and locked credential are all audited precisely and all returned
//    as the single opaque `invalid_credentials`. The reason never appears in the public
//    result type, so a controller cannot leak it even by accident — including "locked",
//    which is itself proof that an account exists.

/** Why authentication was refused. Audit and telemetry only — never returned to a caller. */
export type DenialReason =
  | 'missing-credentials'
  | 'unknown-user'
  | 'inactive-user'
  | 'unknown-challenge'
  | 'bad-mfa-code'
  | CredentialFailure;

/**
 * The public result. Note what is absent: there is no `reason`, no `locked`, no
 * `user_not_found`. Every refusal is the same value.
 */
export type AuthenticationResult =
  | { kind: 'authenticated'; session: AuthSession }
  | { kind: 'mfa_required'; challengeId: string }
  | { kind: 'password_change_required'; challengeId: string }
  | { kind: 'invalid_credentials' };

export interface AuthenticationInput {
  tenantId: string;
  identifier: string;
  password: string;
}

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger('Authentication');

  constructor(
    private readonly users: UsersService,
    private readonly credentials: CredentialsService,
    private readonly mfa: MfaService,
    private readonly challenges: AuthChallengeStore,
    private readonly sessions: SessionService,
    private readonly tenant: TenantContext,
    @Optional() private readonly audit: AuditService | null = null,
  ) {}

  /**
   * Run an authentication step with `tenantId` bound as the ambient tenant.
   *
   * `PG_POOL` is a {@link TenantScopedPool}: it copies TenantContext into the
   * `app.current_tenant_id` GUC on every query, and it is FAIL-CLOSED — with nothing bound
   * the GUC is '' and the RLS policies on `auth_credentials` / `aura_users` / `aura_user_mfa`
   * match no rows. Authentication requests are unauthenticated by definition, so nothing else
   * binds them; without this every login would read zero rows and be refused.
   *
   * On `authenticate` the tenant is UNTRUSTED (it came from the request body) and that is
   * fine: it is a scoping key, not a grant. Naming a tenant only lets you *attempt* a login
   * against it — the password still has to verify against a credential inside it, and the RLS
   * policy guarantees the lookup can never reach outside it. On the challenge-completion
   * steps the tenant comes from the server-side challenge, so it is trusted.
   *
   * `actorId` stays null throughout: nothing has been proven yet.
   */
  private inTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.tenant.run({ tenantId, companyId: null, actorId: null }, fn);
  }

  /**
   * Step 1 — prove an identity from an identifier and password.
   *
   * Order is deliberate: resolve a REGISTERED identity, check it is active, then resolve
   * and verify the credential. An id the registry has never seen is not a user, and
   * authentication ends there — before any question about its state is meaningful. Every
   * pre-session refusal burns a password-hash's worth of CPU, so the paths cannot be told
   * apart by timing either.
   *
   * Returns a session ONLY when there is no outstanding second factor.
   */
  async authenticate(input: AuthenticationInput): Promise<AuthenticationResult> {
    const tenantId = input.tenantId;
    const identifier = (input.identifier ?? '').trim();
    const password = input.password ?? '';

    if (!identifier || !password) {
      return this.deny('missing-credentials', tenantId, identifier || '(none)');
    }

    return this.inTenant(tenantId, () => this.authenticateBound(tenantId, identifier, password));
  }

  /** The steps that touch the database, with the tenant already bound. */
  private async authenticateBound(
    tenantId: string,
    identifier: string,
    password: string,
  ): Promise<AuthenticationResult> {
    // 1. Registered identity.
    const user = this.users.get(tenantId, identifier);
    if (!user) {
      await dummyVerify();
      return this.deny('unknown-user', tenantId, identifier);
    }

    // 2. Active?  (Vol 15 §2.2 — a deactivated account cannot sign in at all.)
    if (!user.active) {
      await dummyVerify();
      return this.deny('inactive-user', tenantId, identifier);
    }

    // 3. Credential. Owns the lockout, so a failure here is always counted.
    const verification = await this.credentials.verifyPasswordFor(tenantId, identifier, password);
    if (!verification.ok) {
      return this.deny(verification.reason, tenantId, identifier);
    }
    const { credential } = verification;

    // 4. Second factor. An active enrolment ends this step with a CHALLENGE — the branch
    //    that could return a session is not reachable from here.
    if (await this.mfa.activeSecret(tenantId, identifier)) {
      const challenge = this.challenges.issue({
        kind: 'mfa',
        tenantId,
        userId: identifier,
        credentialId: credential.credentialId,
        mustChangePassword: credential.mustChangePassword,
      });
      await this.record(tenantId, identifier, 'login.mfa_challenged', {});
      return { kind: 'mfa_required', challengeId: challenge.id };
    }

    // 5. A must-change credential is likewise a challenge, not a session with a flag on it:
    //    the client cannot proceed to real work by ignoring a boolean it was handed.
    if (credential.mustChangePassword) {
      const challenge = this.challenges.issue({
        kind: 'password_change',
        tenantId,
        userId: identifier,
        credentialId: credential.credentialId,
        mustChangePassword: true,
      });
      await this.record(tenantId, identifier, 'login.password_change_required', {});
      return { kind: 'password_change_required', challengeId: challenge.id };
    }

    return this.issue(tenantId, identifier, credential.credentialId, false, { mfa: false });
  }

  /**
   * Step 2 — answer an MFA challenge. The ONLY path from an enrolled account to a session.
   *
   * The identity comes from the stored challenge, never from the request: a caller cannot
   * complete userA's challenge into a session for userB.
   */
  async completeMfa(challengeId: string, code: string): Promise<AuthenticationResult> {
    const challenge = this.challenges.get(challengeId, 'mfa');
    if (!challenge) return this.deny('unknown-challenge', 'unknown', '(challenge)');
    return this.inTenant(challenge.tenantId, () => this.completeMfaBound(challenge, challengeId, code));
  }

  private async completeMfaBound(
    challenge: import('./auth-challenge.store').AuthChallenge,
    challengeId: string,
    code: string,
  ): Promise<AuthenticationResult> {
    const secret = await this.mfa.activeSecret(challenge.tenantId, challenge.userId);
    if (!secret || !code?.trim() || !verifyTotp(secret, code.trim())) {
      // A wrong code burns an attempt on the challenge AND counts toward the account
      // lockout — otherwise the second factor is an unlimited-guess six-digit space for
      // anyone already holding the password.
      this.challenges.recordAttempt(challengeId);
      await this.credentials.recordMfaFailure(challenge.tenantId, challenge.userId);
      return this.deny('bad-mfa-code', challenge.tenantId, challenge.userId);
    }

    // Re-check the account: a user deactivated while the challenge was outstanding must not
    // complete it into a live session.
    if (!this.users.isActive(challenge.tenantId, challenge.userId)) {
      this.challenges.consume(challengeId);
      return this.deny('inactive-user', challenge.tenantId, challenge.userId);
    }

    this.challenges.consume(challengeId);

    if (challenge.mustChangePassword) {
      const next = this.challenges.issue({
        kind: 'password_change',
        tenantId: challenge.tenantId,
        userId: challenge.userId,
        credentialId: challenge.credentialId,
        mustChangePassword: true,
      });
      return { kind: 'password_change_required', challengeId: next.id };
    }

    return this.issue(challenge.tenantId, challenge.userId, challenge.credentialId, false, { mfa: true });
  }

  /**
   * Step 2' — satisfy a forced password change. Sets the new password and, only then,
   * issues the session. A must-change account never gets a usable session without changing.
   */
  async completePasswordChange(challengeId: string, newPassword: string): Promise<AuthenticationResult | { kind: 'rejected'; message: string }> {
    const challenge = this.challenges.get(challengeId, 'password_change');
    if (!challenge) return this.deny('unknown-challenge', 'unknown', '(challenge)');
    return this.inTenant(challenge.tenantId, () => this.completePasswordChangeBound(challenge, challengeId, newPassword));
  }

  private async completePasswordChangeBound(
    challenge: import('./auth-challenge.store').AuthChallenge,
    challengeId: string,
    newPassword: string,
  ): Promise<AuthenticationResult | { kind: 'rejected'; message: string }> {
    try {
      await this.credentials.setPassword(challenge.tenantId, challenge.userId, newPassword, { mustChange: false });
    } catch (err) {
      // Policy rejection (too short, etc.) — the challenge survives so the user can retry.
      return { kind: 'rejected', message: (err as Error).message };
    }

    this.challenges.consume(challengeId);
    await this.record(challenge.tenantId, challenge.userId, 'password.changed', { forced: true });
    return this.issue(challenge.tenantId, challenge.userId, challenge.credentialId, false, { mfa: false });
  }

  /** The single place a session is created, once every step has passed. */
  private async issue(
    tenantId: string,
    userId: string,
    credentialId: string,
    mustChangePassword: boolean,
    metadata: Record<string, unknown>,
  ): Promise<AuthenticationResult> {
    const session = this.sessions.create({ userId, tenantId, credentialId, mustChangePassword });
    await this.record(tenantId, userId, 'login.succeeded', { ...metadata, credentialId });
    return { kind: 'authenticated', session };
  }

  /** Audit the precise reason, return the opaque one. */
  private deny(reason: DenialReason, tenantId: string, identifier: string): AuthenticationResult {
    this.logger.warn(`login denied for '${identifier}'@${tenantId}: ${reason}`);
    void this.record(tenantId, identifier, 'login.denied', { reason });
    return { kind: 'invalid_credentials' };
  }

  private async record(
    tenantId: string,
    userId: string,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit?.log(tenantId, null, userId, 'auth', 'user', userId, action, {}, metadata);
  }
}
