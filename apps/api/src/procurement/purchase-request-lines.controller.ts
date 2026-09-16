import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Permissions } from '@aura/core';
import {
  type PurchaseRequestLine,
  PurchaseRequestLineService,
  type RequisitionTotal,
} from '@aura/procurement';

class AddLineDto {
  /** An id or a code — whichever the picker or the caller had. */
  @IsString() material!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() needByDate?: string | null;
  @IsOptional() @IsNumber() estimatedUnitCost?: number | null;
  @IsOptional() @IsString() wbsNodeId?: string | null;
  @IsOptional() @IsString() cbsNodeId?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

class EditLineDto {
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() needByDate?: string | null;
  @IsOptional() @IsNumber() estimatedUnitCost?: number | null;
  @IsOptional() @IsString() wbsNodeId?: string | null;
  @IsOptional() @IsString() cbsNodeId?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

/**
 * Material requisition lines (`BUY-01`, gap record `J3-05`).
 *
 * EXPLICIT PERMISSIONS, not derived. Route derivation would read the trailing segment and require
 * `procurement.purchase-request.lines` — an action word no role grants, and a second vocabulary for
 * an authority that already has one. Authoring lines is composing the requisition, which the Buyer
 * role already holds through `procurement.*.update`.
 */
@Controller('procurement/purchase-requests/:prId/lines')
export class PurchaseRequestLinesController {
  constructor(private readonly lines: PurchaseRequestLineService) {}

  @Get()
  @Permissions('procurement.pr.read')
  list(@Param('prId') prId: string): Promise<PurchaseRequestLine[]> {
    return this.lines.listLines(prId);
  }

  /**
   * What the requisition adds up to, whether that sum is complete, and whether it may be submitted.
   * One read, because a screen showing the total without saying it is provisional would be showing
   * a number that is not the requisition's value.
   */
  @Get('summary')
  @Permissions('procurement.pr.read')
  async summary(@Param('prId') prId: string): Promise<{
    total: RequisitionTotal;
    governing: { value: number | null; derived: boolean };
    submission: { ready: boolean; reason?: string };
  }> {
    const [total, governing, submission] = await Promise.all([
      this.lines.total(prId),
      this.lines.governingValue(prId),
      this.lines.submissionReadiness(prId),
    ]);
    return { total, governing, submission };
  }

  @Post()
  @Permissions('procurement.pr.update')
  add(@Param('prId') prId: string, @Body() dto: AddLineDto): Promise<PurchaseRequestLine> {
    if (!dto?.material?.trim()) throw new BadRequestException('a material is required');
    if (typeof dto.quantity !== 'number') throw new BadRequestException('a quantity is required');
    return this.lines.addLine({ prId, ...dto });
  }

  @Patch(':lineId')
  @Permissions('procurement.pr.update')
  edit(@Param('lineId') lineId: string, @Body() dto: EditLineDto): Promise<PurchaseRequestLine> {
    return this.lines.editLine(lineId, dto);
  }

  @Delete(':lineId')
  @Permissions('procurement.pr.update')
  async remove(@Param('lineId') lineId: string): Promise<{ removed: true }> {
    await this.lines.removeLine(lineId);
    return { removed: true };
  }
}
