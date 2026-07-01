import type { Ncr } from './domain/ncr';
import type { InspectionRequest } from './domain/inspection-request';
import type { Snag } from './domain/snag';
import type { Itp } from './domain/itp';
import type { MaterialApproval } from './domain/material-approval';
import type { Calibration } from './domain/calibration';
import type { NcrStore, InspectionRequestStore, SnagStore, ItpStore, MaterialApprovalStore, CalibrationStore } from './store.interface';

export class InMemoryCalibrationStore implements CalibrationStore {
  private readonly items = new Map<string, Calibration>();

  async save(cal: Calibration): Promise<void> {
    this.items.set(cal.id, { ...cal });
  }

  async findById(id: string, tenantId: string): Promise<Calibration | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<Calibration[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<Calibration[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryNcrStore implements NcrStore {
  private readonly items = new Map<string, Ncr>();

  async save(ncr: Ncr): Promise<void> {
    this.items.set(ncr.id, { ...ncr });
  }

  async findById(id: string, tenantId: string): Promise<Ncr | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<Ncr[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<Ncr[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryInspectionRequestStore implements InspectionRequestStore {
  private readonly items = new Map<string, InspectionRequest>();

  async save(ir: InspectionRequest): Promise<void> {
    this.items.set(ir.id, { ...ir });
  }

  async findById(id: string, tenantId: string): Promise<InspectionRequest | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<InspectionRequest[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<InspectionRequest[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemorySnagStore implements SnagStore {
  private readonly items = new Map<string, Snag>();

  async save(snag: Snag): Promise<void> {
    this.items.set(snag.id, { ...snag });
  }

  async findById(id: string, tenantId: string): Promise<Snag | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<Snag[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<Snag[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryItpStore implements ItpStore {
  private items = new Map<string, Itp>();

  async save(itp: Itp): Promise<void> {
    this.items.set(itp.id, { ...itp, points: itp.points.map((p) => ({ ...p })) });
  }

  async findById(id: string, tenantId: string): Promise<Itp | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item, points: item.points.map((p) => ({ ...p })) };
  }

  async findByProject(projectId: string, tenantId: string): Promise<Itp[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<Itp[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryMaterialApprovalStore implements MaterialApprovalStore {
  private items = new Map<string, MaterialApproval>();

  async save(mar: MaterialApproval): Promise<void> {
    this.items.set(mar.id, { ...mar });
  }

  async findById(id: string, tenantId: string): Promise<MaterialApproval | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<MaterialApproval[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<MaterialApproval[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
