import { describe, expect, it } from 'vitest';
import { isPdfContentType, resolveDocumentOwner, resolveDocumentSubmission } from './document-workflow';

describe('document workflow ownership', () => {
  it('maps only a proven source-domain submit command', () => {
    expect(resolveDocumentSubmission({ id: 'doc-1', aggregateType: 'engineering.drawing', aggregateId: 'drawing-1' })).toEqual({
      label: 'Engineering drawing',
      href: '/engineering/drawings/drawing-1',
      method: 'POST',
      endpoint: '/api/engineering/drawings/drawing-1/submit',
    });
  });

  it('does not invent submit for an unsupported or archived document', () => {
    expect(resolveDocumentSubmission({ id: 'doc-1', aggregateType: 'crm.quotation', aggregateId: 'q-1' })).toBeNull();
    expect(resolveDocumentSubmission({ id: 'doc-1', aggregateType: 'procurement.po', aggregateId: 'po-1', status: 'archived' })).toBeNull();
  });

  it('still links a non-submittable document to its source owner', () => {
    expect(resolveDocumentOwner({ id: 'doc-1', aggregateType: 'crm.quotation', aggregateId: 'q/1' }))
      .toEqual({ label: 'Quotation', href: '/crm/quotations/q%2F1' });
  });

  it('allows inline preview only for the PDF media type', () => {
    expect(isPdfContentType('application/pdf; charset=binary')).toBe(true);
    expect(isPdfContentType('text/html')).toBe(false);
    expect(isPdfContentType('image/svg+xml')).toBe(false);
  });
});
