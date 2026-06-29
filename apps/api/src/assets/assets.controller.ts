import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type Asset,
  type AssetMaintenance,
  type AssetInspection,
  type DepreciationSchedule,
  type DepreciationMethod,
  AssetsService,
} from '@aura/assets';

interface CreateAssetDto {
  name: string;
  serialNumber: string;
  category: string;
  purchaseDate: string;
  purchaseCost: number;
  status?: Asset['status'];
  warrantyExpiry?: string | null;
  nextCalibrationDate?: string | null;
  nextInspectionDate?: string | null;
}

interface ScheduleMaintenanceDto {
  assetId: string;
  date: string;
  description: string;
  cost?: number;
}

interface CompleteMaintenanceDto {
  actualCost: number;
}

interface RecordInspectionDto {
  assetId: string;
  date: string;
  inspector: string;
  result: 'pass' | 'fail';
  notes?: string | null;
}

@Controller('assets')
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Assets ────────────────────────────────────────────────────────────────

  @Post()
  createAsset(@Body() dto: CreateAssetDto): Promise<Asset> {
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    if (!dto?.serialNumber?.trim()) throw new BadRequestException('serialNumber is required');
    if (!dto?.category?.trim()) throw new BadRequestException('category is required');
    if (!dto?.purchaseDate?.trim()) throw new BadRequestException('purchaseDate is required');

    const ctx = this.tenant.get();
    return this.assetsService.createAsset(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      name: dto.name,
      serialNumber: dto.serialNumber,
      category: dto.category,
      purchaseDate: dto.purchaseDate,
      purchaseCost: Number(dto.purchaseCost || 0),
      status: dto.status,
      warrantyExpiry: dto.warrantyExpiry,
      nextCalibrationDate: dto.nextCalibrationDate,
      nextInspectionDate: dto.nextInspectionDate,
    });
  }

  @Delete(':id')
  async deleteAsset(@Param('id') id: string): Promise<{ success: boolean }> {
    const ctx = this.tenant.get();
    const success = await this.assetsService.deleteAsset(ctx.tenantId, ctx.actorId, id);
    return { success };
  }

  @Get()
  listAssets(): Promise<Asset[]> {
    const ctx = this.tenant.get();
    return this.assetsService.listAssets(ctx.tenantId);
  }

  @Get(':id/depreciation')
  async depreciation(
    @Param('id') id: string,
    @Query('usefulLifeMonths') usefulLifeMonths?: string,
    @Query('salvageValue') salvageValue?: string,
    @Query('method') method?: DepreciationMethod,
    @Query('asOf') asOf?: string,
  ): Promise<DepreciationSchedule> {
    const life = Number(usefulLifeMonths);
    if (!(life > 0)) throw new BadRequestException('usefulLifeMonths must be a positive integer');
    const ctx = this.tenant.get();
    try {
      return await this.assetsService.depreciation(ctx.tenantId, id, {
        usefulLifeMonths: life,
        salvageValue: salvageValue !== undefined ? Number(salvageValue) : undefined,
        method: method === 'declining_balance' ? 'declining_balance' : 'straight_line',
        asOf,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── Maintenance ────────────────────────────────────────────────────────────

  @Post('maintenance')
  scheduleMaintenance(@Body() dto: ScheduleMaintenanceDto): Promise<AssetMaintenance> {
    if (!dto?.assetId) throw new BadRequestException('assetId is required');
    if (!dto?.date?.trim()) throw new BadRequestException('date is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');

    const ctx = this.tenant.get();
    return this.assetsService.scheduleMaintenance(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      assetId: dto.assetId,
      date: dto.date,
      description: dto.description,
      cost: dto.cost !== undefined ? Number(dto.cost) : undefined,
    });
  }

  @Put('maintenance/:id/complete')
  completeMaintenance(
    @Param('id') id: string,
    @Body() dto: CompleteMaintenanceDto,
  ): Promise<AssetMaintenance> {
    if (dto?.actualCost === undefined || dto.actualCost < 0) {
      throw new BadRequestException('actualCost must be >= 0');
    }

    const ctx = this.tenant.get();
    return this.assetsService.completeMaintenance(ctx.tenantId, ctx.actorId, id, Number(dto.actualCost));
  }

  @Get('maintenance')
  listMaintenance(): Promise<AssetMaintenance[]> {
    const ctx = this.tenant.get();
    return this.assetsService.listMaintenance(ctx.tenantId);
  }

  // ── Inspections ────────────────────────────────────────────────────────────

  @Post('inspections')
  recordInspection(@Body() dto: RecordInspectionDto): Promise<AssetInspection> {
    if (!dto?.assetId) throw new BadRequestException('assetId is required');
    if (!dto?.date?.trim()) throw new BadRequestException('date is required');
    if (!dto?.inspector?.trim()) throw new BadRequestException('inspector is required');
    if (!dto?.result || !['pass', 'fail'].includes(dto.result)) {
      throw new BadRequestException('result must be pass or fail');
    }

    const ctx = this.tenant.get();
    return this.assetsService.recordInspection(ctx.actorId, {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      assetId: dto.assetId,
      date: dto.date,
      inspector: dto.inspector,
      result: dto.result,
      notes: dto.notes,
    });
  }

  @Get('inspections')
  listInspections(): Promise<AssetInspection[]> {
    const ctx = this.tenant.get();
    return this.assetsService.listInspections(ctx.tenantId);
  }
}
