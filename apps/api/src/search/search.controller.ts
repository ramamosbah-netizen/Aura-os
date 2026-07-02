import { Controller, Get, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { SearchService, type SearchHit } from './search.service';

/** Global search API — tenant-scoped entity lookup across the spine modules. */
@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  run(@Query('q') q = '', @Query('limit') limit?: string): Promise<SearchHit[]> {
    const n = Number(limit);
    const capped = Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20;
    return this.search.search(this.tenant.get().tenantId, q, capped);
  }
}
