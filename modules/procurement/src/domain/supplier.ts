import { type Id, newId } from '@aura/shared';

/**
 * Supplier (Vendor) Master — the approved-vendor registry behind procurement. POs and RFQs carry
 * a supplierName snapshot today; this is the master record they reference. Vendors are onboarded
 * pending → approved (cleared to trade) and can be suspended → approved (reinstated). Carries the
 * UAE compliance fields procurement needs: trade licence and TRN (tax registration number).
 */
export type SupplierStatus = 'pending' | 'approved' | 'suspended';

export type SupplierCategory = 'materials' | 'subcontractor' | 'services' | 'equipment' | 'other';

const CATEGORIES: SupplierCategory[] = ['materials', 'subcontractor', 'services', 'equipment', 'other'];

export interface Supplier {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  name: string;
  category: SupplierCategory;
  tradeLicense: string | null;
  trn: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: SupplierStatus;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewSupplier {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  name: string;
  category?: SupplierCategory;
  tradeLicense?: string | null;
  trn?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  createdBy?: Id | null;
}

export function makeSupplier(input: NewSupplier): Supplier {
  if (!input.code?.trim()) throw new Error('supplier code is required');
  if (!input.name?.trim()) throw new Error('supplier name is required');
  const category = input.category ?? 'materials';
  if (!CATEGORIES.includes(category)) throw new Error(`category must be one of: ${CATEGORIES.join(', ')}`);
  if (input.trn && !/^\d{15}$/.test(input.trn.trim())) throw new Error('TRN must be 15 digits');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    name: input.name.trim(),
    category,
    tradeLicense: input.tradeLicense?.trim() || null,
    trn: input.trn?.trim() || null,
    contactName: input.contactName?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Clear a pending or suspended vendor to trade. */
export function approveSupplier(s: Supplier): Supplier {
  if (s.status === 'approved') throw new Error('supplier is already approved');
  return { ...s, status: 'approved' };
}

/** Block an approved vendor (compliance lapse, poor performance). */
export function suspendSupplier(s: Supplier): Supplier {
  if (s.status !== 'approved') throw new Error(`only an approved supplier can be suspended (status ${s.status})`);
  return { ...s, status: 'suspended' };
}

/** A vendor cleared for new orders. */
export function isApproved(s: Supplier): boolean {
  return s.status === 'approved';
}

export const SUPPLIER_EVENT = {
  created: 'procurement.supplier.created',
  statusChanged: 'procurement.supplier.status_changed',
} as const;
