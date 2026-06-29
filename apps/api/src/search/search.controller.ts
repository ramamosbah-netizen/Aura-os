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
  run(@Query('q') q = ''): Promise<SearchHit[]> {
    return this.search.search(this.tenant.get().tenantId, q);
  }
}
