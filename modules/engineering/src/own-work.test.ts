import { describe, expect, it } from 'vitest';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';
import { EngineeringService } from './engineering.service';
import { InMemoryDrawingStore } from './in-memory-drawing-store';
import { InMemoryDrawingSubmissionStore } from './in-memory-drawing-submission-store';
import { InMemoryDrawingReviewStore } from './in-memory-drawing-review-store';
import { InMemoryRfiStore } from './in-memory-rfi-store';
import { InMemorySubmittalStore } from './in-memory-submittal-store';
import { InMemoryTechnicalQueryStore } from './in-memory-technical-query-store';
import { InMemoryBimModelStore } from './in-memory-bim-model-store';
import { InMemoryDesignChangeStore } from './in-memory-design-change-store';
import { InMemoryEngineeringDocumentStore } from './in-memory-engineering-document-store';

/**
 * SEC-01 D-04 / D-05 (owner, 2026-09-28) — AN AUTHOR DOES NOT REVIEW OR DECIDE THEIR OWN ENGINEERING
 * WORK, AND WHOEVER RAISED AN RFI DOES NOT ANSWER IT.
 *
 * Both actors below hold every engineering permission, so each refusal is the RULE and not a missing
 * grant; and each has an allowed twin, so the rule is not simply refusing everyone.
 */
const T = 't1';
const AUTHOR = 'u-author';
const REVIEWER = 'u-reviewer';

function service(): EngineeringService {
  const access = new AccessService();
  access.registerRole({ id: 'r-eng', name: 'Engineering (test)', permissions: ['engineering.*'] });
  for (const userId of [AUTHOR, REVIEWER]) access.grant({ userId, roleId: 'r-eng', scope: { kind: 'org', level: 'tenant', id: T } });
  return new EngineeringService(
    new InMemoryDrawingStore(), new InMemoryDrawingSubmissionStore(), new InMemoryDrawingReviewStore(),
    new InMemoryRfiStore(), new InMemorySubmittalStore(), new InMemoryTechnicalQueryStore(),
    new InMemoryBimModelStore(), new InMemoryDesignChangeStore(), new InMemoryEngineeringDocumentStore(),
    { appendWithClient: async () => [], append: async () => [] } as unknown as EventStore,
    { run: (fn) => fn(null) } as TxRunner,
    access,
  );
}

describe('the author does not review or decide their own engineering work (D-04)', () => {
  it('a drawing: its author and its submitter may not review it; somebody else may', async () => {
    const svc = service();
    const d = await svc.createDrawing({ tenantId: T, projectId: 'p1', code: 'DWG-1', title: 'CCTV layout L1', createdBy: AUTHOR });
    await svc.submitDrawing(T, AUTHOR, d.id);
    await expect(svc.startReviewDrawing(T, AUTHOR, d.id)).rejects.toThrow('the person who wrote or submitted this drawing may not review their own drawing');
    const underReview = await svc.startReviewDrawing(T, REVIEWER, d.id);
    expect(underReview.status).toBe('under_review');
    await expect(svc.reviewDrawing(T, AUTHOR, d.id, { outcome: 'approved' })).rejects.toThrow(/may not decide their own drawing/);
    const approved = await svc.reviewDrawing(T, REVIEWER, d.id, { outcome: 'approved' });
    expect(approved.status).toBe('approved');
  });

  it('a submittal: the author submits it, and may not approve or reject it', async () => {
    const svc = service();
    const s = await svc.createSubmittal({ tenantId: T, projectId: 'p1', code: 'SUB-1', title: 'Camera technical data', submittalType: 'technical', createdBy: AUTHOR });
    expect((await svc.updateSubmittalStatus(T, AUTHOR, s.id, 'submitted')).status).toBe('submitted');
    await expect(svc.updateSubmittalStatus(T, AUTHOR, s.id, 'approved')).rejects.toThrow('the person who wrote this submittal may not decide their own submittal');
    await expect(svc.updateSubmittalStatus(T, AUTHOR, s.id, 'rejected')).rejects.toThrow(/their own submittal/);
    expect((await svc.updateSubmittalStatus(T, REVIEWER, s.id, 'approved')).status).toBe('approved');
  });

  it('a design change: whoever raised it may not decide it', async () => {
    const svc = service();
    const dc = await svc.createDesignChange({ tenantId: T, projectId: 'p1', code: 'DC-1', title: 'Add 6 cameras', createdBy: AUTHOR });
    await expect(svc.decideDesignChange(T, AUTHOR, dc.id, 'approved')).rejects.toThrow('the person who raised this design change may not decide their own design change');
    expect((await svc.decideDesignChange(T, REVIEWER, dc.id, 'approved')).status).toBe('approved');
  });

  it('an engineering document: the author may not approve or reject it', async () => {
    const svc = service();
    const doc = await svc.createDocument({ tenantId: T, projectId: 'p1', code: 'MS-1', title: 'Method statement — cabling', docType: 'method_statement', createdBy: AUTHOR });
    await expect(svc.transitionDocument(T, AUTHOR, doc.id, 'approved')).rejects.toThrow(/may not decide their own engineering document/);
    expect((await svc.transitionDocument(T, REVIEWER, doc.id, 'approved')).status).toBe('approved');
  });
});

describe('whoever raised an RFI does not answer it (D-05)', () => {
  it('the raiser is refused; another engineer answers', async () => {
    const svc = service();
    const rfi = await svc.createRfi({ tenantId: T, projectId: 'p1', code: 'RFI-1', title: 'Riser route', question: 'Which riser?', createdBy: AUTHOR });
    await expect(svc.answerRfi(T, AUTHOR, rfi.id, 'Riser B')).rejects.toThrow('the person who raised this RFI may not answer their own RFI');
    expect((await svc.answerRfi(T, REVIEWER, rfi.id, 'Riser B')).status).toBe('answered');
  });
});
