import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PaymentCertificate } from './domain/payment-certificate';

/** DI token for the payment-certificate (IPC) store. */
export const PAYMENT_CERTIFICATE_STORE = Symbol('PAYMENT_CERTIFICATE_STORE');

export interface CertificateFilter {
  tenantId?: string;
  contractId?: string;
  status?: string;
  limit?: number;
}

export interface PaymentCertificateStore {
  create(cert: PaymentCertificate): Promise<void>;
  /** Insert on a caller-owned transaction (atomic with its event); null tx falls back to create. */
  createWithClient(tx: TxHandle | null, cert: PaymentCertificate): Promise<void>;
  update(cert: PaymentCertificate): Promise<void>;
  /** Update on a caller-owned transaction (atomic with its event); null tx falls back to update. */
  updateWithClient(tx: TxHandle | null, cert: PaymentCertificate): Promise<void>;
  get(id: Id): Promise<PaymentCertificate | null>;
  list(filter?: CertificateFilter): Promise<PaymentCertificate[]>;
}
