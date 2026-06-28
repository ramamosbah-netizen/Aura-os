import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PG_POOL } from '@aura/core';
import type { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface DocumentTemplate {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  elements: any[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface TemplateRow {
  id: string;
  tenant_id: string;
  name: string;
  category: string;
  elements: string | any[];
  status: string;
  created_at: Date;
  updated_at: Date;
}

function rowToTemplate(r: TemplateRow): DocumentTemplate {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    category: r.category,
    elements: typeof r.elements === 'string' ? JSON.parse(r.elements) : r.elements,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

@Injectable()
export class TemplatesService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(params: {
    tenantId: string;
    name: string;
    category: string;
    elements?: any[];
  }): Promise<DocumentTemplate> {
    const id = randomUUID();
    const elementsJson = JSON.stringify(params.elements || []);
    const status = 'draft';
    const now = new Date();

    const res = await this.pool.query<TemplateRow>(
      `INSERT INTO public.aura_document_templates (id, tenant_id, name, category, elements, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, params.tenantId, params.name, params.category, elementsJson, status, now, now]
    );

    return rowToTemplate(res.rows[0]);
  }

  async get(id: string, tenantId: string): Promise<DocumentTemplate | null> {
    const res = await this.pool.query<TemplateRow>(
      `SELECT * FROM public.aura_document_templates WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!res.rows.length) return null;
    return rowToTemplate(res.rows[0]);
  }

  async list(tenantId: string, category?: string): Promise<DocumentTemplate[]> {
    let query = `SELECT * FROM public.aura_document_templates WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (category) {
      params.push(category);
      query += ` AND category = $2`;
    }

    query += ` ORDER BY created_at DESC`;
    const res = await this.pool.query<TemplateRow>(query, params);
    return res.rows.map(rowToTemplate);
  }

  async update(
    id: string,
    tenantId: string,
    params: {
      name?: string;
      category?: string;
      elements?: any[];
      status?: string;
    }
  ): Promise<DocumentTemplate> {
    const current = await this.get(id, tenantId);
    if (!current) throw new NotFoundException(`Template with ID ${id} not found`);

    const name = params.name !== undefined ? params.name : current.name;
    const category = params.category !== undefined ? params.category : current.category;
    const elementsJson = params.elements !== undefined ? JSON.stringify(params.elements) : JSON.stringify(current.elements);
    const status = params.status !== undefined ? params.status : current.status;
    const now = new Date();

    const res = await this.pool.query<TemplateRow>(
      `UPDATE public.aura_document_templates
       SET name = $3, category = $4, elements = $5, status = $6, updated_at = $7
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, name, category, elementsJson, status, now]
    );

    return rowToTemplate(res.rows[0]);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const res = await this.pool.query(
      `DELETE FROM public.aura_document_templates WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (res.rowCount === 0) throw new NotFoundException(`Template with ID ${id} not found`);
  }
}
