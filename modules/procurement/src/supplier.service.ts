import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, sameTenantOrNull } from '@aura/shared';
import { EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
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
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
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
    const supplier = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'supplier', id);
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

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Supplier | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: SupplierFilter): Promise<Supplier[]> {
    return this.store.list(filter);
  }

  listPaged(filter: SupplierFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
