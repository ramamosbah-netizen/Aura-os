import { Injectable } from '@nestjs/common';

// Token revocation (P0 #2). A denylist of JWT ids (`jti`) that must no longer be accepted —
// the mechanism behind logout / "sign out everywhere" / compromised-token response. Entries
// carry the token's own `exp`, so a revoked jti is forgotten once the token would have expired
// anyway (self-cleaning, bounded memory). In-memory per node today; a Postgres/Redis-backed
// impl swaps in behind the same shape when horizontal scale needs a shared denylist.
@Injectable()
export class TokenRevocationStore {
  /** jti → token expiry (seconds since epoch) */
  private readonly revoked = new Map<string, number>();

  /** Revoke a token by its jti until at least its own expiry. */
  revoke(jti: string, expSec: number): void {
    if (jti) this.revoked.set(jti, expSec);
  }

  /** Is this jti revoked (and not yet past its expiry)? Sweeps the entry once expired. */
  isRevoked(jti: string | undefined, nowSec: number = Math.floor(Date.now() / 1000)): boolean {
    if (!jti) return false;
    const exp = this.revoked.get(jti);
    if (exp === undefined) return false;
    if (exp <= nowSec) {
      this.revoked.delete(jti);
      return false;
    }
    return true;
  }

  /** Current denylist size (after no sweep) — for the /metrics gauge and tests. */
  size(): number {
    return this.revoked.size;
  }
}
