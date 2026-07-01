import { describe, expect, it } from 'vitest';
import { makeAuditSchedule } from './audit-schedule';
import {
  InMemoryNcrStore,
  InMemoryInspectionRequestStore,
  InMemorySnagStore,
  InMemoryItpStore,
  InMemoryMaterialApprovalStore,
  InMemoryCalibrationStore,
  InMemoryAuditScheduleStore,
} from '../in-memory-quality-store';
import { QualityService } from '../quality.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  appendWithClient: async () => [],
} as unknown as EventStore;

const mockTx: TxRunner = {
  run: (fn) => fn(null),
};

describe('Quality ISO Audits and Checklists', () => {
  it('correctly schedules an audit with default checklists', () => {
    const audit = makeAuditSchedule({
      tenantId: 't1',
      projectId: 'p1',
      projectName: 'Test Project',
      auditNumber: 'AUD-001',
      auditType: 'ISO 9001:2015',
      scheduledDate: '2026-07-15',
      auditorName: 'John Doe',
    });

    expect(audit.auditNumber).toBe('AUD-001');
    expect(audit.status).toBe('scheduled');
    expect(audit.checklist.length).toBe(4);
    expect(audit.checklist[0].status).toBe('pending');
  });

  it('manages ISO Checklist audits via the QualityService', async () => {
    const ncrStore = new InMemoryNcrStore();
    const service = new QualityService(
      ncrStore,
      new InMemoryInspectionRequestStore(),
      new InMemorySnagStore(),
      new InMemoryItpStore(),
      new InMemoryMaterialApprovalStore(),
      new InMemoryCalibrationStore(),
      new InMemoryAuditScheduleStore(),
      mockEvents,
      mockTx,
      mockAccess,
    );

    const audit = await service.scheduleAudit(null, {
      tenantId: 't1',
      projectId: 'p-100',
      projectName: 'Main Hospital Site',
      auditNumber: 'AUD-9001-01',
      auditType: 'ISO 9001:2015',
      scheduledDate: '2026-07-20',
      auditorName: 'Lead ISO Auditor',
    });

    expect(audit.status).toBe('scheduled');

    // Update checklist item to non-compliant
    const updatedChecklist = [...audit.checklist];
    updatedChecklist[0] = {
      ...updatedChecklist[0],
      status: 'non_compliant',
      findings: 'Drawing register lacks QA stamp for 3 structural sheets.',
    };

    const updated = await service.updateAuditChecklist('t1', audit.id, updatedChecklist, 'in_progress');
    expect(updated.status).toBe('in_progress');
    expect(updated.checklist[0].status).toBe('non_compliant');

    // Auto-generate NCR from failed check
    const ncr = await service.generateNcrFromFailedCheck('t1', null, audit.id, 0);
    expect(ncr.ncrNumber).toBe('NCR-AUD-001');
    expect(ncr.projectId).toBe('p-100');
    expect(ncr.description).toContain('Failed ISO Audit checklist item');
    expect(ncr.description).toContain('QA stamp');

    // Retrieve again to verify link
    const fetched = await service.getAudit('t1', audit.id);
    expect(fetched?.checklist[0].ncrId).toBe(ncr.id);
  });
});
