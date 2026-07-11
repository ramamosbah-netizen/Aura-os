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

import { CLAUSE_STORE } from './clause-store';
import { InMemoryClauseStore } from './in-memory-clause-store';
import { PostgresClauseStore } from './postgres-clause-store';
import { ClauseService } from './clause.service';

import { CONTRACT_BOND_STORE } from './bond-store';
import { InMemoryBondStore } from './in-memory-bond-store';
import { PostgresBondStore } from './postgres-bond-store';
import { BondService } from './bond.service';

import { OBLIGATION_STORE } from './obligation-store';
import { InMemoryObligationStore } from './in-memory-obligation-store';
import { PostgresObligationStore } from './postgres-obligation-store';
import { ObligationService } from './obligation.service';

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
      provide: CONTRACT_BOND_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) => (pool ? new PostgresBondStore(pool) : new InMemoryBondStore()),
    },
    BondService,
    {
      provide: PAYMENT_CERTIFICATE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPaymentCertificateStore(pool) : new InMemoryPaymentCertificateStore(),
    },
    PaymentCertificateService,
    {
      provide: CLAUSE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresClauseStore(pool) : new InMemoryClauseStore(),
    },
    ClauseService,
    {
      provide: OBLIGATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresObligationStore(pool) : new InMemoryObligationStore(),
    },
    ObligationService,
  ],
  exports: [ContractService, PaymentCertificateService, ClauseService, ObligationService, BondService],
})
export class ContractsModule {}
