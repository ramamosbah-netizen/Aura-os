/**
 * HTTP edge security posture (gap register G-07).
 *
 * Application-level protection — the login throttle, the permission guard, command validation —
 * governs *what a caller may do once their request is being handled*. It cannot answer a request
 * flood, a cross-origin browser attack, or a 50MB body, because by the time it runs the cost has
 * already been paid. Those belong at the edge, and this is that layer.
 *
 * The decisions live here as pure functions rather than inline in the 300-line bootstrap, for the
 * same reason `evaluateAuthPosture` and `evaluateRlsPosture` do: a security gate buried in a
 * bootstrap is a security gate nobody reads, and G-07 sat mis-reported as "partial" for weeks
 * while being wholly absent.
 */

/** Where a request came from, as far as the edge can tell. */
export interface EdgeRequest {
  ip?: string;
  path?: string;
  method?: string;
}

// ── CORS ────────────────────────────────────────────────────────────────────────

export interface CorsDecision {
  /** `true` = reflect any origin (dev only). Otherwise the explicit allowlist. */
  origin: true | string[];
  credentials: boolean;
  /** Non-fatal note for the boot log when the posture is weaker than it should be. */
  warning?: string;
}

/**
 * `app.enableCors()` with no arguments reflects **every** origin, which means any page on the
 * internet can make credentialed requests to this API from a logged-in user's browser. That is
 * fine on a laptop and wrong in production.
 *
 * Production with no allowlist is a misconfiguration, not a default to paper over — but refusing
 * to boot would strand a deployment behind a gateway that already handles CORS, so it locks down
 * to same-origin and says so loudly.
 */
export function resolveCors(opts: { allowedOrigins?: string | null; isProduction: boolean }): CorsDecision {
  const list = (opts.allowedOrigins ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (list.length > 0) return { origin: list, credentials: true };

  if (opts.isProduction) {
    return {
      origin: [],
      credentials: true,
      warning:
        'CORS_ALLOWED_ORIGINS is unset in production — no cross-origin browser client can reach this API. ' +
        'Set it to your web origin(s), comma-separated.',
    };
  }

  return { origin: true, credentials: true };
}

// ── Rate limiting ───────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Requests permitted per window, per key. */
  limit: number;
  windowMs: number;
  /** Paths exempt from limiting — health and metrics are polled by infrastructure. */
  exempt: string[];
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  limit: 300,
  windowMs: 60_000,
  exempt: ['/health', '/api/v1/health', '/metrics', '/api/v1/metrics'],
};

export function resolveRateLimit(env: { limit?: string | null; windowMs?: string | null }): RateLimitConfig {
  const limit = Number(env.limit);
  const windowMs = Number(env.windowMs);
  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_RATE_LIMIT.limit,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : DEFAULT_RATE_LIMIT.windowMs,
    exempt: DEFAULT_RATE_LIMIT.exempt,
  };
}

/**
 * The bucket key. IP alone is the honest answer at the edge: there is no authenticated identity
 * yet when the limiter runs, and keying on anything the caller controls (a header, a token) lets
 * them mint unlimited buckets.
 */
export function rateLimitKey(req: EdgeRequest): string {
  return `edge:${req.ip || 'unknown'}`;
}

export function isRateLimitExempt(path: string | undefined, config: RateLimitConfig): boolean {
  if (!path) return false;
  const clean = path.split('?')[0];
  return config.exempt.some((e) => clean === e || clean.startsWith(`${e}/`));
}

// ── Content-Security-Policy ─────────────────────────────────────────────────────

/**
 * A JSON API needs no resources at all, so its CSP can be the strictest one that exists. The
 * Swagger UI is the single exception — it is a real HTML page with inline script and style, and
 * a `default-src 'none'` policy renders it blank.
 */
export function cspFor(path: string | undefined): string {
  const clean = (path ?? '').split('?')[0];
  const isDocs = clean.startsWith('/api/docs');

  if (isDocs) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
  }

  return ["default-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
}

// ── Request body size ───────────────────────────────────────────────────────────

/**
 * Express defaults to 100kb for JSON, which several AURA payloads exceed legitimately — a BOQ
 * import or a large form schema. Raised deliberately rather than left at "whatever the framework
 * picked", and still bounded so a single request cannot exhaust memory.
 */
export const BODY_LIMIT = '2mb';
