import { describe, expect, it, vi } from 'vitest';
import { makeBOQ, makeBOQItem } from './boq';
import { TenderService } from '../tender.service';
import { InMemoryTenderStore } from '../in-memory-tender-store';
import { InMemoryBOQStore } from '../in-memory-boq-store';
import { type EventStore, type AccessService, type NumberingService, type AuditService, type TxRunner } from '@aura/core';

describe('tendering BOQ and BOQItem models', () => {
  it('creates a BOQ with uuid and date stamps', () => {
    const boq = makeBOQ({ tenantId: 't-123', tenderId: 'tender-456' });
    expect(boq.id).toBeTruthy();
    expect(boq.tenantId).toBe('t-123');
    expect(boq.tenderId).toBe('tender-456');
    expect(boq.createdAt).toBeTruthy();
  });

  it('creates a BOQItem and calculates totalAmount correctly', () => {
    const item = makeBOQItem({
      tenantId: 't-123',
      boqId: 'boq-456',
      itemCode: '1.1',
      description: 'Excavation & Shoring',
      unit: 'm3',
      quantity: 50,
      rate: 120,
      ifcGuid: 'IFC-GUID-abc-123',
    });

    expect(item.id).toBeTruthy();
    expect(item.itemCode).toBe('1.1');
    expect(item.description).toBe('Excavation & Shoring');
    expect(item.unit).toBe('m3');
    expect(item.quantity).toBe(50);
    expect(item.rate).toBe(120);
    expect(item.totalAmount).toBe(6000); // 50 * 120
    expect(item.ifcGuid).toBe('IFC-GUID-abc-123');
  });

  it('throws error when validation fails on BOQItem creation', () => {
    expect(() =>
      makeBOQItem({
        tenantId: 't-123',
        boqId: 'boq-456',
        itemCode: '1.1',
        description: 'Excavation',
        unit: 'm3',
        quantity: -10,
        rate: 5,
      })
    ).toThrow('Quantity cannot be negative');

    expect(() =>
      makeBOQItem({
        tenantId: 't-123',
        boqId: 'boq-456',
        itemCode: '1.1',
        description: 'Excavation',
        unit: 'm3',
        quantity: 10,
        rate: -5,
      })
    ).toThrow('Rate cannot be negative');

    expect(() =>
      makeBOQItem({
        tenantId: 't-123',
        boqId: 'boq-456',
        itemCode: '',
        description: 'Excavation',
        unit: 'm3',
        quantity: 10,
        rate: 5,
      })
    ).toThrow('Item code is required');
  });
});

describe('TenderService BOQ Integration Workflows', () => {
  const tenderStore = new InMemoryTenderStore();
  const boqStore = new InMemoryBOQStore();
  
  // Mock dependencies
  const mockEvents = {
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventStore;
  const mockAccess = { assert: vi.fn() } as unknown as AccessService;
  const mockNumbering = { generateNextNumber: vi.fn().mockResolvedValue('TND-2026-001') } as unknown as NumberingService;
  const mockAudit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const mockTx = { run: (fn: (h: unknown) => unknown) => fn(null) } as unknown as TxRunner;

  const service = new TenderService(tenderStore, boqStore, mockEvents, mockTx, mockAccess, mockNumbering, mockAudit);

  it('performs closed-loop recalculation of tender value when BOQ items change', async () => {
    // 1. Create a tender
    const tender = await service.create({
      tenantId: 't-999',
      title: 'Airport Runway Expansion',
      value: 0,
    });

    expect(tender.value).toBe(0);

    // 2. Fetch or create BOQ
    const { boq, items } = await service.getOrCreateBOQ('t-999', null, tender.id);
    expect(boq).toBeTruthy();
    expect(items.length).toBe(0);

    // 3. Add first item to BOQ (Concrete works: 100m3 @ 300 AED)
    const item1 = await service.addBOQItem('t-999', null, boq.id, {
      itemCode: '1.1',
      description: 'Concrete Foundation Class 40',
      unit: 'm3',
      quantity: 100,
      rate: 300,
    });
    expect(item1.totalAmount).toBe(30000);

    // Verify Tender value has updated to 30000
    const tenderAfterItem1 = await service.get(tender.id);
    expect(tenderAfterItem1?.value).toBe(30000);

    // 4. Add second item (Steel reinforcing: 5 tons @ 4000 AED)
    const item2 = await service.addBOQItem('t-999', null, boq.id, {
      itemCode: '1.2',
      description: 'High-Tensile Reinforcing Steel',
      unit: 'ton',
      quantity: 5,
      rate: 4000,
    });
    expect(item2.totalAmount).toBe(20000);

    // Verify Tender value is now 50000 (30000 + 20000)
    const tenderAfterItem2 = await service.get(tender.id);
    expect(tenderAfterItem2?.value).toBe(50000);

    // 5. Update first item (Change quantity to 150m3)
    await service.updateBOQItem('t-999', item1.id, { quantity: 150 });

    // New item1 value = 150 * 300 = 45000. New tender value = 45000 + 20000 = 65000.
    const tenderAfterUpdate = await service.get(tender.id);
    expect(tenderAfterUpdate?.value).toBe(65000);

    // 6. Delete item2
    await service.deleteBOQItem('t-999', item2.id);

    // Reinforcing steel deleted, new tender value should be 45000
    const tenderAfterDelete = await service.get(tender.id);
    expect(tenderAfterDelete?.value).toBe(45000);
  });
});
