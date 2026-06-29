import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  SUPPLIER_EVENT,
  type Supplier,
  type NewSupplier,
  makeSupplier,
  approveSupplier,
  suspendSupplier,
} from './domain/supplier';
import { SUPPLIER_STORE, type SupplierFilter, type SupplierStore } from './supplier-store';

type SupplierAction = 'approve' | 'suspend';

/**
 * Supplier master service — owns `aura_procurement_suppliers`, emits
 * `procurement.supplier.*`, and enforces unique vendor codes per tenant.
 */
@Injectable()
export class SupplierService {
  private readonly logger = new Logger('SupplierMaster');

  constructor(
    @Inject(SUPPLIER_STORE) private readonly store: SupplierStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewSupplier): Promise<Supplier> {
    const existing = await this.store.getByCode(input.tenantId, input.code.trim());
    if (existing) throw new Error(`supplier code ${input.code} already exists`);
    const supplier = makeSupplier(input);
    await this.store.create(supplier);
    await this.events.append([
      makeEvent({
        type: SUPPLIER_EVENT.created,
        tenantId: supplier.tenantId,
        companyId: supplier.companyId,
        actorId: supplier.createdBy,
        aggregateType: 'procurement.supplier',
        aggregateId: supplier.id,
        payload: { code: supplier.code, name: supplier.name, category: supplier.category },
      }),
    ]);
    this.logger.log(`Supplier created: ${supplier.code} ${supplier.name} (${supplier.category})`);
    return supplier;
  }

  async changeStatus(id: Id, action: SupplierAction): Promise<Supplier> {
    const supplier = await this.store.get(id);
    if (!supplier) throw new Error(`supplier ${id} not found`);
    const updated = action === 'approve' ? approveSupplier(supplier) : suspendSupplier(supplier);
    await this.store.update(updated);
    await this.events.append([
      makeEvent({
        type: SUPPLIER_EVENT.statusChanged,
        tenantId: supplier.tenantId, companyId: supplier.companyId, actorId: null,
        aggregateType: 'procurement.supplier', aggregateId: id,
        payload: { code: supplier.code, status: updated.status },
      }),
    ]);
    return updated;
  }

  get(id: Id): Promise<Supplier | null> {
    return this.store.get(id);
  }

  list(filter?: SupplierFilter): Promise<Supplier[]> {
    return this.store.list(filter);
  }
}
