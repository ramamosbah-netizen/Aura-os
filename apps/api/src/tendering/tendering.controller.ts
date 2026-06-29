import { BadRequestException, Body, Controller, Delete, Get, Headers, NotFoundException, Param, Patch, Post, Put, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { type Tender, type TenderStatus, TenderService, type BOQ, type BOQItem } from '@aura/tendering';
import * as xlsx from 'xlsx';

interface CreateTenderDto {
  title: string;
  reference?: string;
  accountId?: string | null;
  accountName?: string | null;
  status?: TenderStatus;
  value?: number;
}

/** Tendering API — stamps tenant/actor from context, delegates to TenderService. */
@Controller('tendering/tenders')
export class TenderingController {
  constructor(
    private readonly tenders: TenderService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateTenderDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Tender> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.tenders.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      accountId: dto.accountId ?? null,
      accountName: dto.accountName ?? null,
      status: dto.status,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    }, idempotencyKey);
  }

  /**
   * PATCH /api/tendering/tenders/:id/status
   * Transition a tender's status. Setting status to 'won' triggers the deal chain:
   * tender.awarded → auto-create Contract.
   */
  @Patch(':id/status')
  async changeStatus(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { status: TenderStatus },
  ): Promise<Tender> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    return this.tenders.changeStatus(id, dto.status);
  }

  @Get()
  list(@Query('status') status?: string, @Query('accountId') accountId?: string): Promise<Tender[]> {
    return this.tenders.list({ status, accountId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Tender> {
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    return found;
  }

  // ── BOQ & Cost Estimating ─────────────────────────────────────

  @Get(':id/boq')
  async getBOQ(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ boq: BOQ; items: BOQItem[] }> {
    const tender = await this.tenders.get(id);
    if (!tender) throw new NotFoundException(`tender ${id} not found`);
    const ctx = this.tenant.get();
    return this.tenders.getOrCreateBOQ(ctx.tenantId, ctx.companyId, id);
  }

  @Post(':id/boq/items')
  async addBOQItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { boqId: string; itemCode: string; description: string; unit: string; quantity: number; rate: number; ifcGuid?: string },
  ): Promise<BOQItem> {
    if (!dto.boqId) throw new BadRequestException('boqId is required');
    if (!dto.itemCode?.trim()) throw new BadRequestException('itemCode is required');
    if (!dto.description?.trim()) throw new BadRequestException('description is required');
    if (!dto.unit?.trim()) throw new BadRequestException('unit is required');
    if (dto.quantity === undefined || dto.quantity < 0) throw new BadRequestException('quantity must be >= 0');
    if (dto.rate === undefined || dto.rate < 0) throw new BadRequestException('rate must be >= 0');

    const ctx = this.tenant.get();
    return this.tenders.addBOQItem(ctx.tenantId, ctx.companyId, dto.boqId, {
      itemCode: dto.itemCode,
      description: dto.description,
      unit: dto.unit,
      quantity: dto.quantity,
      rate: dto.rate,
      ifcGuid: dto.ifcGuid,
    });
  }

  @Put(':id/boq/items/:itemId')
  async updateBOQItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('itemId') itemId: string,
    @Body() dto: { itemCode?: string; description?: string; unit?: string; quantity?: number; rate?: number; ifcGuid?: string | null },
  ): Promise<BOQItem> {
    const ctx = this.tenant.get();
    return this.tenders.updateBOQItem(ctx.tenantId, itemId, dto);
  }

  @Delete(':id/boq/items/:itemId')
  async deleteBOQItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    const ctx = this.tenant.get();
    return this.tenders.deleteBOQItem(ctx.tenantId, itemId);
  }

  @Post(':id/boq/import')
  async importBOQ(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { boqId: string; items: Array<{ itemCode: string; description: string; unit: string; quantity: number; rate: number; ifcGuid?: string }> },
  ): Promise<BOQItem[]> {
    if (!dto.boqId) throw new BadRequestException('boqId is required');
    if (!Array.isArray(dto.items)) throw new BadRequestException('items must be an array');

    const ctx = this.tenant.get();
    return this.tenders.importBOQItems(ctx.tenantId, ctx.companyId, dto.boqId, dto.items);
  }

  @Post(':id/boq/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadBOQ(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body('boqId') boqId: string,
    @UploadedFile() file: any,
  ): Promise<BOQItem[]> {
    if (!file) throw new BadRequestException('file is required');
    if (!boqId) throw new BadRequestException('boqId is required');

    try {
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

      if (rows.length < 2) {
        throw new BadRequestException('Spreadsheet is empty or has no data rows');
      }

      const headers = (rows[0] as any[]).map(h => String(h || '').trim().toLowerCase());
      
      const colIdx = {
        itemCode: headers.findIndex(h => h.includes('code') || h.includes('item') || h.includes('no.')),
        description: headers.findIndex(h => h.includes('desc') || h.includes('particular') || h.includes('title')),
        unit: headers.findIndex(h => h.includes('unit')),
        quantity: headers.findIndex(h => h.includes('qty') || h.includes('quant')),
        rate: headers.findIndex(h => h.includes('rate') || h.includes('price')),
        ifcGuid: headers.findIndex(h => h.includes('guid') || h.includes('ifc')),
      };

      if (colIdx.itemCode === -1 || colIdx.description === -1 || colIdx.unit === -1 || colIdx.quantity === -1 || colIdx.rate === -1) {
        throw new BadRequestException('Could not detect necessary columns: Code, Description, Unit, Quantity, and Rate must be present.');
      }

      const items: Array<{ itemCode: string; description: string; unit: string; quantity: number; rate: number; ifcGuid?: string }> = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const itemCode = String(row[colIdx.itemCode] || '').trim();
        const description = String(row[colIdx.description] || '').trim();
        const unit = String(row[colIdx.unit] || '').trim();
        const quantityVal = row[colIdx.quantity];
        const rateVal = row[colIdx.rate];
        const ifcGuidVal = colIdx.ifcGuid !== -1 ? row[colIdx.ifcGuid] : null;

        if (!itemCode && !description) continue;

        const quantity = parseFloat(quantityVal) || 0;
        const rate = parseFloat(rateVal) || 0;
        const ifcGuid = ifcGuidVal ? String(ifcGuidVal).trim() : undefined;

        items.push({
          itemCode,
          description,
          unit,
          quantity,
          rate,
          ifcGuid,
        });
      }

      const ctx = this.tenant.get();
      return this.tenders.importBOQItems(ctx.tenantId, ctx.companyId, boqId, items);
    } catch (err: any) {
      throw new BadRequestException(err.message || 'Failed to parse Excel file');
    }
  }
}
