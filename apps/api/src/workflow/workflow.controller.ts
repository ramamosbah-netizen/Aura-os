import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { WorkflowInstance } from '@aura/shared';
import { Permissions, TenantContext, WorkflowService } from '@aura/core';

interface StartDto {
  aggregateType: string;
  aggregateId: string;
  /** @deprecated Ignored. Company identity is resolved from the authenticated request. */
  companyId?: string;
  /** @deprecated Ignored. Actor identity is resolved from the authenticated request. */
  userId?: string;
}

interface TransitionDto {
  action: string;
  /** @deprecated Ignored. Actor identity is resolved from the authenticated request. */
  userId?: string;
  amount?: number;
  note?: string;
}

/**
 * Phase-0 proof of the Platform Workflow engine. The 'po.approval' definition +
 * a demo grant are seeded by WorkflowSeeder; these endpoints start and drive
 * instances. Real modules call WorkflowService from their own services.
 */
@Controller('workflows')
@Permissions('admin.workflows.manage')
export class WorkflowController {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly tenant: TenantContext,
  ) {}

  @Post(':key/start')
  start(@Param('key') key: string, @Body() dto: StartDto): Promise<WorkflowInstance> {
    const ctx = this.tenant.get();
    return this.workflow.start(key, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      aggregateType: dto.aggregateType,
      aggregateId: dto.aggregateId,
      createdBy: ctx.actorId,
    });
  }

  @Post('instances/:id/transition')
  async transition(@Param('id') id: string, @Body() dto: TransitionDto): Promise<WorkflowInstance> {
    const instance = await this.getScoped(id);
    const actorId = this.tenant.get().actorId;
    return this.workflow.transition(instance.id, dto.action, actorId, { note: dto.note, amount: dto.amount });
  }

  @Get('instances')
  list(@Query('definitionKey') definitionKey?: string, @Query('status') status?: string): Promise<WorkflowInstance[]> {
    const ctx = this.tenant.get();
    return this.workflow.listInstances({ tenantId: ctx.tenantId, companyId: ctx.companyId, definitionKey, status, limit: 100 });
  }

  @Get('instances/:id')
  async get(@Param('id') id: string): Promise<WorkflowInstance> {
    return this.getScoped(id);
  }

  private async getScoped(id: string): Promise<WorkflowInstance> {
    const found = await this.workflow.getInstance(id);
    const ctx = this.tenant.get();
    // Return 404 for both missing and out-of-scope records to avoid leaking identifiers.
    if (!found || found.tenantId !== ctx.tenantId || found.companyId !== ctx.companyId) {
      throw new NotFoundException(`workflow instance ${id} not found`);
    }
    return found;
  }
}
