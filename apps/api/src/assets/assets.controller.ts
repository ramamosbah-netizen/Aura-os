import { BadRequestException, Body, Controller, Delete, Get, Header, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type Asset,
  type AssetMaintenance,
  type AssetInspection,
  type DepreciationSchedule,
  type DepreciationMethod,
  type AssetDisposal,
  type DisposalMethod,
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

  @Post(':id/restore')
  async restoreAsset(@Param('id') id: string): Promise<Asset> {
    try {
      return await this.assetsService.restoreAsset(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
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

  // ── QR tags ────────────────────────────────────────────────────────────────

  @Post('qr-tags/batch')
  async qrTagBatch(@Body() dto: { ids: string[] }) {
    if (!Array.isArray(dto?.ids) || dto.ids.length === 0) throw new BadRequestException('ids is required');
    return this.assetsService.getAssetQrTags(this.tenant.get().tenantId, dto.ids);
  }

  @Get(':id/qr-tag')
  async qrTag(@Param('id') id: string) {
    try {
      return await this.assetsService.getAssetQrTag(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
  }

  /** Raw SVG for direct printing / <img src>. */
  @Get(':id/qr-tag/svg')
  @Header('Content-Type', 'image/svg+xml')
  async qrTagSvg(@Param('id') id: string): Promise<string> {
    try {
      const { svg } = await this.assetsService.getAssetQrTag(this.tenant.get().tenantId, id);
      return svg;
    } catch (e) {
      throw new NotFoundException((e as Error).message);
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

  // ── Disposal ────────────────────────────────────────────────────────────────

  @Post('disposals')
  async disposeAsset(
    @Body() dto: { assetId: string; disposalDate: string; method: DisposalMethod; proceeds?: number; bookValue?: number; notes?: string },
  ): Promise<AssetDisposal> {
    if (!dto?.assetId) throw new BadRequestException('assetId is required');
    if (!dto?.disposalDate) throw new BadRequestException('disposalDate is required');
    if (!dto?.method) throw new BadRequestException('method is required');
    const ctx = this.tenant.get();
    try {
      return await this.assetsService.disposeAsset(ctx.actorId, {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        assetId: dto.assetId,
        disposalDate: dto.disposalDate,
        method: dto.method,
        proceeds: dto.proceeds,
        bookValue: dto.bookValue,
        notes: dto.notes ?? null,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('disposals')
  listDisposals(): Promise<AssetDisposal[]> {
    return this.assetsService.listDisposals(this.tenant.get().tenantId);
  }
}
