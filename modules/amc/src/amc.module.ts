import { Module } from '@nestjs/common';
import { AmcService } from './amc.service';
import { InMemoryAmcStore } from './in-memory-amc-store';
import { AMC_STORE } from './store.interface';

@Module({
  providers: [
    AmcService,
    { provide: AMC_STORE, useClass: InMemoryAmcStore },
  ],
  exports: [AmcService],
})
export class AmcModule {}
