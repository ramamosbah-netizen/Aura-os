import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

// Pending authentication challenges — the state between "password proved" and "session
// issued". A challenge is NOT a session: it carries no token, authorizes nothing, and the
// only thing it can be exchanged for is a completed authentication.
//
// This is what makes "no successful MFA ⇒ no authenticated session" an invariant rather
// than a code path. The password step returns a challenge id and nothing else, so there is
// no branch in which a session exists before the second factor has verified.
//
// Deliberately in-memory and short-lived: a challenge outlives a single request but not a
// sign-in attempt. Behind multiple replicas a challenge is pinned to the node that issued
// it, which the S2 session store will fix along with refresh tokens; until then a client
// that lands on another node simply restarts the sign-in.

export type ChallengeKind = 'mfa' | 'password_change';

export interface AuthChallenge {
  id: string;
  kind: ChallengeKind;
  tenantId: string;
  userId: string;
  credentialId: string;
  /** Carried through so the completed authentication still knows to force a change. */
  mustChangePassword: boolean;
  expiresAt: number;
  attempts: number;
}

/** How long a client has to answer a challenge. Short — this is one step of one sign-in. */
const TTL_MS = 5 * 60 * 1000;
/** Attempts allowed against one challenge before it is destroyed (the account lockout is separate). */
const MAX_ATTEMPTS = 5;

@Injectable()
export class AuthChallengeStore {
  private readonly logger = new Logger('AuthChallenge');
  private readonly challenges = new Map<string, AuthChallenge>();

  /** Open a challenge for an identity whose password has already verified. */
  issue(input: {
    kind: ChallengeKind;
    tenantId: string;
    userId: string;
    credentialId: string;
    mustChangePassword: boolean;
  }): AuthChallenge {
    this.sweep();
    const challenge: AuthChallenge = {
      id: randomUUID(),
      kind: input.kind,
      tenantId: input.tenantId,
      userId: input.userId,
      credentialId: input.credentialId,
      mustChangePassword: input.mustChangePassword,
      expiresAt: Date.now() + TTL_MS,
      attempts: 0,
    };
    this.challenges.set(challenge.id, challenge);
    return challenge;
  }

  /**
   * Look up a live challenge. Returns null for unknown, expired, or exhausted ids — so a
   * caller can never distinguish "wrong id" from "expired id", and a guessed id is useless.
   */
  get(id: string | undefined | null, kind: ChallengeKind): AuthChallenge | null {
    if (!id) return null;
    const challenge = this.challenges.get(id);
    if (!challenge) return null;
    if (challenge.kind !== kind || challenge.expiresAt <= Date.now()) {
      this.challenges.delete(id);
      return null;
    }
    return challenge;
  }

  /**
   * Count a wrong answer. Destroys the challenge once it is exhausted, so a six-digit code
   * cannot be brute-forced against one long-lived challenge. Returns whether it survives.
   */
  recordAttempt(id: string): boolean {
    const challenge = this.challenges.get(id);
    if (!challenge) return false;
    challenge.attempts += 1;
    if (challenge.attempts >= MAX_ATTEMPTS) {
      this.challenges.delete(id);
      this.logger.warn(`challenge for ${challenge.userId} destroyed after ${challenge.attempts} failed attempts`);
      return false;
    }
    return true;
  }

  /** Single-use: consume the challenge as the authentication completes. */
  consume(id: string): void {
    this.challenges.delete(id);
  }

  /** Drop everything expired. Called on issue — no timer to leak in tests or on shutdown. */
  private sweep(now: number = Date.now()): void {
    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAt <= now) this.challenges.delete(id);
    }
  }
}
