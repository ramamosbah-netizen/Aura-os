import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service';
import type { Pool } from 'pg';

import { TenantContext } from '../tenancy/tenant-context';

describe('AuditService', () => {
  it('logs mutations in-memory when pool is null without throwing errors', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const tenantContext = new TenantContext();
    const service = new AuditService(null, tenantContext);

    await expect(
      service.log(
        'tenant1',
        'company1',
        'actor123',
        'finance',
        'invoice',
        'inv-445',
        'approve',
        { status: 'approved' },
      ),
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs database insertions when pool is provided', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    const mockPool = {
      query: mockQuery,
    } as unknown as Pool;

    const tenantContext = new TenantContext();
    const service = new AuditService(mockPool, tenantContext);
    await service.log(
      'tenant1',
      'company1',
      'actor123',
      'finance',
      'invoice',
      'inv-445',
      'approve',
      { status: 'approved' },
      { ip: '127.0.0.1' },
    );

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.aura_audit_log'),
      [
        'tenant1',
        'company1',
        'actor123',
        'finance',
        'invoice',
        'inv-445',
        'approve',
        JSON.stringify({ status: 'approved' }),
        JSON.stringify({ ip: '127.0.0.1' }),
        null,
      ],
    );
  });
});
