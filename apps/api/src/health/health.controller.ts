import type { ServerResponse } from 'node:http';
import { Controller, Get, Res } from '@nestjs/common';
import { ProjectionEngine } from '@aura/core';
import { MigrationGateService } from './migration-gate.service';
import { EnvironmentMarkerService } from './environment-marker.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly gate: MigrationGateService,
    private readonly environment: EnvironmentMarkerService,
    private readonly projections: ProjectionEngine,
  ) {}

  @Get()
  check(@Res({ passthrough: true }) res: ServerResponse) {
    const s = this.gate.getStatus();
    const projectionStatus = this.projections.getReadinessStatus();
    const degraded = s.degraded || !projectionStatus.ready;
    // Degraded (schema behind code) → 503 so orchestrators and probes SEE it, with a loud body
    // naming the pending migrations. Healthy → 200 ok (what the CI boot probe waits for).
    if (degraded) res.statusCode = 503;
    return {
      status: degraded ? 'degraded' : 'ok',
      service: 'aura-os-api',
      // What the DATABASE says it is, not what the caller claims — null unless a provisioning
      // step marked it. See EnvironmentMarkerService.
      environment: this.environment.get(),
      time: new Date().toISOString(),
      schema: {
        upToDate: !s.degraded,
        applied: s.applied,
        onDisk: s.onDisk,
        pending: s.pending,
        appliedButAbsent: s.appliedButAbsent,
        reason: s.reason,
      },
      projections: projectionStatus,
    };
  }
}
