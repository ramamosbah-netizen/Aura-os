import { Injectable } from '@nestjs/common';

@Injectable()
export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();

  async isAllowed(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const cutoff = now - windowMs;

    let timestamps = this.buckets.get(key) || [];
    // Evict expired timestamps
    timestamps = timestamps.filter((t) => t > cutoff);

    if (timestamps.length >= limit) {
      return false;
    }

    timestamps.push(now);
    this.buckets.set(key, timestamps);
    return true;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
