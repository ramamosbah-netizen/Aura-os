import type { DailyReport } from './domain/daily-report';
import type { DelayLog } from './domain/delay-log';
import type { MaterialConsumption } from './domain/material-consumption';
import type { SiteInstruction } from './domain/site-instruction';
import type { LabourAllocation } from './domain/labour-allocation';
import type { DailyReportStore, DelayLogStore, MaterialConsumptionStore, SiteInstructionStore, LabourAllocationStore } from './store.interface';

export class InMemoryLabourAllocationStore implements LabourAllocationStore {
  private readonly items = new Map<string, LabourAllocation>();

  async save(allocation: LabourAllocation): Promise<void> {
    this.items.set(allocation.id, { ...allocation });
  }

  async findById(id: string, tenantId: string): Promise<LabourAllocation | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<LabourAllocation[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async findAll(tenantId: string): Promise<LabourAllocation[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }
}

export class InMemoryDailyReportStore implements DailyReportStore {
  private readonly items = new Map<string, DailyReport>();

  async save(report: DailyReport): Promise<void> {
    this.items.set(report.id, { ...report });
  }

  async findById(id: string, tenantId: string): Promise<DailyReport | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<DailyReport[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<DailyReport[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryDelayLogStore implements DelayLogStore {
  private readonly items = new Map<string, DelayLog>();

  async save(log: DelayLog): Promise<void> {
    this.items.set(log.id, { ...log });
  }

  async findById(id: string, tenantId: string): Promise<DelayLog | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<DelayLog[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<DelayLog[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryMaterialConsumptionStore implements MaterialConsumptionStore {
  private readonly items = new Map<string, MaterialConsumption>();

  async save(consumption: MaterialConsumption): Promise<void> {
    this.items.set(consumption.id, { ...consumption });
  }

  async findById(id: string, tenantId: string): Promise<MaterialConsumption | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<MaterialConsumption[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<MaterialConsumption[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemorySiteInstructionStore implements SiteInstructionStore {
  private readonly items = new Map<string, SiteInstruction>();

  async save(instruction: SiteInstruction): Promise<void> {
    this.items.set(instruction.id, { ...instruction });
  }

  async findById(id: string, tenantId: string): Promise<SiteInstruction | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<SiteInstruction[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<SiteInstruction[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
