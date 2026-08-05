// Auth posture (P0-1) — a pure decision over whether the runtime may serve without a verifier.
//
// Authentication is a staged seam: with no `AUTH_JWKS_URL` / `AUTH_JWT_SECRET` configured, the
// verifier is absent, every request runs as the dev actor, and the permission guard passes through.
// That is deliberate for development and fatal in production, so the API refuses to boot that way.
//
// This mirrors `rls-posture.ts` on purpose. Both are the same shape of decision — "is the enforcement
// layer actually enforcing, and if not, may we serve anyway?" — and they should be readable,
// testable and greppable the same way. The auth half previously lived as an inline `if` in the
// middle of a 300-line bootstrap: correct, but invisible. It was misread during the 2026-08-05
// review as absent, and a P0 was reported against a hole that did not exist. A named, exported,
// tested function is harder to miss than a conditional buried in `main()`.

export interface AuthPostureInput {
  /** True when a verifier is configured (`AuthService.enabled`) — JWKS or shared secret. */
  verifierConfigured: boolean;
  isProduction: boolean;
  /** Explicit ALLOW_INSECURE_NO_AUTH override (deployments fronted by an external gateway). */
  allowInsecure: boolean;
}

export interface AuthPostureDecision {
  /** `ok` = a verifier is present; `warn` = open but tolerated (dev / override); `fatal` = refuse to boot. */
  level: 'ok' | 'warn' | 'fatal';
  message: string;
}

const openBase =
  'auth is OFF (no AUTH_JWKS_URL / AUTH_JWT_SECRET) — every request runs as the dev actor and the ' +
  'permission guard passes through, so any caller reads and writes every tenant\'s data.';

/** Decide how to react to the runtime's auth posture. Pure — no I/O, no process side effects. */
export function evaluateAuthPosture(input: AuthPostureInput): AuthPostureDecision {
  if (input.verifierConfigured) {
    return { level: 'ok', message: 'Auth verifier configured — tokens are verified and the permission guard enforces.' };
  }
  if (input.isProduction && !input.allowInsecure) {
    return {
      level: 'fatal',
      message:
        `FATAL: NODE_ENV=production but ${openBase} Refusing to boot open — configure a verifier, ` +
        'or set ALLOW_INSECURE_NO_AUTH=true to override (NOT recommended).',
    };
  }
  return {
    level: 'warn',
    message: `${openBase} This is the staged dev pass-through; never expose this instance.`,
  };
}
