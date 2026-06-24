import { describe, expect, it } from 'vitest';
import {
  DMS_EVENT,
  makeDocument,
  makeDocumentVersion,
  nextVersionNumber,
  storageKeyFor,
} from './document';

describe('dms document model', () => {
  const base = {
    tenantId: 'tenant-1',
    kind: 'contract',
    title: 'Main Contract',
    aggregateType: 'contract',
    aggregateId: 'contract-9',
  };

  it('creates a document at version 1, active, with sane defaults', () => {
    const doc = makeDocument(base);
    expect(doc.currentVersion).toBe(1);
    expect(doc.status).toBe('active');
    expect(doc.companyId).toBeNull();
    expect(doc.createdBy).toBeNull();
    expect(doc.id).toBeTruthy();
    expect(doc.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('nextVersionNumber increments currentVersion', () => {
    expect(nextVersionNumber({ currentVersion: 1 })).toBe(2);
    expect(nextVersionNumber({ currentVersion: 7 })).toBe(8);
  });

  it('storageKeyFor is deterministic and sanitizes the filename', () => {
    const doc = { tenantId: 't1', aggregateType: 'contract', aggregateId: 'c9', id: 'doc-1' };
    const key = storageKeyFor(doc, 2, 'Final Drawing (rev B).pdf');
    expect(key).toBe('t1/contract/c9/doc-1/v2-Final_Drawing_rev_B_.pdf');
    // stable across calls
    expect(storageKeyFor(doc, 2, 'Final Drawing (rev B).pdf')).toBe(key);
  });

  it('storageKeyFor falls back to "file" for an empty/garbage name', () => {
    const doc = { tenantId: 't1', aggregateType: 'a', aggregateId: 'b', id: 'd' };
    expect(storageKeyFor(doc, 1, '   ')).toBe('t1/a/b/d/v1-file');
  });

  it('makeDocumentVersion normalizes optional fields', () => {
    const v = makeDocumentVersion({
      documentId: 'doc-1',
      version: 1,
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1234,
      storageKey: 'k',
    });
    expect(v.checksum).toBeNull();
    expect(v.note).toBeNull();
    expect(v.uploadedBy).toBeNull();
    expect(v.version).toBe(1);
  });

  it('exposes the spine event types', () => {
    expect(DMS_EVENT.created).toBe('dms.document.created');
    expect(DMS_EVENT.versionAdded).toBe('dms.document.version_added');
  });
});
