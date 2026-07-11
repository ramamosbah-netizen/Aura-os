import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ParseUuidOr404Pipe, TenantContext } from '@aura/core';
import { BOND_KINDS, BondService, type BondAction, type BondKind, type ContractBond } from '@aura/contracts';

class CreateBondDto {
  @IsString() contractId!: string;
  @IsString() kind!: BondKind;
  @IsString() reference!: string;
  @IsOptional() @IsString() bank?: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() issueDate?: string;
  @IsOptional() @IsString() expiryDate?: string;
  @IsOptional() @IsString() notes?: string;
}

const ACTIONS: BondAction[] = ['release', 'call', 'expire'];

/** Bonds & guarantees API — the bank instruments securing each contract. */
@Controller('contracts/bonds')
export class BondsController {
  constructor(
    private readonly bonds: BondService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateBondDto): Promise<ContractBond> {
    if (!BOND_KINDS.includes(dto?.kind)) throw new BadRequestException(`kind must be one of ${BOND_KINDS.join(', ')}`);
    const ctx = this.tenant.get();
    try {
      return this.bonds.create({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        contractId: dto.contractId,
        kind: dto.kind,
        reference: dto.reference,
        bank: dto.bank ?? null,
        amount: dto.amount,
        issueDate: dto.issueDate ?? null,
        expiryDate: dto.expiryDate ?? null,
        notes: dto.notes ?? null,
        createdBy: ctx.actorId,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'invalid bond');
    }
  }

  @Get()
  list(@Query('contractId') contractId?: string, @Query('status') status?: string): Promise<ContractBond[]> {
    return this.bonds.list({ tenantId: this.tenant.get().tenantId, contractId, status });
  }

  /** Active bonds expiring within ?days (default 30) — the commercial watchlist. */
  @Get('expiring')
  expiring(@Query('days') days?: string): Promise<ContractBond[]> {
    const n = Number(days);
    return this.bonds.expiring(this.tenant.get().tenantId, Number.isFinite(n) && n > 0 ? n : 30);
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<ContractBond> {
    const found = await this.bonds.get(id);
    if (!found) throw new NotFoundException(`bond ${id} not found`);
    return found;
  }

  @Patch(':id/status')
  async act(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: { action: BondAction }): Promise<ContractBond> {
    if (!ACTIONS.includes(dto?.action)) throw new BadRequestException(`action must be one of ${ACTIONS.join(', ')}`);
    try {
      return await this.bonds.act(id, dto.action);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'action failed');
    }
  }
}
