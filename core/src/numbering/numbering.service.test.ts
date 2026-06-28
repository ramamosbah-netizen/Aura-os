import { describe, expect, it, vi } from 'vitest';
import { NumberingService } from './numbering.service';
import type { Pool } from 'pg';

describe('NumberingService', () => {
  it('generates sequential codes in-memory when pg pool is null', async () => {
    const service = new NumberingService(null);
    const code1 = await service.generateNextNumber('tenant1', 'company1', 'finance', 'invoice', 'INV', { fiscalYear: 2026 });
    const code2 = await service.generateNextNumber('tenant1', 'company1', 'finance', 'invoice', 'INV', { fiscalYear: 2026 });
    expect(code1).toBe('INV-2026-000001');
    expect(code2).toBe('INV-2026-000002');
  });

  it('correctly pads sequences based on options', async () => {
    const service = new NumberingService(null);
    const code = await service.generateNextNumber('tenant1', 'company1', 'procurement', 'po', 'PO', { fiscalYear: 2026, padWidth: 3 });
    expect(code).toBe('PO-2026-001');
  });

  it('invokes postgres transaction logic when pg pool is provided', async () => {
    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT current_seq')) {
        return { rows: [{ current_seq: 41, prefix: 'INV', pad_width: 6 }] };
      }
      return { rows: [] };
    });

    const mockClient = {
      query: mockQuery,
      release: vi.fn(),
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    const service = new NumberingService(mockPool);
    const code = await service.generateNextNumber('tenant1', 'company1', 'finance', 'invoice', 'INV', { fiscalYear: 2026 });

    expect((mockClient as any).connect).toBeUndefined(); // pool.connect is called
    expect(mockPool.connect).toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), expect.any(Array));
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE public.aura_number_sequences'), expect.any(Array));
    expect(mockQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
    expect(code).toBe('INV-2026-000042');
  });
});
