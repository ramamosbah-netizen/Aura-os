import { describe, it, expect } from 'vitest';
import { LoginThrottle, throttleFromEnv } from './login-throttle';

const cfg = { maxAttempts: 3, windowMs: 1000, lockMs: 5000 };

describe('LoginThrottle', () => {
  it('locks after maxAttempts failures within the window', () => {
    const t = new LoginThrottle(cfg);
    expect(t.recordFailure('bob', 0).locked).toBe(false);
    expect(t.recordFailure('bob', 100).locked).toBe(false);
    const third = t.recordFailure('bob', 200);
    expect(third.locked).toBe(true);
    expect(third.retryAfterMs).toBe(5000);
    expect(t.status('bob', 200).locked).toBe(true);
  });

  it('frees the key once the lock elapses', () => {
    const t = new LoginThrottle(cfg);
    t.recordFailure('bob', 0);
    t.recordFailure('bob', 0);
    t.recordFailure('bob', 0); // locked until 5000
    expect(t.status('bob', 4999).locked).toBe(true);
    expect(t.status('bob', 5001).locked).toBe(false);
  });

  it('resets the counter when the window rolls over', () => {
    const t = new LoginThrottle(cfg);
    t.recordFailure('bob', 0);
    t.recordFailure('bob', 0);
    // next failure lands after windowMs → counter restarts, no lock
    expect(t.recordFailure('bob', 2000).locked).toBe(false);
  });

  it('reset clears a key on successful login', () => {
    const t = new LoginThrottle(cfg);
    t.recordFailure('bob', 0);
    t.recordFailure('bob', 0);
    t.reset('bob');
    expect(t.recordFailure('bob', 0).locked).toBe(false); // count restarted at 1
  });

  it('isolates keys', () => {
    const t = new LoginThrottle(cfg);
    t.recordFailure('bob', 0);
    t.recordFailure('bob', 0);
    t.recordFailure('bob', 0); // bob locked
    expect(t.status('alice', 0).locked).toBe(false);
  });

  it('throttleFromEnv reads overrides and falls back to defaults', () => {
    const t = throttleFromEnv({ AUTH_LOCKOUT_MAX: '2' } as NodeJS.ProcessEnv);
    t.recordFailure('x', 0);
    expect(t.recordFailure('x', 0).locked).toBe(true); // 2 attempts → locked
  });
});
