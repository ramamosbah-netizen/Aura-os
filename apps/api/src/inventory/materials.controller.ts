import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Permissions, TenantContext } from '@aura/core';
import { type Material, MaterialService } from '@aura/inventory';

class CreateMaterialDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsString() uom!: string;
  @IsOptional() @IsString() specification?: string | null;
  @IsOptional() @IsString() manufacturer?: string | null;
  @IsOptional() @IsString() model?: string | null;
}

/**
 * `code` and `uom` are DECLARED here precisely because they may not be changed.
 *
 * Leaving them out looked like the stronger statement and was the weaker one: the global validation
 * pipe runs with `whitelist: true`, so an undeclared property is stripped before the service ever
 * sees it, and a caller asking to re-code a material would get a cheerful 200 and no change. They
 * are accepted into the DTO so the service can REFUSE them out loud.
 */
class EditMaterialDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() specification?: string | null;
  @IsOptional() @IsString() manufacturer?: string | null;
  @IsOptional() @IsString() model?: string | null;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() uom?: string;
}

class MaterialStatusDto {
  @IsIn(['active', 'obsolete']) status!: 'active' | 'obsolete';
}

/**
 * The material master (Wave 4, `BUY-01`) — Inventory's catalogue of WHAT things are.
 *
 * Permissions derive from the route: `inventory.material.read` / `.create` / `.update`. The
 * Storekeeper holds `inventory.*` and maintains the catalogue; every role with read access to
 * Inventory — Buyer and Procurement Manager among them — can browse it to raise demand.
 */
@Controller('inventory/materials')
export class MaterialsController {
  constructor(
    private readonly materials: MaterialService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateMaterialDto): Promise<Material> {
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    if (!dto?.uom?.trim()) throw new BadRequestException('uom is required');
    const ctx = this.tenant.get();
    return this.materials.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      code: dto.code,
      name: dto.name,
      uom: dto.uom,
      specification: dto.specification ?? null,
      manufacturer: dto.manufacturer ?? null,
      model: dto.model ?? null,
      createdBy: ctx.actorId ?? null,
    });
  }

  @Get()
  list(
    @Query('status') status?: 'active' | 'obsolete',
    @Query('search') search?: string,
  ): Promise<Material[]> {
    return this.materials.list(this.tenant.get().tenantId, { status, search });
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Material> {
    return this.materials.get(id, this.tenant.get().tenantId);
  }

  @Patch(':id')
  edit(@Param('id') id: string, @Body() dto: EditMaterialDto): Promise<Material> {
    return this.materials.edit(id, dto, this.tenant.get().tenantId);
  }

  /**
   * Retiring or reinstating a material is UPDATING it, so the permission says so. Left to route
   * derivation this would become `inventory.material.status` — a separate word for the same
   * authority, which is how one action ends up needing two permissions nobody granted together.
   */
  @Patch(':id/status')
  @Permissions('inventory.material.update')
  setStatus(@Param('id') id: string, @Body() dto: MaterialStatusDto): Promise<Material> {
    return this.materials.setStatus(id, dto.status, this.tenant.get().tenantId);
  }
}
