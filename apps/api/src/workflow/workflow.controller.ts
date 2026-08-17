import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { WorkflowInstance } from '@aura/shared';
import { Permissions, TenantContext, WorkflowService } from '@aura/core';

interface StartDto {
  aggregateType: string;
  aggregateId: string;
  /** @deprecated Refused — see refuseSuppliedIdentity. */
  companyId?: string;
  /** @deprecated Refused — see refuseSuppliedIdentity. */
  userId?: string;
}

interface TransitionDto {
  action: string;
  /** @deprecated Refused — see refuseSuppliedIdentity. */
  userId?: string;
  amount?: number;
  note?: string;
}

/**
 * `userId` and `companyId` used to select the actor and the company from the request body. Both
 * are now resolved from the authenticated session, so honouring them would be impersonation and
 * a cross-company write.
 *
 * They are REFUSED rather than ignored. Accepting a field and quietly discarding it leaves every
 * caller believing it still works and turns a semantic contract change into a silent one — the
 * audit trail would name the session actor while the caller believed it named theirs. A 400 shows
 * up in the caller's logs immediately.
 *
 * `companyId` is refused for a second reason: in a multi-company tenant, "which company am I
 * acting in" is authenticated context, not a caller-selected parameter. If acting in another
 * company is ever needed, it belongs in an explicit, permission-checked context switch.
 */
function refuseSuppliedIdentity(dto: { userId?: unknown; companyId?: unknown }): void {
  const supplied = (['userId', 'companyId'] as const).filter((field) => dto[field] !== undefined);
  if (supplied.length === 0) return;
  throw new BadRequestException(
    `${supplied.join(' and ')} cannot be supplied — identity is resolved from the authenticated session`,
  );
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
  // async so a refusal rejects rather than throwing synchronously out of the handler call.
  async start(@Param('key') key: string, @Body() dto: StartDto): Promise<WorkflowInstance> {
    refuseSuppliedIdentity(dto);
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
    refuseSuppliedIdentity(dto);
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
