import type { HseIncident } from './domain/hse-incident';
import type { PermitToWork } from './domain/permit-to-work';
import type { CapaAction } from './domain/capa-action';
import type { ToolboxTalk } from './domain/toolbox-talk';
import type { RiskAssessment } from './domain/risk-assessment';
import type { HseIncidentStore, PermitToWorkStore, CapaActionStore, ToolboxTalkStore, RiskAssessmentStore } from './store.interface';

export class InMemoryRiskAssessmentStore implements RiskAssessmentStore {
  private readonly items = new Map<string, RiskAssessment>();

  async save(ra: RiskAssessment): Promise<void> {
    this.items.set(ra.id, { ...ra });
  }

  async findById(id: string, tenantId: string): Promise<RiskAssessment | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<RiskAssessment[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<RiskAssessment[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryHseIncidentStore implements HseIncidentStore {
  private readonly items = new Map<string, HseIncident>();

  async save(incident: HseIncident): Promise<void> {
    this.items.set(incident.id, { ...incident });
  }

  async findById(id: string, tenantId: string): Promise<HseIncident | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<HseIncident[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<HseIncident[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryPermitToWorkStore implements PermitToWorkStore {
  private readonly items = new Map<string, PermitToWork>();

  async save(permit: PermitToWork): Promise<void> {
    this.items.set(permit.id, { ...permit });
  }

  async findById(id: string, tenantId: string): Promise<PermitToWork | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<PermitToWork[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<PermitToWork[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryCapaActionStore implements CapaActionStore {
  private readonly items = new Map<string, CapaAction>();

  async save(action: CapaAction): Promise<void> {
    this.items.set(action.id, { ...action });
  }

  async findById(id: string, tenantId: string): Promise<CapaAction | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<CapaAction[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<CapaAction[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryToolboxTalkStore implements ToolboxTalkStore {
  private readonly items = new Map<string, ToolboxTalk>();

  async save(talk: ToolboxTalk): Promise<void> {
    this.items.set(talk.id, { ...talk });
  }

  async findById(id: string, tenantId: string): Promise<ToolboxTalk | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<ToolboxTalk[]> {
    return Array.from(this.items.values())
      .filter((i) => i.projectId === projectId && i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<ToolboxTalk[]> {
    return Array.from(this.items.values())
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
