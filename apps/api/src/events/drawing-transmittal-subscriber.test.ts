import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@aura/core';
import { makeEvent } from '@aura/shared';
import { DrawingTransmittalSubscriber } from './drawing-transmittal-subscriber';

const event = () => makeEvent({
  type: 'engineering.drawing.transmitted',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  actorId: 'engineer-1',
  aggregateType: 'engineering.drawing',
  aggregateId: 'd1234567-0000-4000-8000-000000000001',
  payload: {
    code: 'ELV-CCTV-SD-001', title: 'CCTV layout', revision: '2',
    projectId: 'project-1', projectName: 'Tower', recipient: 'Consultant', purpose: 'For Construction', responsibilityId: 'responsibility-1',
  },
});

const draft = {
  id: 'transmittal-1', tenantId: 'tenant-1', companyId: 'company-1',
  code: 'TR-d1234567-0000-4000-8000-000000000001-2', title: 'ELV-CCTV-SD-001 Rev 2 — CCTV layout',
  projectId: 'project-1', projectName: 'Tower', sender: 'Engineering', recipient: 'Consultant',
  purpose: 'For Construction', status: 'draft', kind: 'internal_release', sentAt: null, sentBy: null,
};

describe('DrawingTransmittalSubscriber', () => {
  it('creates, sends and links the controlled conveyance with recipient and purpose', async () => {
    const bus = new EventBus();
    const doccontrol = {
      listTransmittals: vi.fn().mockResolvedValue([]),
      createTransmittal: vi.fn().mockResolvedValue(draft),
      releaseInternally: vi.fn().mockResolvedValue({ ...draft, status: 'sent', sentAt: '2026-09-15T10:00:00.000Z', sentBy: 'engineer-1' }),
    };
    const engineering = { linkTransmittal: vi.fn().mockResolvedValue(undefined) };
    const responsibilities = { linkEngineeringRelease: vi.fn().mockResolvedValue(undefined) };
    new DrawingTransmittalSubscriber(bus, doccontrol as never, engineering as never, responsibilities as never).onModuleInit();

    await bus.publish(event());

    // AN INTERNAL RELEASE, CREATED BY A NAMED ENGINEER. Both fields are the wave-C correction: the
    // reactor used to pass no `createdBy` and `sendTransmittal(…, null, …)`, and because both service
    // methods skip their permission check when no actor is supplied, NOT NAMING THE ACTOR WAS THE
    // MECHANISM THAT SKIPPED THE GUARD — while the same null emptied the provenance column.
    expect(doccontrol.createTransmittal).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1', recipient: 'Consultant', purpose: 'For Construction',
      kind: 'internal_release', createdBy: 'engineer-1',
    }));
    // `releaseInternally`, not `sendTransmittal`: it refuses anything that is not an internal
    // release, so this path cannot convey a document to the client however it is called.
    expect(doccontrol.releaseInternally).toHaveBeenCalledWith('tenant-1', 'engineer-1', 'transmittal-1');
    expect(engineering.linkTransmittal).toHaveBeenCalledWith('tenant-1', event().aggregateId, 'TR-d1234567-0000-4000-8000-000000000001-2');
    expect(responsibilities.linkEngineeringRelease).toHaveBeenCalledWith(expect.objectContaining({
      id: 'responsibility-1', projectId: 'project-1', drawingId: event().aggregateId,
      drawingCode: 'ELV-CCTV-SD-001', revision: '2', transmittalRef: draft.code, actorId: 'engineer-1',
    }));
  });

  it('resumes a replayed event and repairs a missing drawing link without duplicating the transmittal', async () => {
    const bus = new EventBus();
    const doccontrol = {
      listTransmittals: vi.fn().mockResolvedValue([{ ...draft, status: 'sent' }]),
      createTransmittal: vi.fn(),
      releaseInternally: vi.fn(),
    };
    const engineering = { linkTransmittal: vi.fn().mockResolvedValue(undefined) };
    const responsibilities = { linkEngineeringRelease: vi.fn().mockResolvedValue(undefined) };
    new DrawingTransmittalSubscriber(bus, doccontrol as never, engineering as never, responsibilities as never).onModuleInit();

    const delivery = event();
    await bus.publish(delivery);

    expect(doccontrol.createTransmittal).not.toHaveBeenCalled();
    expect(doccontrol.releaseInternally).not.toHaveBeenCalled();
    expect(engineering.linkTransmittal).toHaveBeenCalledWith('tenant-1', delivery.aggregateId, 'TR-d1234567-0000-4000-8000-000000000001-2');
    expect(responsibilities.linkEngineeringRelease).toHaveBeenCalledTimes(1);
  });

  it('propagates failures so the durable event handler can retry', async () => {
    const bus = new EventBus();
    const doccontrol = {
      listTransmittals: vi.fn().mockResolvedValue([]),
      createTransmittal: vi.fn().mockRejectedValue(new Error('doccontrol unavailable')),
      releaseInternally: vi.fn(),
    };
    new DrawingTransmittalSubscriber(bus, doccontrol as never, { linkTransmittal: vi.fn() } as never, { linkEngineeringRelease: vi.fn() } as never).onModuleInit();

    await expect(bus.publish(event())).rejects.toThrow('doccontrol unavailable');
  });
});
