import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimiter } from '../reliability/rate-limiter';
import { DEFAULT_RATE_LIMIT, isRateLimitExempt, rateLimitKey, resolveRateLimit, type RateLimitConfig } from './edge-security';

/**
 * IP rate limiting at the HTTP edge (gap register G-07).
 *
 * `RateLimiter` already existed in `core/src/reliability` and was bound to nothing, which is why
 * the register recorded rate limiting as absent despite the class being present. This is the
 * binding.
 *
 * Deliberately distinct from the login throttle: that one protects one endpoint against credential
 * guessing, this one protects the whole process against volume. A caller who has not authenticated
 * still costs CPU, a database connection and memory on every request.
 *
 * Single-instance, in-memory. Behind more than one replica each holds its own count, so the
 * effective limit multiplies by replica count — acceptable for a blunt volume cap, but the real
 * control for a multi-replica deployment is at the load balancer or a shared store.
 */
@Injectable()
export class EdgeRateLimitGuard implements CanActivate {
  private readonly logger = new Logger('EdgeRateLimit');
  private readonly config: RateLimitConfig;
  /** Log the first rejection per key only — a flood must not become a log flood. */
  private readonly reported = new Set<string>();

  constructor(private readonly limiter: RateLimiter) {
    this.config = resolveRateLimit({
      limit: process.env.RATE_LIMIT_MAX,
      windowMs: process.env.RATE_LIMIT_WINDOW_MS,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const path = req.originalUrl ?? req.url;
    if (isRateLimitExempt(path, this.config)) return true;

    const key = rateLimitKey({ ip: req.ip, path });
    const allowed = await this.limiter.isAllowed(key, this.config.limit, this.config.windowMs);

    res.setHeader('X-RateLimit-Limit', String(this.config.limit));
    res.setHeader('X-RateLimit-Window', String(Math.floor(this.config.windowMs / 1000)));

    if (!allowed) {
      const retryAfter = Math.ceil(this.config.windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      if (!this.reported.has(key)) {
        this.reported.add(key);
        this.logger.warn(`Rate limit exceeded for ${key} (${this.config.limit}/${this.config.windowMs}ms)`);
      }
      throw new HttpException(
        { code: 'RATE_LIMITED', message: `Too many requests — retry in ${retryAfter}s` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.reported.delete(key);
    return true;
  }

  /** Current configuration, for the boot log and the admin security posture. */
  describe(): RateLimitConfig {
    return this.config;
  }
}

export { DEFAULT_RATE_LIMIT };
