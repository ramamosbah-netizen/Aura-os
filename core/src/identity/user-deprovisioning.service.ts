import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from './users.service';
import { CredentialsService } from './credentials.service';
import { SessionStore } from './session.store';
import { RefreshTokenStore } from './refresh-token.store';
import { AuthChallengeStore } from './auth-challenge.store';

/** What a deprovision actually removed — returned so the audit trail states facts, not intent. */
export interface DeprovisionResult {
  userId: string;
  sessionsRevoked: number;
  refreshTokensRevoked: number;
  challengesPurged: number;
  credentialRemoved: boolean;
  identityRemoved: boolean;
}

/**
 * Deprovisioning — the closing half of the account lifecycle
 * (provision → credential → authenticate → challenge/session → **deprovision**).
 *
 * Removing the identity row was all that happened before, and that is not a deprovision: the
 * credential, the sessions, their refresh-token families and any outstanding challenge all
 * survived it. Measured on a real database: after `DELETE /admin/users/:id`, the deleted account's
 * pre-existing access token successfully changed that account's own password (201), while the same
 * call on a revoked session returned 401. The identity was gone and the principal was still acting.
 *
 * ORDER IS THE SAFETY PROPERTY. Access is destroyed first and identity last, so that EVERY prefix
 * of this sequence leaves the account less usable than before, never more. A cross-store
 * transaction is not available — five stores own their own connections — so instead of pretending
 * to be atomic, the sequence is arranged so that a failure part-way through cannot produce a
 * half-open account: the worst outcome is an identity that can no longer sign in and still has a
 * row, which the next attempt cleans up (every step is idempotent).
 */
@Injectable()
export class UserDeprovisioningService {
  private readonly logger = new Logger('UserDeprovisioning');

  constructor(
    private readonly users: UsersService,
    private readonly credentials: CredentialsService,
    private readonly sessions: SessionStore,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly challenges: AuthChallengeStore,
  ) {}

  async deprovision(tenantId: string, userId: string): Promise<DeprovisionResult> {
    // 1. Families first, while the session rows still exist to identify them.
    const sessionIds = await this.sessions.listForUser(tenantId, userId);
    const refreshTokensRevoked = await this.refreshTokens.revokeForSessions(tenantId, sessionIds);

    // 2. The sessions themselves — this is what makes live access tokens stop verifying.
    const sessionsRevoked = await this.sessions.revokeAllForUser(tenantId, userId, 'user.deprovisioned');

    // 3. Pre-authentication state, which could otherwise still be exchanged for a session.
    const challengesPurged = await this.challenges.purgeForUser(tenantId, userId);

    // 4. The credential — no way back in even if an identity row is recreated with the same id.
    const credentialRemoved = await this.credentials.clear(tenantId, userId);

    // 5. The identity itself, last.
    const identityRemoved = this.users.remove(tenantId, userId);

    this.logger.log(
      `Deprovisioned ${userId}: ${sessionsRevoked} session(s), ${refreshTokensRevoked} refresh token(s), ` +
        `${challengesPurged} challenge(s), credential ${credentialRemoved ? 'removed' : 'absent'}, ` +
        `identity ${identityRemoved ? 'removed' : 'absent'}.`,
    );

    return { userId, sessionsRevoked, refreshTokensRevoked, challengesPurged, credentialRemoved, identityRemoved };
  }
}
