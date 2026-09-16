import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { Permissions } from '@aura/core';
import {
  type OrderProvenance,
  type OrderTotal,
  type PurchaseOrderLine,
  PurchaseOrderLineService,
} from '@aura/procurement';

class AddOrderLineDto {
  /** An id or a code — whichever the picker or the caller had. */
  @IsString() material!: string;
  @IsNumber() quantity!: number;
  @IsNumber() unitPrice!: number;
  /**
   * `legacy` is deliberately NOT accepted here. It is what an order raised before lines existed
   * looks like, not a lineage anybody chooses — and the domain refuses it by name if it arrives.
   */
  @IsOptional() @IsIn(['direct', 'sourced']) sourceType?: 'direct' | 'sourced';
  @IsOptional() @IsString() sourcePrLineId?: string | null;
  @IsOptional() @IsString() sourceQuoteLineId?: string | null;
  @IsOptional() @IsString() wbsNodeId?: string | null;
  @IsOptional() @IsString() cbsNodeId?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

class EditOrderLineDto {
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsNumber() unitPrice?: number;
  @IsOptional() @IsString() wbsNodeId?: string | null;
  @IsOptional() @IsString() cbsNodeId?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

/**
 * Purchase order lines — what is being bought, and how it came to be bought.
 *
 * EXPLICIT PERMISSIONS, not derived: route derivation would read the trailing segment and require
 * `procurement.purchase-order.lines`, an action word no role grants and a second vocabulary for an
 * authority that already has one. Authoring lines is composing the order, and the order's own
 * routes already speak `procurement.po.*`.
 */
@Controller('procurement/purchase-orders/:poId/lines')
export class PurchaseOrderLinesController {
  constructor(private readonly lines: PurchaseOrderLineService) {}

  @Get()
  @Permissions('procurement.po.view')
  list(@Param('poId') poId: string): Promise<PurchaseOrderLine[]> {
    return this.lines.listLines(poId);
  }

  /** What the order comes to, and how it was arrived at — read from the lines, not declared. */
  @Get('summary')
  @Permissions('procurement.po.view')
  summary(@Param('poId') poId: string): Promise<{ total: OrderTotal; provenance: OrderProvenance; derived: boolean }> {
    return this.lines.summary(poId);
  }

  @Post()
  @Permissions('procurement.po.update')
  add(@Param('poId') poId: string, @Body() dto: AddOrderLineDto): Promise<PurchaseOrderLine> {
    if (!dto?.material?.trim()) throw new BadRequestException('a material is required');
    if (typeof dto.quantity !== 'number') throw new BadRequestException('a quantity is required');
    if (typeof dto.unitPrice !== 'number') throw new BadRequestException('a unit price is required');
    return this.lines.addLine({ poId, ...dto });
  }

  @Patch(':lineId')
  @Permissions('procurement.po.update')
  edit(@Param('lineId') lineId: string, @Body() dto: EditOrderLineDto): Promise<PurchaseOrderLine> {
    return this.lines.editLine(lineId, dto);
  }

  @Delete(':lineId')
  @Permissions('procurement.po.update')
  async remove(@Param('lineId') lineId: string): Promise<{ removed: true }> {
    await this.lines.removeLine(lineId);
    return { removed: true };
  }
}
