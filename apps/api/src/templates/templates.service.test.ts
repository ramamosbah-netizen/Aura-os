import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { TemplatesService } from './templates.service';

function createMockPool(mockRows: any[] = []) {
  const queries: { sql: string; params: any[] }[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params: any[]) => {
      queries.push({ sql, params });
      return { rows: mockRows, rowCount: mockRows.length };
    }),
  } as unknown as Pool;
  return { pool, queries };
}

describe('TemplatesService', () => {
  const tenantId = 'tenant-123';

  it('creates a new template with UUID and draft status', async () => {
    const mockRow = {
      id: 'template-id-abc',
      tenant_id: tenantId,
      name: 'Standard Purchase Order Layout',
      category: 'Purchase Order',
      elements: [],
      status: 'draft',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { pool, queries } = createMockPool([mockRow]);
    const service = new TemplatesService(pool);

    const template = await service.create({
      tenantId,
      name: 'Standard Purchase Order Layout',
      category: 'Purchase Order',
      elements: [],
    });

    expect(template.id).toBe('template-id-abc');
    expect(template.status).toBe('draft');
    expect(template.name).toBe('Standard Purchase Order Layout');
    expect(queries.length).toBe(1);
    expect(queries[0].sql).toContain('INSERT INTO public.aura_document_templates');
    expect(queries[0].params[1]).toBe(tenantId);
  });

  it('retrieves a template by ID and tenant ID', async () => {
    const mockRow = {
      id: 'template-id-xyz',
      tenant_id: tenantId,
      name: 'Subcontract Claim Sheet',
      category: 'Interim Payment Certificate',
      elements: JSON.stringify([{ id: '1', type: 'header', x: 10, y: 10, content: 'Title' }]),
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { pool, queries } = createMockPool([mockRow]);
    const service = new TemplatesService(pool);

    const template = await service.get('template-id-xyz', tenantId);

    expect(template).not.toBeNull();
    expect(template?.id).toBe('template-id-xyz');
    expect(template?.category).toBe('Interim Payment Certificate');
    expect(template?.elements.length).toBe(1);
    expect(queries.length).toBe(1);
    expect(queries[0].sql).toContain('SELECT * FROM public.aura_document_templates WHERE id = $1 AND tenant_id = $2');
  });

  it('lists templates filtered by tenant ID', async () => {
    const mockRows = [
      {
        id: 't-1',
        tenant_id: tenantId,
        name: 'T1',
        category: 'Purchase Order',
        elements: [],
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 't-2',
        tenant_id: tenantId,
        name: 'T2',
        category: 'Purchase Order',
        elements: [],
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      }
    ];

    const { pool, queries } = createMockPool(mockRows);
    const service = new TemplatesService(pool);

    const list = await service.list(tenantId, 'Purchase Order');

    expect(list.length).toBe(2);
    expect(queries.length).toBe(1);
    expect(queries[0].sql).toContain('category = $2');
    expect(queries[0].params).toEqual([tenantId, 'Purchase Order']);
  });
});
