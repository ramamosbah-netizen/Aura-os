import { describe, it, expect } from 'vitest';
import { AuditController } from './audit.controller';
import type { TenantContext } from '@aura/core';

const tenant = { get: () => ({ tenantId: 't1', companyId: null, actorId: 'u1' }) } as unknown as TenantContext;

describe('AuditController — CSV export', () => {
  it('emits a header row + flattened jsonb columns (no-pool dev path)', async () => {
    const csv = await new AuditController(tenant, null).exportCsv();
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'id,tenant_id,company_id,actor_id,module,entity_type,entity_id,action,changes,metadata,created_at',
    );
    expect(lines.length).toBeGreaterThan(1);
    // the `changes` jsonb is flattened to a CSV-quoted JSON string (inner quotes doubled)
    expect(csv).toContain('"{""field"":""status"",""from"":""draft"",""to"":""approved""}"');
    // scalar columns render plainly
    expect(csv).toContain('t1,company-001,');
  });
});
