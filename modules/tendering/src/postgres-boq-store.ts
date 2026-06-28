import type { Pool } from 'pg';
import { type Id } from '@aura/shared';
import { type BOQ, type BOQItem } from './domain/boq';
import { type BOQStore } from './boq-store';

interface BOQRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  tender_id: string;
  created_at: Date;
  updated_at: Date;
}

interface BOQItemRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  boq_id: string;
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
      `INSERT INTO public.aura_tendering_boqs (id, tenant_id, company_id, tender_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tender_id) DO UPDATE SET updated_at = $6`,
      [boq.id, boq.tenantId, boq.companyId, boq.tenderId, new Date(boq.createdAt), new Date(boq.updatedAt)]
    );
  }

  async findBOQ(tenantId: string, id: Id): Promise<BOQ | null> {
    const res = await this.pool.query<BOQRow>(
      `SELECT id, tenant_id, company_id, tender_id, created_at, updated_at 
       FROM public.aura_tendering_boqs 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return res.rows.length ? rowToBOQ(res.rows[0]) : null;
  }

  async getBOQByTender(tenantId: string, tenderId: Id): Promise<BOQ | null> {
    const res = await this.pool.query<BOQRow>(
      `SELECT id, tenant_id, company_id, tender_id, created_at, updated_at 
       FROM public.aura_tendering_boqs 
       WHERE tender_id = $1 AND tenant_id = $2`,
      [tenderId, tenantId]
    );
    return res.rows.length ? rowToBOQ(res.rows[0]) : null;
  }

  async saveBOQItem(item: BOQItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_tendering_boq_items (
        id, tenant_id, company_id, boq_id, item_code, description, unit, quantity, rate, total_amount, ifc_guid, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET 
        item_code = $5,
        description = $6,
        unit = $7,
        quantity = $8,
        rate = $9,
        total_amount = $10,
        ifc_guid = $11,
        updated_at = $13`,
      [
        item.id,
        item.tenantId,
        item.companyId,
        item.boqId,
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
      `SELECT id, tenant_id, company_id, boq_id, item_code, description, unit, quantity, rate, total_amount, ifc_guid, created_at, updated_at 
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
      `SELECT id, tenant_id, company_id, boq_id, item_code, description, unit, quantity, rate, total_amount, ifc_guid, created_at, updated_at 
       FROM public.aura_tendering_boq_items 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return res.rows.length ? rowToBOQItem(res.rows[0]) : null;
  }
}
