import { BadRequestException, Body, Controller, Get, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Permissions, TenantContext, UsersService } from '@aura/core';
import {
  PROJECT_RESPONSIBILITY_WORKSTREAMS,
  ProjectResponsibilityService,
  type ProjectResponsibility,
  type ProjectResponsibilityWorkstream,
} from '@aura/projects';

interface ResponsibilityView extends ProjectResponsibility {
  assigneeName: string;
  assigneeEmail: string;
  canAct: boolean;
}

@Controller('projects')
export class ProjectResponsibilitiesController {
  constructor(
    private readonly responsibilities: ProjectResponsibilityService,
    private readonly users: UsersService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('projects.responsibility.read')
  @Get(':projectId/responsibilities')
  async list(@Param('projectId') projectId: string): Promise<ResponsibilityView[]> {
    const ctx = this.tenant.get();
    const rows = await this.responsibilities.list({ tenantId: ctx.tenantId, projectId, limit: 1000 });
    return rows.map((row) => this.view(row, ctx.actorId));
  }

  @Permissions('projects.responsibility.create')
  @Post(':projectId/responsibilities')
  async assign(
    @Param('projectId') projectId: string,
    @Body() dto: { workstream?: string; title?: string; description?: string | null; assigneeId?: string; dueDate?: string | null },
  ): Promise<ResponsibilityView> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new UnauthorizedException('A signed-in user is required');
    const title = dto?.title?.trim();
    const assigneeId = dto?.assigneeId?.trim();
    if (!title) throw new BadRequestException('title is required');
    if (!assigneeId) throw new BadRequestException('assigneeId is required');
    if (!PROJECT_RESPONSIBILITY_WORKSTREAMS.includes(dto.workstream as ProjectResponsibilityWorkstream)) {
      throw new BadRequestException(`workstream must be one of ${PROJECT_RESPONSIBILITY_WORKSTREAMS.join(', ')}`);
    }
    if (dto.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dto.dueDate)) throw new BadRequestException('dueDate must be YYYY-MM-DD');
    const row = await this.responsibilities.assign({
      tenantId: ctx.tenantId,
      projectId,
      workstream: dto.workstream as ProjectResponsibilityWorkstream,
      title,
      description: dto.description ?? null,
      assigneeId,
      assignedBy: ctx.actorId,
      dueDate: dto.dueDate ?? null,
    });
    return this.view(row, ctx.actorId);
  }

  @Permissions('projects.responsibility.update')
  @Post(':projectId/responsibilities/:id/accept')
  accept(@Param('projectId') projectId: string, @Param('id') id: string): Promise<ResponsibilityView> {
    return this.move(projectId, id, 'accept');
  }

  @Permissions('projects.responsibility.update')
  @Post(':projectId/responsibilities/:id/start')
  start(@Param('projectId') projectId: string, @Param('id') id: string): Promise<ResponsibilityView> {
    return this.move(projectId, id, 'start');
  }

  @Permissions('projects.responsibility.update')
  @Post(':projectId/responsibilities/:id/complete')
  complete(@Param('projectId') projectId: string, @Param('id') id: string): Promise<ResponsibilityView> {
    return this.move(projectId, id, 'complete');
  }

  private async move(projectId: string, id: string, action: 'accept' | 'start' | 'complete'): Promise<ResponsibilityView> {
    const ctx = this.tenant.get();
    if (!ctx.actorId) throw new UnauthorizedException('A signed-in user is required');
    const row = await this.responsibilities[action](id, projectId, ctx.actorId);
    return this.view(row, ctx.actorId);
  }

  private view(row: ProjectResponsibility, actorId: string | null): ResponsibilityView {
    const user = this.users.get(row.tenantId, row.assigneeId);
    return {
      ...row,
      assigneeName: user?.displayName || row.assigneeId,
      assigneeEmail: user?.email ?? '',
      canAct: row.assigneeId === actorId,
    };
  }
}
