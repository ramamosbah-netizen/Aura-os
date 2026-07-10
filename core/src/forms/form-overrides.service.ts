import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import type { FormOverrides } from '@aura/shared';
import { PG_POOL } from '../events/pg-pool';

// Form-override store (Form Designer, Vol 15 §2.4). Sparse per-tenant patches over
// code-registered form schemas — see @aura/shared applyFormOverrides. P2 adds the
// draft/publish channels: `get()` (what renderers + assertFormValid read) stays the
// PUBLISHED patch; the designer edits the draft; publish() promotes it and bumps the
// version. Postgres when configured, in-memory in dev (the SettingsService pattern).

export interface FormOverridesStatus {
  version: number;
  hasDraft: boolean;
  publishedAt: string | null;
}

@Injectable()
export class FormOverridesService {
  private readonly logger = new Logger('FormOverrides');
  private readonly local = new Map<string, Map<string, FormOverrides>>();
  private readonly localDraft = new Map<string, Map<string, FormOverrides>>();
  private readonly localVersion = new Map<string, number>();

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  async get(tenantId: string, schemaId: string): Promise<FormOverrides | null> {
    if (!this.pool) return this.local.get(tenantId)?.get(schemaId) ?? null;
    const { rows } = await this.pool.query<{ overrides: FormOverrides }>(
      `SELECT overrides FROM public.aura_form_overrides WHERE tenant_id = $1 AND schema_id = $2`,
      [tenantId, schemaId],
    );
    return rows[0]?.overrides ?? null;
  }

  /** Every stored override patch for the tenant, keyed by schema id. */
  async list(tenantId: string): Promise<Record<string, FormOverrides>> {
    if (!this.pool) {
      return Object.fromEntries(this.local.get(tenantId)?.entries() ?? []);
    }
    const { rows } = await this.pool.query<{ schema_id: string; overrides: FormOverrides }>(
      `SELECT schema_id, overrides FROM public.aura_form_overrides WHERE tenant_id = $1`,
      [tenantId],
    );
    return Object.fromEntries(rows.map((r) => [r.schema_id, r.overrides]));
  }

  async set(tenantId: string, schemaId: string, overrides: FormOverrides): Promise<void> {
    if (!this.pool) {
      const m = this.local.get(tenantId) ?? new Map<string, FormOverrides>();
      m.set(schemaId, overrides);
      this.local.set(tenantId, m);
      return;
    }
    await this.pool.query(
      `INSERT INTO public.aura_form_overrides (tenant_id, schema_id, overrides, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (tenant_id, schema_id) DO UPDATE SET overrides = excluded.overrides, updated_at = now()`,
      [tenantId, schemaId, JSON.stringify(overrides)],
    );
    this.logger.log(`Form overrides saved: ${tenantId} · ${schemaId}`);
  }

  async remove(tenantId: string, schemaId: string): Promise<boolean> {
    if (!this.pool) {
      this.localDraft.get(tenantId)?.delete(schemaId);
      return this.local.get(tenantId)?.delete(schemaId) ?? false;
    }
    const res = await this.pool.query(
      `DELETE FROM public.aura_form_overrides WHERE tenant_id = $1 AND schema_id = $2`,
      [tenantId, schemaId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // ── P2: draft / publish channels ────────────────────────────────────────────

  /** The designer's working copy: the draft when one exists, else the published patch. */
  async getDraft(tenantId: string, schemaId: string): Promise<FormOverrides | null> {
    if (!this.pool) {
      return this.localDraft.get(tenantId)?.get(schemaId) ?? this.local.get(tenantId)?.get(schemaId) ?? null;
    }
    const { rows } = await this.pool.query<{ draft: FormOverrides | null; overrides: FormOverrides }>(
      `SELECT draft, overrides FROM public.aura_form_overrides WHERE tenant_id = $1 AND schema_id = $2`,
      [tenantId, schemaId],
    );
    return rows[0]?.draft ?? rows[0]?.overrides ?? null;
  }

  /** Save designer edits to the draft channel — published stays untouched. */
  async setDraft(tenantId: string, schemaId: string, draft: FormOverrides): Promise<void> {
    if (!this.pool) {
      const m = this.localDraft.get(tenantId) ?? new Map<string, FormOverrides>();
      m.set(schemaId, draft);
      this.localDraft.set(tenantId, m);
      return;
    }
    await this.pool.query(
      `INSERT INTO public.aura_form_overrides (tenant_id, schema_id, draft, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (tenant_id, schema_id) DO UPDATE SET draft = excluded.draft, updated_at = now()`,
      [tenantId, schemaId, JSON.stringify(draft)],
    );
  }

  /** Promote the draft to published (version++). Returns the new version, or null when no draft. */
  async publish(tenantId: string, schemaId: string): Promise<number | null> {
    if (!this.pool) {
      const draft = this.localDraft.get(tenantId)?.get(schemaId);
      if (!draft) return null;
      const m = this.local.get(tenantId) ?? new Map<string, FormOverrides>();
      m.set(schemaId, draft);
      this.local.set(tenantId, m);
      this.localDraft.get(tenantId)?.delete(schemaId);
      const vKey = `${tenantId} ${schemaId}`;
      const v = (this.localVersion.get(vKey) ?? 1) + 1;
      this.localVersion.set(vKey, v);
      return v;
    }
    const { rows } = await this.pool.query<{ version: number }>(
      `UPDATE public.aura_form_overrides
          SET overrides = draft, draft = NULL, version = version + 1, published_at = now(), updated_at = now()
        WHERE tenant_id = $1 AND schema_id = $2 AND draft IS NOT NULL
        RETURNING version`,
      [tenantId, schemaId],
    );
    if (rows.length > 0) this.logger.log(`Form overrides published: ${tenantId} · ${schemaId} → v${rows[0].version}`);
    return rows[0]?.version ?? null;
  }

  async status(tenantId: string, schemaId: string): Promise<FormOverridesStatus> {
    if (!this.pool) {
      return {
        version: this.localVersion.get(`${tenantId} ${schemaId}`) ?? 1,
        hasDraft: !!this.localDraft.get(tenantId)?.get(schemaId),
        publishedAt: null,
      };
    }
    const { rows } = await this.pool.query<{ version: number; has_draft: boolean; published_at: string | null }>(
      `SELECT version, draft IS NOT NULL AS has_draft, published_at
         FROM public.aura_form_overrides WHERE tenant_id = $1 AND schema_id = $2`,
      [tenantId, schemaId],
    );
    return rows[0]
      ? { version: rows[0].version, hasDraft: rows[0].has_draft, publishedAt: rows[0].published_at ? String(rows[0].published_at) : null }
      : { version: 1, hasDraft: false, publishedAt: null };
  }
}
