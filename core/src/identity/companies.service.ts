import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

// Companies master (Admin Center phase 2, Vol 15 §2.1). Documents already carry a
// company_id; this service makes companies first-class: the admin CRUD surface and
// the app-shell company switcher read from here. Postgres when configured, in-memory
// in dev — the SettingsService pattern.

export interface Company {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  trn: string;
  baseCurrency: string;
  active: boolean;
  /**
   * What this company prints on its documents beyond its name and TRN (F-01, migration 0403).
   * Empty when nobody recorded it — never borrowed from another company or invented.
   */
  legalName?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger('CompaniesService');
  private readonly local = new Map<string, Map<string, Company>>();

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  async list(tenantId: string): Promise<Company[]> {
    if (!this.pool) {
      return [...(this.local.get(tenantId)?.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    }
    const { rows } = await this.pool.query(
      `SELECT id, tenant_id, name, code, trn, base_currency, active, legal_name, address, phone, email, website
         FROM public.aura_companies WHERE tenant_id = $1 ORDER BY name`,
      [tenantId],
    );
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      name: r.name,
      code: r.code ?? '',
      trn: r.trn ?? '',
      baseCurrency: r.base_currency ?? 'AED',
      active: !!r.active,
      legalName: r.legal_name ?? '',
      address: r.address ?? '',
      phone: r.phone ?? '',
      email: r.email ?? '',
      website: r.website ?? '',
    }));
  }

  async upsert(company: Company): Promise<Company> {
    if (!this.pool) {
      const m = this.local.get(company.tenantId) ?? new Map<string, Company>();
      m.set(company.id, company);
      this.local.set(company.tenantId, m);
      return company;
    }
    await this.pool.query(
      `INSERT INTO public.aura_companies (id, tenant_id, name, code, trn, base_currency, active,
         legal_name, address, phone, email, website, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         name = excluded.name, code = excluded.code, trn = excluded.trn,
         base_currency = excluded.base_currency, active = excluded.active,
         legal_name = excluded.legal_name, address = excluded.address, phone = excluded.phone,
         email = excluded.email, website = excluded.website, updated_at = now()`,
      [company.id, company.tenantId, company.name, company.code, company.trn, company.baseCurrency, company.active,
        company.legalName || null, company.address || null, company.phone || null, company.email || null, company.website || null],
    );
    this.logger.log(`Company ${company.id} (${company.name}) upserted for ${company.tenantId}`);
    return company;
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    if (!this.pool) return this.local.get(tenantId)?.delete(id) ?? false;
    const res = await this.pool.query(`DELETE FROM public.aura_companies WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    return (res.rowCount ?? 0) > 0;
  }
}
