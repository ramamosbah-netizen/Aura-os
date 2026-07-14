import type { ServerResponse } from 'node:http';
import { Controller, Get, Res } from '@nestjs/common';
import { MigrationGateService } from './migration-gate.service';

@Controller('health')
export class HealthController {
  constructor(private readonly gate: MigrationGateService) {}

  @Get()
  check(@Res({ passthrough: true }) res: ServerResponse) {
    const s = this.gate.getStatus();
    // Degraded (schema behind code) → 503 so orchestrators and probes SEE it, with a loud body
    // naming the pending migrations. Healthy → 200 ok (what the CI boot probe waits for).
    if (s.degraded) res.statusCode = 503;
    return {
      status: s.degraded ? 'degraded' : 'ok',
      service: 'aura-os-api',
      time: new Date().toISOString(),
      schema: {
        upToDate: !s.degraded,
        applied: s.applied,
        onDisk: s.onDisk,
        pending: s.pending,
        reason: s.reason,
      },
    };
  }
}
