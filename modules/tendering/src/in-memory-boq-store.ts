import { Injectable } from '@nestjs/common';
import { type Id } from '@aura/shared';
import { type BOQ, type BOQItem } from './domain/boq';
import { type BOQStore } from './boq-store';

@Injectable()
export class InMemoryBOQStore implements BOQStore {
  private readonly boqs = new Map<string, BOQ>();
  private readonly items = new Map<string, BOQItem>();

  async saveBOQ(boq: BOQ): Promise<void> {
    this.boqs.set(boq.id, { ...boq });
  }

  async findBOQ(tenantId: string, id: Id): Promise<BOQ | null> {
    const found = this.boqs.get(id);
    return found && found.tenantId === tenantId ? { ...found } : null;
  }

  async getBOQByTender(tenantId: string, tenderId: Id): Promise<BOQ | null> {
    const list = Array.from(this.boqs.values());
    const found = list.find((b) => b.tenderId === tenderId && b.tenantId === tenantId);
    return found ? { ...found } : null;
  }

  async saveBOQItem(item: BOQItem): Promise<void> {
    this.items.set(item.id, { ...item });
  }

  async deleteBOQItem(tenantId: string, id: Id): Promise<void> {
    const found = this.items.get(id);
    if (found && found.tenantId === tenantId) {
      this.items.delete(id);
    }
  }

  async getBOQItems(tenantId: string, boqId: Id): Promise<BOQItem[]> {
    return Array.from(this.items.values())
      .filter((item) => item.boqId === boqId && item.tenantId === tenantId)
      .sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true, sensitivity: 'base' }));
  }

  async getBOQItem(tenantId: string, id: Id): Promise<BOQItem | null> {
    const item = this.items.get(id);
    return item && item.tenantId === tenantId ? { ...item } : null;
  }
}
