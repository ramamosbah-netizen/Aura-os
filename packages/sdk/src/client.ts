// @aura/sdk — hand-written client core (gap register Vol 23 #21).
// The generated surface (generated.ts) calls into this. Regenerate with
// `pnpm --filter @aura/sdk generate` against a running API.

/** The enforced API error taxonomy (Vol 9 §7): every non-2xx is one of these. */
export type AuraErrorCode =
  | 'VALIDATION' // 400
  | 'AUTH' // 401
  | 'FORBIDDEN' // 403
  | 'NOT_FOUND' // 404
  | 'CONFLICT' // 409 — state guards (approval gates, insufficient stock…)
  | 'RATE_LIMITED' // 429
  | 'SERVER'; // 5xx

const CODE_BY_STATUS: Record<number, AuraErrorCode> = {
  400: 'VALIDATION',
  401: 'AUTH',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

export class AuraApiError extends Error {
  readonly code: AuraErrorCode;
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'AuraApiError';
    this.status = status;
    this.code = CODE_BY_STATUS[status] ?? 'SERVER';
    this.body = body;
  }
}

/** The universal pagination envelope returned by every `GET .../paged` route. */
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface AuraClientOptions {
  /** e.g. https://aura.example.com — the client appends /api/v1. */
  baseUrl: string;
  /** Bearer token (from POST /auth/login or your IdP). Can be rotated via setToken. */
  token?: string;
  /** Custom fetch (tests, polyfills). Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  /** Sent as Idempotency-Key — honored (and on spine creates, requireable) server-side. */
  idempotencyKey?: string;
  /** Extra headers for this call. */
  headers?: Record<string, string>;
  /** Abort signal. */
  signal?: AbortSignal;
}

export class AuraHttp {
  private token: string | null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(opts: AuraClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token ?? null;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
  }

  /** Swap the bearer token (e.g. after POST /auth/refresh). */
  setToken(token: string | null): void {
    this.token = token;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    opts?: RequestOptions,
  ): Promise<T> {
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const url = `${this.baseUrl}/api/v1${path}${qs ? `?${qs}` : ''}`;
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      ...(opts?.idempotencyKey ? { 'idempotency-key': opts.idempotencyKey } : {}),
      ...opts?.headers,
    };
    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: opts?.signal,
    });
    const text = await res.text();
    const parsed: unknown = text ? safeJson(text) : null;
    if (!res.ok) {
      const message =
        (parsed && typeof parsed === 'object' && 'message' in parsed
          ? String((parsed as { message: unknown }).message)
          : null) ?? `${method} ${path} → ${res.status}`;
      throw new AuraApiError(res.status, parsed, message);
    }
    return parsed as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
