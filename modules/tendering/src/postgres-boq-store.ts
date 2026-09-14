import type { Pool } from 'pg';
import { type Id } from '@aura/shared';
import { type BOQ, type BOQItem } from './domain/boq';
import { type BOQStore } from './boq-store';

interface BOQRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  tender_id: string;
  source_basis_revision_id: string | null;
  source_revision_ref: string | null;
  projected_by: string | null;
  projected_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface BOQItemRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  boq_id: string;
  source_basis_line_id: string | null;
  item_code: string;
  description: string;
  unit: string;
  quantity: string | number;
  rate: string | number;
  total_amount: string | number;
  ifc_guid: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToBOQ(r: BOQRow): BOQ {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    tenderId: r.tender_id,
    sourceBasisRevisionId: r.source_basis_revision_id,
    sourceRevisionRef: r.source_revision_ref,
    projectedBy: r.projected_by,
    projectedAt: r.projected_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToBOQItem(r: BOQItemRow): BOQItem {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    boqId: r.boq_id,
    sourceBasisLineId: r.source_basis_line_id,
    itemCode: r.item_code,
    description: r.description,
    unit: r.unit,
    quantity: Number(r.quantity),
    rate: Number(r.rate),
    totalAmount: Number(r.total_amount),
    ifcGuid: r.ifc_guid,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export class PostgresBOQStore implements BOQStore {
  constructor(private readonly pool: Pool) {}

  async saveBOQ(boq: BOQ): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_tendering_boqs
         (id, tenant_id, company_id, tender_id, source_basis_revision_id, source_revision_ref, projected_by, projected_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (tender_id) DO UPDATE SET
         source_basis_revision_id = excluded.source_basis_revision_id,
         source_revision_ref = excluded.source_revision_ref,
         projected_by = excluded.projected_by,
         projected_at = excluded.projected_at,
         updated_at = excluded.updated_at`,
      [boq.id, boq.tenantId, boq.companyId, boq.tenderId, boq.sourceBasisRevisionId, boq.sourceRevisionRef,
       boq.projectedBy, boq.projectedAt ? new Date(boq.projectedAt) : null, new Date(boq.createdAt), new Date(boq.updatedAt)]
    );
  }

  async findBOQ(tenantId: string, id: Id): Promise<BOQ | null> {
    const res = await this.pool.query<BOQRow>(
      `SELECT id, tenant_id, company_id, tender_id, source_basis_revision_id, source_revision_ref, projected_by, projected_at, created_at, updated_at
       FROM public.aura_tendering_boqs
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return res.rows.length ? rowToBOQ(res.rows[0]) : null;
  }

  async getBOQByTender(tenantId: string, tenderId: Id): Promise<BOQ | null> {
    const res = await this.pool.query<BOQRow>(
      `SELECT id, tenant_id, company_id, tender_id, source_basis_revision_id, source_revision_ref, projected_by, projected_at, created_at, updated_at
       FROM public.aura_tendering_boqs
       WHERE tender_id = $1 AND tenant_id = $2`,
      [tenderId, tenantId]
    );
    return res.rows.length ? rowToBOQ(res.rows[0]) : null;
  }

  async saveBOQItem(item: BOQItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_tendering_boq_items (
        id, tenant_id, company_id, boq_id, source_basis_line_id, item_code, description, unit, quantity, rate, total_amount, ifc_guid, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        source_basis_line_id = $5,
        item_code = $6,
        description = $7,
        unit = $8,
        quantity = $9,
        rate = $10,
        total_amount = $11,
        ifc_guid = $12,
        updated_at = $14`,
      [
        item.id,
        item.tenantId,
        item.companyId,
        item.boqId,
        item.sourceBasisLineId,
        item.itemCode,
        item.description,
        item.unit,
        item.quantity,
        item.rate,
        item.totalAmount,
        item.ifcGuid,
        new Date(item.createdAt),
        new Date(item.updatedAt),
      ]
    );
  }

  async deleteBOQItem(tenantId: string, id: Id): Promise<void> {
    await this.pool.query(
      `DELETE FROM public.aura_tendering_boq_items WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
  }

  async getBOQItems(tenantId: string, boqId: Id): Promise<BOQItem[]> {
    const res = await this.pool.query<BOQItemRow>(
      `SELECT id, tenant_id, company_id, boq_id, source_basis_line_id, item_code, description, unit, quantity, rate, total_amount, ifc_guid, created_at, updated_at
       FROM public.aura_tendering_boq_items
       WHERE boq_id = $1 AND tenant_id = $2`,
      [boqId, tenantId]
    );
    return res.rows
      .map(rowToBOQItem)
      .sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true, sensitivity: 'base' }));
  }

  async getBOQItem(tenantId: string, id: Id): Promise<BOQItem | null> {
    const res = await this.pool.query<BOQItemRow>(
      `SELECT id, tenant_id, company_id, boq_id, source_basis_line_id, item_code, description, unit, quantity, rate, total_amount, ifc_guid, created_at, updated_at
       FROM public.aura_tendering_boq_items
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return res.rows.length ? rowToBOQItem(res.rows[0]) : null;
  }
}
