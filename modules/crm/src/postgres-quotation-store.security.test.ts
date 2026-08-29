import { describe, expect, it, vi } from 'vitest';
import { PostgresQuotationStore } from './postgres-quotation-store';

describe('PostgresQuotationStore — quotation tenant boundary', () => {
  it('uses tenant + id for revision roots, never an id-only lookup', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = new PostgresQuotationStore({ query } as never);

    await expect(store.getForTenant('tenant-b', 'quotation-from-tenant-a')).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_id = $1 AND id = $2'),
      ['tenant-b', 'quotation-from-tenant-a'],
    );
  });
});
