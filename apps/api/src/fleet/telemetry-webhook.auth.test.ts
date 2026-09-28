import { describe, expect, it } from 'vitest';
import { signTelemetry, telemetryWebhookBinding, verifyTelemetrySignature } from './telemetry-webhook.auth';

const SECRET = 'a'.repeat(32);

describe('telemetry webhook authentication — fail-closed', () => {
  it('is not configured without a 32+ character secret and a tenant', () => {
    expect(telemetryWebhookBinding({})).toBeNull();
    expect(telemetryWebhookBinding({ FLEET_TELEMETRY_WEBHOOK_SECRET: SECRET })).toBeNull();
    expect(telemetryWebhookBinding({ FLEET_TELEMETRY_TENANT_ID: 't1' })).toBeNull();
    expect(telemetryWebhookBinding({ FLEET_TELEMETRY_WEBHOOK_SECRET: 'short-secret', FLEET_TELEMETRY_TENANT_ID: 't1' }), 'a short secret counts as none').toBeNull();
    expect(telemetryWebhookBinding({ FLEET_TELEMETRY_WEBHOOK_SECRET: SECRET, FLEET_TELEMETRY_TENANT_ID: ' t1 ' })).toEqual({ secret: SECRET, tenantId: 't1', companyId: null });
  });

  it('accepts only the HMAC of the exact bytes received', () => {
    const body = Buffer.from('{"vehicleId":"v1","speed":40}');
    expect(verifyTelemetrySignature(body, signTelemetry(body, SECRET), SECRET)).toBe(true);
    expect(verifyTelemetrySignature(Buffer.from('{"vehicleId":"v1","speed":41}'), signTelemetry(body, SECRET), SECRET), 'another body').toBe(false);
    expect(verifyTelemetrySignature(body, signTelemetry(body, 'b'.repeat(32)), SECRET), 'another secret').toBe(false);
    expect(verifyTelemetrySignature(body, undefined, SECRET), 'no header').toBe(false);
    expect(verifyTelemetrySignature(body, signTelemetry(body, SECRET).slice(7), SECRET), 'no sha256= prefix').toBe(false);
    expect(verifyTelemetrySignature(undefined, signTelemetry(body, SECRET), SECRET), 'no raw body kept').toBe(false);
  });
});
