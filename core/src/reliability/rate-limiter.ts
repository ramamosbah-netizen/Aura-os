import { Injectable } from '@nestjs/common';

/**
 * Sliding-window counter, keyed by whatever the caller chooses.
 *
 * Now that this backs the IP-keyed edge limiter (G-07), the key space is attacker-influenced: a
 * caller rotating source addresses mints a new bucket per request. Buckets are therefore pruned
 * as soon as they fall empty, and a periodic sweep clears keys that were touched once and
 * abandoned — otherwise the defence against a flood becomes a memory leak during one.
 *
 * The sweep is driven by calls rather than a timer, so an idle process holds no handles and tests
 * need no fake clock.
 */
@Injectable()
export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private lastSweep = Date.now();

  async isAllowed(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const cutoff = now - windowMs;

    this.sweep(now, windowMs);

    const timestamps = (this.buckets.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= limit) {
      // Keep the pruned list — it is what expires the block.
      this.buckets.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.buckets.set(key, timestamps);
    return true;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Bucket count — for tests and for asserting the map does not grow without bound. */
  size(): number {
    return this.buckets.size;
  }

  /** Drop every bucket whose timestamps have all aged out. Runs at most once per window. */
  private sweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    const cutoff = now - windowMs;
    for (const [k, times] of this.buckets) {
      if (!times.some((t) => t > cutoff)) this.buckets.delete(k);
    }
  }
}
