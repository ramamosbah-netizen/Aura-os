import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Permissions } from '@aura/core';
import { type GoodsReceiptLine, GoodsReceiptService } from '@aura/inventory';

class AddReceiptLineDto {
  /** The ORDER LINE this receipt answers. Required — a receipt against nothing settles nothing. */
  @IsString() poLineId!: string;
  @IsOptional() @IsNumber() quantityAccepted?: number;
  @IsOptional() @IsNumber() quantityRejected?: number;
  @IsOptional() @IsString() rejectionReason?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

/**
 * Goods receipt lines (`BUY-05`) — which ordered material arrived, and how much of it was kept.
 *
 * EXPLICIT PERMISSIONS: route derivation would require `inventory.grn.lines`, an action word no
 * role grants. Recording what arrived is part of creating the receipt, which the Storekeeper
 * already holds through `inventory.*`.
 */
@Controller('inventory/grns/:grnId/lines')
export class GoodsReceiptLinesController {
  constructor(private readonly receipts: GoodsReceiptService) {}

  @Get()
  @Permissions('inventory.grn.read')
  list(@Param('grnId') grnId: string): Promise<GoodsReceiptLine[]> {
    return this.receipts.listLines(grnId);
  }

  @Post()
  @Permissions('inventory.grn.create')
  add(@Param('grnId') grnId: string, @Body() dto: AddReceiptLineDto): Promise<GoodsReceiptLine> {
    if (!dto?.poLineId?.trim()) {
      throw new BadRequestException('a receipt line must say which order line it answers');
    }
    return this.receipts.addLine({ grnId, ...dto });
  }
}
