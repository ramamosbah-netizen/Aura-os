import { describe, expect, it, vi } from 'vitest';
import { OlapExportService } from './olap-export.service';
import { DmsService } from '../dms/dms.service';

describe('OlapExportService', () => {
  it('correctly extracts, structures to CSV, and saves in DMS', async () => {
    const createDocSpy = vi.fn().mockResolvedValue({
      document: { id: 'doc-1' },
      versions: [{ storageKey: '/exports/olap/olap_export_t1_2026-06.csv' }],
    });
    const mockDms = { createDocument: createDocSpy } as unknown as DmsService;

    const olapExportService = new OlapExportService(null, mockDms);

    const result = await olapExportService.exportPeriodToWarehouse('t1', '2026-06');

    expect(result.fileUrl).toBe('/exports/olap/olap_export_t1_2026-06.csv');
    expect(result.rowCount).toBe(2);

    expect(createDocSpy).toHaveBeenCalledWith(
      {
        tenantId: 't1',
        companyId: null,
        kind: 'report',
        title: 'olap_export_t1_2026-06.csv',
        aggregateType: 'olap.export',
        aggregateId: '2026-06',
      },
      {
        fileName: 'olap_export_t1_2026-06.csv',
        contentType: 'text/csv',
        data: expect.any(Buffer),
      }
    );

    // Inspect the generated CSV content
    const csvBuffer = createDocSpy.mock.calls[0][1].data as Buffer;
    const csvString = csvBuffer.toString('utf-8');
    expect(csvString).toContain('Revenue');
    expect(csvString).toContain('Expense');
    expect(csvString).toContain('pl,2026-06,,,Revenue,5000,');
  });
});
