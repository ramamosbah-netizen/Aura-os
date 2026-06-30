import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { CONTRACT_STORE } from './contract-store';
import { InMemoryContractStore } from './in-memory-contract-store';
import { PostgresContractStore } from './postgres-contract-store';
import { ContractService } from './contract.service';

import { PAYMENT_CERTIFICATE_STORE } from './payment-certificate-store';
import { InMemoryPaymentCertificateStore } from './in-memory-payment-certificate-store';
import { PostgresPaymentCertificateStore } from './postgres-payment-certificate-store';
import { PaymentCertificateService } from './payment-certificate.service';

/** The Contracts business module — same shape as CRM/Tendering (the module template). */
@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: CONTRACT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresContractStore(pool) : new InMemoryContractStore(),
    },
    ContractService,
    {
      provide: PAYMENT_CERTIFICATE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPaymentCertificateStore(pool) : new InMemoryPaymentCertificateStore(),
    },
    PaymentCertificateService,
  ],
  exports: [ContractService, PaymentCertificateService],
})
export class ContractsModule {}
