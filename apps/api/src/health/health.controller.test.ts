import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { ProjectionEngine } from '@aura/core';
import { HealthController } from './health.controller';
import type { MigrationGateService } from './migration-gate.service';
import type { EnvironmentMarkerService } from './environment-marker.service';

describe('HealthController', () => {
  it('returns 503 when a startup projection alignment failed', () => {
    const gate = {
      getStatus: () => ({
        degraded: false,
        applied: 257,
        onDisk: 257,
        pending: [],
        appliedButAbsent: [],
        reason: null,
      }),
    } as unknown as MigrationGateService;
    const environment = { get: () => 'development' } as unknown as EnvironmentMarkerService;
    const projections = {
      getReadinessStatus: () => ({ ready: false, pending: [], failed: ['finance-profit-loss'] }),
    } as unknown as ProjectionEngine;
    const controller = new HealthController(gate, environment, projections);
    const response = { statusCode: 200 } as ServerResponse;

    const body = controller.check(response);

    expect(response.statusCode).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.projections).toEqual({
      ready: false,
      pending: [],
      failed: ['finance-profit-loss'],
    });
  });
});
