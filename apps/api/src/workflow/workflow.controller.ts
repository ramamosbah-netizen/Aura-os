import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { WorkflowInstance } from '@aura/shared';
import { TenantContext, WorkflowService } from '@aura/core';

interface StartDto {
  aggregateType: string;
  aggregateId: string;
  companyId?: string;
  userId?: string;
}

interface TransitionDto {
  action: string;
  /** Demo actor; real requests resolve the actor from auth. */
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
      companyId: dto.companyId ?? ctx.companyId,
      aggregateType: dto.aggregateType,
      aggregateId: dto.aggregateId,
      createdBy: dto.userId ?? ctx.actorId,
    });
  }

  @Post('instances/:id/transition')
  transition(@Param('id') id: string, @Body() dto: TransitionDto): Promise<WorkflowInstance> {
    const actorId = dto.userId ?? this.tenant.get().actorId;
    return this.workflow.transition(id, dto.action, actorId, { note: dto.note, amount: dto.amount });
  }

  @Get('instances')
  list(@Query('definitionKey') definitionKey?: string, @Query('status') status?: string): Promise<WorkflowInstance[]> {
    return this.workflow.listInstances({ definitionKey, status, limit: 100 });
  }

  @Get('instances/:id')
  async get(@Param('id') id: string): Promise<WorkflowInstance> {
    const found = await this.workflow.getInstance(id);
    if (!found) throw new NotFoundException(`workflow instance ${id} not found`);
    return found;
  }
}
