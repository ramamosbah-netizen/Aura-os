import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type Project, type ProjectStatus, ProjectService } from '@aura/projects';

interface CreateProjectDto {
  title: string;
  reference?: string;
  contractId?: string | null;
  contractTitle?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  status?: ProjectStatus;
  value?: number;
}

/** Projects API — stamps tenant/actor from context, delegates to ProjectService. */
@Controller('projects/projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateProjectDto): Promise<Project> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.projects.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      contractId: dto.contractId ?? null,
      contractTitle: dto.contractTitle ?? null,
      accountId: dto.accountId ?? null,
      accountName: dto.accountName ?? null,
      status: dto.status,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('contractId') contractId?: string,
  ): Promise<Project[]> {
    return this.projects.list({ status, accountId, contractId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Project> {
    const found = await this.projects.get(id);
    if (!found) throw new NotFoundException(`project ${id} not found`);
    return found;
  }
}
