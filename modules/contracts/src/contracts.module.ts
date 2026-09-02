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
import { IPC_LINE_STORE } from './ipc-line-store';
import { InMemoryIpcLineStore } from './in-memory-ipc-line-store';
import { PostgresIpcLineStore } from './postgres-ipc-line-store';

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
import { CONTRACT_REVISION_STORE } from './contract-revision-store';
import { InMemoryContractRevisionStore } from './in-memory-contract-revision-store';
import { PostgresContractRevisionStore } from './postgres-contract-revision-store';
import { ContractRevisionService } from './contract-revision.service';
import { CONTRACT_NEGOTIATION_STORE } from './contract-negotiation-store';
import { InMemoryContractNegotiationStore } from './in-memory-contract-negotiation-store';
import { PostgresContractNegotiationStore } from './postgres-contract-negotiation-store';
import { ContractNegotiationService } from './contract-negotiation.service';
import { CONTRACT_CLIENT_SHARE_STORE } from './contract-client-share-store';
import { InMemoryContractClientShareStore } from './in-memory-contract-client-share-store';
import { PostgresContractClientShareStore } from './postgres-contract-client-share-store';
import { ContractClientShareService } from './contract-client-share.service';
import { CONTRACT_AMENDMENT_STORE } from './contract-amendment-store';
import { InMemoryContractAmendmentStore } from './in-memory-contract-amendment-store';
import { PostgresContractAmendmentStore } from './postgres-contract-amendment-store';
import { ContractAmendmentService } from './contract-amendment.service';
import { CONTRACT_APPROVAL_STORE } from './contract-approval-store';
import { InMemoryContractApprovalStore } from './in-memory-contract-approval-store';
import { PostgresContractApprovalStore } from './postgres-contract-approval-store';
import { ContractApprovalService } from './contract-approval.service';

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
    {
      provide: IPC_LINE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresIpcLineStore(pool) : new InMemoryIpcLineStore(),
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
    {
      provide: CONTRACT_REVISION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) => pool ? new PostgresContractRevisionStore(pool) : new InMemoryContractRevisionStore(),
    },
    ContractRevisionService,
    {
      provide: CONTRACT_NEGOTIATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) => pool ? new PostgresContractNegotiationStore(pool) : new InMemoryContractNegotiationStore(),
    },
    ContractNegotiationService,
    {
      provide: CONTRACT_CLIENT_SHARE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) => pool ? new PostgresContractClientShareStore(pool) : new InMemoryContractClientShareStore(),
    },
    ContractClientShareService,
    { provide: CONTRACT_AMENDMENT_STORE, inject: [PG_POOL], useFactory: (pool: Pool | null) => pool ? new PostgresContractAmendmentStore(pool) : new InMemoryContractAmendmentStore() },
    ContractAmendmentService,
    { provide: CONTRACT_APPROVAL_STORE, inject: [PG_POOL], useFactory: (pool: Pool | null) => pool ? new PostgresContractApprovalStore(pool) : new InMemoryContractApprovalStore() },
    ContractApprovalService,
  ],
  exports: [ContractService, PaymentCertificateService, ClauseService, ObligationService, BondService, ContractRevisionService, ContractNegotiationService, ContractClientShareService, ContractAmendmentService, ContractApprovalService],
})
export class ContractsModule {}
