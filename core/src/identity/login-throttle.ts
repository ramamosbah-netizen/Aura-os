// Login lockout (gap register P0 #2). Brute-force protection for the login endpoint:
// after `maxAttempts` failures inside `windowMs`, the key (username/IP) is locked for
// `lockMs`. Pure and deterministic (clock injected) so it's unit-tested headless; a
// successful login clears the counter. In-memory per node — good enough for lockout,
// which only needs to slow an attacker, not be perfectly distributed.

export interface ThrottleConfig {
  maxAttempts: number;
  windowMs: number;
  lockMs: number;
}

interface Entry {
  count: number;
  windowStart: number;
  lockedUntil: number;
}

export const DEFAULT_THROTTLE: ThrottleConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  lockMs: 15 * 60 * 1000,
};

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly cfg: ThrottleConfig = DEFAULT_THROTTLE) {}

  /** Is this key currently locked? `retryAfterMs` is how long until it frees. */
  status(key: string, now: number = Date.now()): { locked: boolean; retryAfterMs: number } {
    const e = this.entries.get(key);
    if (e && e.lockedUntil > now) return { locked: true, retryAfterMs: e.lockedUntil - now };
    return { locked: false, retryAfterMs: 0 };
  }

  /** Record a failed attempt; returns the resulting lock status. */
  recordFailure(key: string, now: number = Date.now()): { locked: boolean; retryAfterMs: number } {
    let e = this.entries.get(key);
    if (!e || now - e.windowStart > this.cfg.windowMs) {
      e = { count: 0, windowStart: now, lockedUntil: 0 };
    }
    e.count += 1;
    if (e.count >= this.cfg.maxAttempts) {
      e.lockedUntil = now + this.cfg.lockMs;
    }
    this.entries.set(key, e);
    return this.status(key, now);
  }

  /** Clear the counter for a key (call on a successful login). */
  reset(key: string): void {
    this.entries.delete(key);
  }
}

/** Build a throttle from env (AUTH_LOCKOUT_MAX / _WINDOW_MS / _MS), falling back to defaults. */
export function throttleFromEnv(env: NodeJS.ProcessEnv = process.env): LoginThrottle {
  const num = (v: string | undefined, d: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return new LoginThrottle({
    maxAttempts: num(env.AUTH_LOCKOUT_MAX, DEFAULT_THROTTLE.maxAttempts),
    windowMs: num(env.AUTH_LOCKOUT_WINDOW_MS, DEFAULT_THROTTLE.windowMs),
    lockMs: num(env.AUTH_LOCKOUT_MS, DEFAULT_THROTTLE.lockMs),
  });
}
