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
    projectId: 'project-1', projectName: 'Tower', recipient: 'Consultant', purpose: 'For Construction',
  },
});

const draft = {
  id: 'transmittal-1', tenantId: 'tenant-1', companyId: 'company-1',
  code: 'TR-d1234567-0000-4000-8000-000000000001-2', title: 'ELV-CCTV-SD-001 Rev 2 — CCTV layout',
  projectId: 'project-1', projectName: 'Tower', sender: 'Engineering', recipient: 'Consultant',
  purpose: 'For Construction', status: 'draft', sentAt: null,
};

describe('DrawingTransmittalSubscriber', () => {
  it('creates, sends and links the controlled conveyance with recipient and purpose', async () => {
    const bus = new EventBus();
    const doccontrol = {
      listTransmittals: vi.fn().mockResolvedValue([]),
      createTransmittal: vi.fn().mockResolvedValue(draft),
      sendTransmittal: vi.fn().mockResolvedValue({ ...draft, status: 'sent', sentAt: '2026-09-15T10:00:00.000Z' }),
    };
    const engineering = { linkTransmittal: vi.fn().mockResolvedValue(undefined) };
    new DrawingTransmittalSubscriber(bus, doccontrol as never, engineering as never).onModuleInit();

    await bus.publish(event());

    expect(doccontrol.createTransmittal).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1', recipient: 'Consultant', purpose: 'For Construction',
    }));
    expect(doccontrol.sendTransmittal).toHaveBeenCalledWith('tenant-1', null, 'transmittal-1');
    expect(engineering.linkTransmittal).toHaveBeenCalledWith('tenant-1', event().aggregateId, 'TR-d1234567-0000-4000-8000-000000000001-2');
  });

  it('resumes a replayed event and repairs a missing drawing link without duplicating the transmittal', async () => {
    const bus = new EventBus();
    const doccontrol = {
      listTransmittals: vi.fn().mockResolvedValue([{ ...draft, status: 'sent' }]),
      createTransmittal: vi.fn(),
      sendTransmittal: vi.fn(),
    };
    const engineering = { linkTransmittal: vi.fn().mockResolvedValue(undefined) };
    new DrawingTransmittalSubscriber(bus, doccontrol as never, engineering as never).onModuleInit();

    const delivery = event();
    await bus.publish(delivery);

    expect(doccontrol.createTransmittal).not.toHaveBeenCalled();
    expect(doccontrol.sendTransmittal).not.toHaveBeenCalled();
    expect(engineering.linkTransmittal).toHaveBeenCalledWith('tenant-1', delivery.aggregateId, 'TR-d1234567-0000-4000-8000-000000000001-2');
  });

  it('propagates failures so the durable event handler can retry', async () => {
    const bus = new EventBus();
    const doccontrol = {
      listTransmittals: vi.fn().mockResolvedValue([]),
      createTransmittal: vi.fn().mockRejectedValue(new Error('doccontrol unavailable')),
      sendTransmittal: vi.fn(),
    };
    new DrawingTransmittalSubscriber(bus, doccontrol as never, { linkTransmittal: vi.fn() } as never).onModuleInit();

    await expect(bus.publish(event())).rejects.toThrow('doccontrol unavailable');
  });
});
