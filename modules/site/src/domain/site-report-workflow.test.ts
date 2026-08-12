import { describe, expect, it } from 'vitest';
import {
  type DailyReport,
  makeDailyReport,
  canTransitionReport,
  SiteReportTransitionError,
  submitReport,
  startReviewReport,
  approveReport,
  rejectReport,
  reopenReport,
  assertReportEditable,
} from './daily-report';
import { makeSiteProgressEntry, makeSiteLabourEntry, makeSiteEvidence, makeSiteDelayEntry } from './daily-report-lines';

const base = (): DailyReport =>
  makeDailyReport({ tenantId: 't1', projectId: 'p1', date: '2026-08-12', workDescription: 'Second fix ELV L2' });

function toUnderReview(): DailyReport {
  return startReviewReport(submitReport(base(), 'eng1'), 'pm1');
}

describe('site daily report state machine', () => {
  it('walks draft → submitted → under_review → approved', () => {
    let r = base();
    expect(r.status).toBe('draft');
    r = submitReport(r, 'eng1');
    expect(r.status).toBe('submitted');
    expect(r.submittedBy).toBe('eng1');
    r = startReviewReport(r, 'pm1');
    expect(r.status).toBe('under_review');
    r = approveReport(r, 'pm1');
    expect(r.status).toBe('approved');
    expect(r.approvedBy).toBe('pm1');
    expect(r.approvedAt).not.toBeNull();
  });

  it('rejects illegal transitions', () => {
    expect(canTransitionReport('draft', 'approved')).toBe(false);
    expect(canTransitionReport('approved', 'draft')).toBe(false);
    expect(canTransitionReport('approved', 'rejected')).toBe(false);
    // straight draft → approve is refused
    expect(() => approveReport(base(), 'x')).toThrow(SiteReportTransitionError);
    // approved is terminal — cannot re-open or re-submit
    const approved = approveReport(toUnderReview(), 'pm1');
    expect(() => submitReport(approved, 'x')).toThrow(SiteReportTransitionError);
    expect(() => reopenReport(approved)).toThrow(SiteReportTransitionError);
  });

  it('submit requires a work description', () => {
    const empty = makeDailyReport({ tenantId: 't1', projectId: 'p1', date: '2026-08-12', workDescription: ' ' });
    expect(() => submitReport(empty, 'eng1')).toThrow(/work description/i);
  });

  it('rejection requires a reason and reopens to draft', () => {
    const ur = toUnderReview();
    expect(() => rejectReport(ur, 'pm1', '   ')).toThrow(/reason/i);
    const rejected = rejectReport(ur, 'pm1', 'Manpower figures do not match the labour lines');
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason).toMatch(/manpower/i);
    const reopened = reopenReport(rejected);
    expect(reopened.status).toBe('draft');
    expect(() => submitReport(reopened, 'eng1')).not.toThrow(); // can correct & resubmit
  });

  it('line-items may be attached only while the report is a draft', () => {
    expect(() => assertReportEditable(base())).not.toThrow();
    expect(() => assertReportEditable(submitReport(base(), 'eng1'))).toThrow(SiteReportTransitionError);
    expect(() => assertReportEditable(approveReport(toUnderReview(), 'pm1'))).toThrow(SiteReportTransitionError);
  });
});

describe('report line-items', () => {
  const ctx = { tenantId: 't1', dailyReportId: 'r1', projectId: 'p1' };

  it('progress computes progress % from installed / planned', () => {
    const p = makeSiteProgressEntry({ ...ctx, description: 'CCTV cameras', plannedQty: 30, installedQty: 24, unit: 'no', boqItemId: 'BOQ-1' });
    expect(p.progressPct).toBe(80);
    expect(p.boqItemId).toBe('BOQ-1');
    // zero planned ⇒ 0% (no divide-by-zero)
    expect(makeSiteProgressEntry({ ...ctx, description: 'x', installedQty: 5 }).progressPct).toBe(0);
  });

  it('labour rolls up man-hours = headcount × hours', () => {
    const l = makeSiteLabourEntry({ ...ctx, trade: 'ELV Technician', headcount: 4, hours: 8 });
    expect(l.manHours).toBe(32);
  });

  it('evidence requires a fileId and never carries a blob', () => {
    expect(() => makeSiteEvidence({ ...ctx, fileId: '' })).toThrow(/fileId/i);
    const e = makeSiteEvidence({ ...ctx, fileId: 'file-123', category: 'progress', hash: 'abc' });
    expect(e.fileId).toBe('file-123');
    expect(e).not.toHaveProperty('blob');
  });

  it('delay validates its category', () => {
    expect(() => makeSiteDelayEntry({ ...ctx, category: 'nope' as never, description: 'x' })).toThrow(/category/i);
    const d = makeSiteDelayEntry({ ...ctx, category: 'material', description: 'Cat6 not delivered', durationHours: 6, responsibleParty: 'Supplier' });
    expect(d.category).toBe('material');
    expect(d.responsibleParty).toBe('Supplier');
  });
});
