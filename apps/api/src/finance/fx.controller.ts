import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Permissions, ExchangeRateService, TenantContext, type GovernedRate } from '@aura/core';
// The currency list is the SHARED one, not a copy. This file used to keep its own, which is the
// same drift FX-01 records: a second list is a second answer to what AURA can govern.
import { CURRENCIES, Money, isCurrency, type Currency } from '@aura/shared';

class SetRateDto {
  @IsString() from!: Currency;
  @IsString() to!: Currency;
  @IsNumber() rate!: number;
  @IsOptional() @IsString() effectiveDate?: string;
}

/** Multi-currency FX: manage exchange rates + convert amounts. */
@Controller('finance/fx')
export class FxController {
  constructor(
    private readonly fx: ExchangeRateService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('rates')
  rates() {
    return this.fx.listRates(this.tenant.get().tenantId);
  }

  @Post('rates')
  async setRate(@Body() dto: SetRateDto): Promise<{ from: Currency; to: Currency; rate: number }> {
    if (!isCurrency(dto?.from) || !isCurrency(dto?.to)) throw new BadRequestException(`from/to must be one of ${CURRENCIES.join(', ')}`);
    if (!(Number(dto?.rate) > 0)) throw new BadRequestException('rate must be a positive number');
    const date = dto.effectiveDate ? new Date(dto.effectiveDate) : new Date();
    await this.fx.setRate(this.tenant.get().tenantId, dto.from, dto.to, Number(dto.rate), date);
    return { from: dto.from, to: dto.to, rate: Number(dto.rate) };
  }

  @Get('convert')
  async convert(
    @Query('amount') amount?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ amount: number; from: Currency; to: Currency; rate: number; converted: number }> {
    const value = Number(amount);
    if (!Number.isFinite(value)) throw new BadRequestException('amount must be a number');
    if (!isCurrency(from) || !isCurrency(to)) throw new BadRequestException(`from/to must be one of ${CURRENCIES.join(', ')}`);
    const tenantId = this.tenant.get().tenantId;
    const rate = await this.fx.getRate(tenantId, from, to);
    const converted = await this.fx.convert(tenantId, Money.of(value, from), to);
    return { amount: value, from, to, rate, converted: converted.major };
  }

  /**
   * THE DECISION-GRADE READ (FX-01's strict path).
   *
   * `GET convert` above answers with whatever `getRate()` invents when nothing is registered. This
   * one answers with what is actually GOVERNED, or says plainly that it does not know and why.
   *
   * It returns 200 for `status: 'unknown'` on purpose. "No rate is registered for this pair" is a
   * true answer to a question, not a failed request — the caller asked and was told. The REFUSAL
   * belongs at the point where an amount is turned into money: there, `requireGovernedRate` throws
   * and the filter renders it a 400, because at that point not knowing makes the work impossible.
   *
   * `from`/`to` are read as raw strings and narrowed by the service. That is deliberate: the hole
   * FX-01 records is an unchecked cast at a call site, so a surface that pre-filters the code would
   * hide exactly the case this exists to expose.
   */
  @Permissions('finance.fx.read')
  @Get('governed-rate')
  governedRate(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('asOf') asOf?: string,
  ): Promise<GovernedRate> {
    if (!from?.trim() || !to?.trim()) throw new BadRequestException('from and to are required');
    const date = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException('asOf must be a date');
    return this.fx.resolveGovernedRate(this.tenant.get().tenantId, from, to, date);
  }
}
