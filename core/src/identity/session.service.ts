import { Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

// Session issuance — the ONE place a session or token comes into existence.
//
// Token minting used to happen in the login controller, which put session policy (TTL,
// what goes in the claims, when a session may be created at all) at the HTTP boundary and
// left it to be re-decided by every future caller. Centralising it means the invariant
// "a session exists only for a fully authenticated identity" has a single enforcement point.
//
// S1 SCOPE: an access token over the existing HS256 seam, IDENTITY-SCOPED ONLY.
//
//   - No refresh token yet. S2 adds the `auth_sessions` table, a rotating refresh token,
//     refresh-family replay detection, and server-side revocation.
//   - No company or project in the session. There is deliberately NO placeholder resolver
//     stamping `companyId: 'default-company'` — a fabricated context is the same class of
//     defect as the one being fixed, just wearing a resolver's clothes. Organizational
//     context arrives in S3, PROVEN by membership, and `companyId` stays null until then.

/** An issued session. S1 carries an access token only; S2 adds the refresh half. */
export interface AuthSession {
  userId: string;
  tenantId: string;
  /** Null until S3 — a company context must be proven by membership, never assumed. */
  companyId: string | null;
  accessToken: string;
  expiresInSeconds: number;
  /** The credential that proved this session, for the audit trail. */
  credentialId: string;
  /** The client must force a password change before the session is useful for real work. */
  mustChangePassword: boolean;
}

export interface SessionSubject {
  userId: string;
  tenantId: string;
  credentialId: string;
  mustChangePassword: boolean;
}

/** Access-token lifetime. Short by default; the S2 refresh token carries session longevity. */
function accessTtlSeconds(): number {
  const raw = Number(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 3600;
}

@Injectable()
export class SessionService {
  constructor(private readonly auth: AuthService) {}

  /**
   * Create a session for an identity that has FULLY authenticated — password verified and,
   * where enrolled, the second factor satisfied. Callers must not reach this with a partial
   * authentication; `AuthenticationService` is the only intended caller, and it can only
   * get here past both steps.
   */
  create(subject: SessionSubject): AuthSession {
    const expiresInSeconds = accessTtlSeconds();
    return {
      userId: subject.userId,
      tenantId: subject.tenantId,
      companyId: null,
      accessToken: this.auth.mint(
        { sub: subject.userId, tenantId: subject.tenantId, companyId: null },
        expiresInSeconds,
      ),
      expiresInSeconds,
      credentialId: subject.credentialId,
      mustChangePassword: subject.mustChangePassword,
    };
  }
}
