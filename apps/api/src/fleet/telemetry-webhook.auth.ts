import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * WHO MAY REPORT A VEHICLE'S POSITION — A TELEMATICS BOX, PROVEN BY SIGNATURE.
 *
 * `POST fleet/telemetry/webhook` is called by a machine, not a person. It used to sit behind the
 * user-permission guard under a name only the System Administrator's `*` reached, so the only way a
 * telematics provider could post a position was with an administrator's login token. It is now
 * authenticated the way a machine is: the provider signs the exact request body with a shared secret,
 * and the deployment says which tenant that secret belongs to.
 *
 * ONE TENANT PER SECRET, SET BY THE DEPLOYMENT (JEET-first). A second company needs its own secret
 * bound to its own tenant — per-tenant integration credentials are a recorded configuration
 * candidate, not something this file pretends to solve.
 *
 * FAIL-CLOSED: with no secret or no tenant configured, every call is refused; a secret shorter than
 * 32 characters counts as not configured, because a short shared secret can be guessed offline from a
 * single signed body.
 */
export interface TelemetryWebhookBinding {
  secret: string;
  tenantId: string;
  companyId: string | null;
}

export const TELEMETRY_SIGNATURE_HEADER = 'x-aura-signature';
const MIN_SECRET_LENGTH = 32;

export function telemetryWebhookBinding(env: NodeJS.ProcessEnv = process.env): TelemetryWebhookBinding | null {
  const secret = env.FLEET_TELEMETRY_WEBHOOK_SECRET?.trim() ?? '';
  const tenantId = env.FLEET_TELEMETRY_TENANT_ID?.trim() ?? '';
  if (secret.length < MIN_SECRET_LENGTH || !tenantId) return null;
  return { secret, tenantId, companyId: env.FLEET_TELEMETRY_COMPANY_ID?.trim() || null };
}

/** `sha256=<hex HMAC-SHA256 of the raw body>`, compared in constant time. */
export function signTelemetry(rawBody: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function verifyTelemetrySignature(rawBody: Buffer | undefined, header: string | undefined, secret: string): boolean {
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(signTelemetry(rawBody, secret));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
