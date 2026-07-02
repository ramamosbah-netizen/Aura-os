import type { Ncr } from './domain/ncr';
import type { InspectionRequest } from './domain/inspection-request';
import type { Snag } from './domain/snag';
import type { Itp } from './domain/itp';
import type { MaterialApproval } from './domain/material-approval';
import type { Calibration } from './domain/calibration';
import type { AuditSchedule } from './domain/audit-schedule';
import { type Page, type PageParams, paginate } from '@aura/shared';
import type { NcrStore, InspectionRequestStore, SnagStore, ItpStore, MaterialApprovalStore, CalibrationStore, AuditScheduleStore, MaterialApprovalFilter } from './store.interface';

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

  async listPaged(tenantId: string, page: PageParams): Promise<Page<Ncr>> {
    return paginate(await this.findAll(tenantId), page);
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

  async listPaged(tenantId: string, page: PageParams): Promise<Page<InspectionRequest>> {
    return paginate(await this.findAll(tenantId), page);
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

  async listPaged(tenantId: string, page: PageParams): Promise<Page<Snag>> {
    return paginate(await this.findAll(tenantId), page);
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

  async listPaged(tenantId: string, page: PageParams): Promise<Page<Itp>> {
    const all = await this.findAll(tenantId);
    return paginate(all.map((i) => ({ ...i, points: i.points.map((p) => ({ ...p })) })), page);
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

  async listPaged(filter: MaterialApprovalFilter, page: PageParams): Promise<Page<MaterialApproval>> {
    let all = Array.from(this.items.values());
    if (filter.tenantId) {
      all = all.filter((i) => i.tenantId === filter.tenantId);
    }
    if (filter.projectId) {
      all = all.filter((i) => i.projectId === filter.projectId);
    }
    if (filter.status) {
      all = all.filter((i) => i.status === filter.status);
    }
    if (filter.supplier) {
      all = all.filter((i) => i.supplier.toLowerCase() === filter.supplier!.toLowerCase());
    }
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return paginate(all.map((item) => ({ ...item })), page);
  }
}

export class InMemoryAuditScheduleStore implements AuditScheduleStore {
  private readonly items = new Map<string, AuditSchedule>();

  async save(audit: AuditSchedule): Promise<void> {
    this.items.set(audit.id, { ...audit, checklist: audit.checklist.map((c) => ({ ...c })) });
  }

  async findById(id: string, tenantId: string): Promise<AuditSchedule | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item, checklist: item.checklist.map((c) => ({ ...c })) };
  }

  async findByProject(projectId: string, tenantId: string): Promise<AuditSchedule[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .map((item) => ({ ...item, checklist: item.checklist.map((c) => ({ ...c })) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<AuditSchedule[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .map((item) => ({ ...item, checklist: item.checklist.map((c) => ({ ...c })) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
