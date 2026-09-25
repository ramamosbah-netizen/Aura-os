import { randomUUID } from 'node:crypto';
import type { ApprovedChecklistPort, ChecklistPointFact, SystemChecklistFact } from './ports';

/**
 * TEST FIXTURE ONLY — an in-memory stand-in for Quality's approved system checklists.
 *
 * Every point a test executes is declared explicitly by that test: nothing here invents a technical
 * checklist for any system, and nothing is imported by the module itself.
 */
export class ApprovedChecklistFixture implements ApprovedChecklistPort {
  private readonly facts = new Map<string, SystemChecklistFact>();
  private readonly templates = new Map<string, number>();

  /** An approved revision for (project, system) carrying exactly the points given. */
  approve(input: {
    projectId: string;
    system: string;
    points: Array<{ code: string; activity: string; acceptanceCriteria?: string; mandatory?: boolean }>;
    revision?: number;
    status?: string;
  }): SystemChecklistFact {
    const revision = input.revision ?? 1;
    const fact: SystemChecklistFact = {
      itpId: randomUUID(),
      projectId: input.projectId,
      system: input.system,
      revision,
      reference: `ITP-${input.system.toUpperCase().replace(/_/g, '-')}`,
      title: `${input.system} commissioning checklist`,
      status: input.status ?? 'approved',
      approvedBy: input.status && input.status !== 'approved' ? null : 'u-qaqc-2',
      approvedAt: input.status && input.status !== 'approved' ? null : new Date().toISOString(),
      sourceTemplateVersion: 1,
      points: input.points.map((p): ChecklistPointFact => ({
        code: p.code,
        activity: p.activity,
        method: null,
        acceptanceCriteria: p.acceptanceCriteria ?? 'As specified',
        mandatory: p.mandatory ?? true,
        pointType: 'witness',
      })),
    };
    this.facts.set(fact.itpId, fact);
    this.templates.set(input.system, 1);
    return fact;
  }

  async readSystemChecklist(_tenantId: string, itpId: string): Promise<SystemChecklistFact | null> {
    return this.facts.get(itpId) ?? null;
  }

  async listProjectSystemChecklists(_tenantId: string, projectId: string): Promise<SystemChecklistFact[]> {
    return [...this.facts.values()].filter((f) => f.projectId === projectId);
  }

  async listPublishedTemplateSystems(): Promise<Array<{ system: string; publishedVersion: number | null }>> {
    return [...this.templates.entries()].map(([system, publishedVersion]) => ({ system, publishedVersion }));
  }
}
