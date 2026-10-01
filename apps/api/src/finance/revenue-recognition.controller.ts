import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { ProjectService, CbsService } from '@aura/projects';
import { CustomerInvoiceService } from '@aura/finance';
import { type ProjectRevenueRecognition, projectRevenueRecognition } from './revenue-recognition.read';

/**
 * Revenue recognition (IFRS-15 cost-to-cost). Cross-module read composed at the app layer:
 * cost + EAC from Projects (CBS), contract value from the Project (carried from the contract),
 * billing from Finance AR — so neither module depends on the other. The computation itself lives in
 * revenue-recognition.read.ts, shared with the executive decision view (F-10).
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
      out.push(projectRevenueRecognition(p, summary, invoices));
    }
    return out;
  }

  @Get(':projectId')
  async forProject(@Param('projectId', ParseUuidOr404Pipe) projectId: string): Promise<ProjectRevenueRecognition> {
    const project = await this.projects.get(projectId);
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    const summary = await this.cbs.getSummary(projectId);
    const invoices = await this.customerInvoices.list({ tenantId: project.tenantId, limit: 100000 });
    return projectRevenueRecognition(project, summary, invoices);
  }
}
