import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { ProjectService, CbsService } from '@aura/projects';
import { CustomerInvoiceService, type RevenueRecognition, recognizeRevenue } from '@aura/finance';

interface ProjectRevenueRecognition extends RevenueRecognition {
  projectId: string;
  projectTitle: string;
  projectStatus: string;
}

/**
 * Revenue recognition (IFRS-15 cost-to-cost). Cross-module read composed at the app layer:
 * cost + EAC from Projects (CBS), contract value from the Project (carried from the contract),
 * billing from Finance AR — so neither module depends on the other.
 */
@Controller('finance/revenue-recognition')
export class RevenueRecognitionController {
  constructor(
    private readonly projects: ProjectService,
    private readonly cbs: CbsService,
    private readonly customerInvoices: CustomerInvoiceService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  async all(): Promise<ProjectRevenueRecognition[]> {
    const tenantId = this.tenant.get().tenantId;
    const projects = await this.projects.list({ tenantId });
    const invoices = await this.customerInvoices.list({ tenantId, limit: 100000 });
    const out: ProjectRevenueRecognition[] = [];
    for (const p of projects) {
      const summary = await this.cbs.getSummary(p.id);
      out.push(this.compute(p, summary, invoices));
    }
    return out;
  }

  @Get(':projectId')
  async forProject(@Param('projectId', ParseUuidOr404Pipe) projectId: string): Promise<ProjectRevenueRecognition> {
    const project = await this.projects.get(projectId);
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    const summary = await this.cbs.getSummary(projectId);
    const invoices = await this.customerInvoices.list({ tenantId: project.tenantId, limit: 100000 });
    return this.compute(project, summary, invoices);
  }

  private compute(
    project: { id: string; title: string; status: string; value: number; contractId: string | null },
    summary: { totalActual: number; totalForecast: number },
    invoices: Array<{ projectId: string | null; contractRef: string | null; subtotal: number; status: string }>,
  ): ProjectRevenueRecognition {
    // Billed = net (ex-VAT) of non-cancelled invoices tied to this project, by projectId
    // OR by contractRef (IPC-generated AR invoices carry the contract reference).
    const billedToDate = invoices
      .filter(
        (inv) =>
          inv.status !== 'cancelled' &&
          (inv.projectId === project.id || (!!project.contractId && inv.contractRef === project.contractId)),
      )
      .reduce((sum, inv) => sum + (inv.subtotal || 0), 0);

    const rr = recognizeRevenue({
      contractValue: project.value,
      costIncurred: summary.totalActual,
      estimatedTotalCost: summary.totalForecast,
      billedToDate,
    });

    return { projectId: project.id, projectTitle: project.title, projectStatus: project.status, ...rr };
  }
}
