import { describe, expect, it } from 'vitest';
import { makeBimModel, bumpModelVersion } from './bim-model';

const base = () =>
  makeBimModel({ tenantId: 't1', projectId: 'p1', code: 'MOD-001', name: 'Tower A — Structural' });

describe('BIM model', () => {
  it('registers a model with sane defaults', () => {
    const m = base();
    expect(m.version).toBe(1);
    expect(m.revision).toBe('A');
    expect(m.format).toBe('ifc');
    expect(m.status).toBe('wip');
  });

  describe('bumpModelVersion', () => {
    it('increments the version and updates the revision each upload', () => {
      const v2 = bumpModelVersion(base(), { revision: 'B' });
      expect(v2.version).toBe(2);
      expect(v2.revision).toBe('B');
      const v3 = bumpModelVersion(v2, { revision: 'C' });
      expect(v3.version).toBe(3);
      expect(v3.revision).toBe('C');
    });

    it('repoints the file when a new location is supplied', () => {
      const v2 = bumpModelVersion(base(), {
        revision: 'B',
        storageKey: 's3://models/tower-a-b.ifc',
        fileUrl: 'https://cdn/tower-a-b.ifc',
        fileSizeBytes: 4096,
      });
      expect(v2.storageKey).toBe('s3://models/tower-a-b.ifc');
      expect(v2.fileUrl).toBe('https://cdn/tower-a-b.ifc');
      expect(v2.fileSizeBytes).toBe(4096);
    });

    it('keeps the previous file pointer when the upload omits it', () => {
      const v1 = bumpModelVersion(base(), { revision: 'B', storageKey: 's3://a.ifc', fileSizeBytes: 10 });
      const v2 = bumpModelVersion(v1, { revision: 'C' });
      expect(v2.storageKey).toBe('s3://a.ifc');
      expect(v2.fileSizeBytes).toBe(10);
    });

    it('updates status only when provided, and preserves identity fields', () => {
      const m = base();
      const issued = bumpModelVersion(m, { revision: 'B', status: 'published' });
      expect(issued.status).toBe('published');
      expect(bumpModelVersion(issued, { revision: 'C' }).status).toBe('published');
      // identity / registry row is kept across versions
      expect(issued.id).toBe(m.id);
      expect(issued.code).toBe(m.code);
      expect(issued.name).toBe(m.name);
    });
  });
});
