import type { Pool } from 'pg';
import type {
  DocumentEvidence,
  DocumentRequirement,
  DocumentRequirementStatus,
  DocumentRequirementType,
  Id,
} from '@aura/shared';
import type { DocumentRequirementStore, RequirementFilter } from './document-requirement-store';

interface Row {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  type: string;
  status: string;
  required_count: number;
  evidence: DocumentEvidence[] | string;
  note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

function rowTo(r: Row): DocumentRequirement {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    type: r.type as DocumentRequirementType,
    status: r.status as DocumentRequirementStatus,
    requiredCount: Number(r.required_count),
    // pg returns jsonb already parsed; tolerate a string in case a driver/config differs.
    evidence: typeof r.evidence === 'string' ? (JSON.parse(r.evidence) as DocumentEvidence[]) : r.evidence,
    note: r.note,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const COLS =
  'id, tenant_id, entity_type, entity_id, type, status, required_count, evidence, note, created_at, updated_at';

/** Durable evidence requirements on Postgres (`aura_document_requirements`, migration 0184). */
export class PostgresDocumentRequirementStore implements DocumentRequirementStore {
  constructor(private readonly pool: Pool) {}

  async upsert(r: DocumentRequirement): Promise<void> {
    // ON CONFLICT against the natural key in 0184. Re-seeding a template converges instead of
    // duplicating, and `id` is left alone so anything already referencing the row still resolves.
    await this.pool.query(
      `INSERT INTO public.aura_document_requirements (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
       ON CONFLICT (tenant_id, entity_type, entity_id, type) DO UPDATE SET
         status = EXCLUDED.status,
         required_count = EXCLUDED.required_count,
         evidence = EXCLUDED.evidence,
         note = EXCLUDED.note,
         updated_at = EXCLUDED.updated_at`,
      [
        r.id, r.tenantId, r.entityType, r.entityId, r.type, r.status,
        r.requiredCount, JSON.stringify(r.evidence), r.note, r.createdAt, r.updatedAt,
      ],
    );
  }

  async list(filter: RequirementFilter): Promise<DocumentRequirement[]> {
    const where: string[] = ['tenant_id = $1'];
    const params: unknown[] = [filter.tenantId];
    if (filter.entityType) { params.push(filter.entityType); where.push(`entity_type = $${params.length}`); }
    if (filter.entityId) { params.push(filter.entityId); where.push(`entity_id = $${params.length}`); }
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_document_requirements WHERE ${where.join(' AND ')} ORDER BY type`,
      params,
    );
    return res.rows.map(rowTo);
  }

  async get(id: Id): Promise<DocumentRequirement | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_document_requirements WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? rowTo(res.rows[0]) : null;
  }

  async remove(id: Id): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM public.aura_document_requirements WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
