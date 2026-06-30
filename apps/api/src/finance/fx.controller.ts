import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ExchangeRateService, TenantContext } from '@aura/core';
import { Money, type Currency } from '@aura/shared';

const CURRENCIES: Currency[] = ['AED', 'USD', 'EUR', 'SAR', 'GBP'];
const isCurrency = (v: unknown): v is Currency => typeof v === 'string' && (CURRENCIES as string[]).includes(v);

interface SetRateDto {
  from: Currency;
  to: Currency;
  rate: number;
  effectiveDate?: string;
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
}
