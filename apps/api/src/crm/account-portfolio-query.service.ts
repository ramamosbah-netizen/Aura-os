import type { Pool } from 'pg';
import type { PageParams } from '@aura/shared';

export interface PortfolioQueryFilters {
  search?: string;
  status?: string;
  ownerId?: string;
  health?: 'at_risk' | '';
}

export interface PortfolioQueryRow {
  id: string;
  name: string;
  stage: string;
  partyType: string | null;
  industry: string | null;
  ownerId: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  paymentTerms: string | null;
  website: string | null;
  billingAddress: string | null;
  createdAt: string;
  activeDeals: number;
  pipelineValue: number;
  openTenders: number;
  quotations: number;
  contracts: number;
  contractedValue: number;
  activeProjects: number;
  outstandingAR: number;
  overdueAR: number;
  lastActivityAt: string | null;
  activeContracts: number;
  liveProjects: number;
  health: 'healthy' | 'attention' | 'at_risk';
  healthReasons: string[];
  suggestedStage: string | null;
}

export interface PortfolioQuerySummary {
  totalAccounts: number;
  activeCustomers: number;
  prospects: number;
  strategicAccounts: number;
  atRiskAccounts: number;
  totalPipeline: number;
  activeDeals: number;
  contractedValue: number;
  outstandingAR: number;
}

export interface PortfolioQueryPage {
  items: PortfolioQueryRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  summary: PortfolioQuerySummary;
}

/**
 * Database-backed portfolio projection. The account page is selected first and all related
 * metrics are aggregated in SQL, so the API never materialises the tenant's deal chain in Node.
 */
export class AccountPortfolioQueryService {
  constructor(private readonly pool: Pool) {}

  async page(tenantId: string, filters: PortfolioQueryFilters, page: PageParams): Promise<PortfolioQueryPage> {
    const search = filters.search?.trim() ?? '';
    // Allow smart views to express a small set of canonical statuses (for example
    // prospect + qualified) without falling back to client-side filtering.
    const status = (filters.status ?? '').split(',').map((value) => value.trim()).filter(Boolean).join(',');
    const ownerId = filters.ownerId?.trim() ?? '';
    const health = filters.health === 'at_risk' ? 'at_risk' : '';
    const base = [tenantId, search, status, ownerId, health];

    const pageRes = await this.pool.query<Record<string, unknown>>(
      `WITH filtered AS (
         SELECT id::text AS id, name, status, party_type, industry, owner_id, phone, email, source,
                payment_terms, website, billing_address, created_at
         FROM public.aura_crm_accounts a
         WHERE a.tenant_id = $1
           AND ($2 = '' OR a.name ILIKE '%' || $2 || '%' OR a.industry ILIKE '%' || $2 || '%' OR a.email ILIKE '%' || $2 || '%' OR a.phone ILIKE '%' || $2 || '%')
           AND ($3 = '' OR a.status = ANY(string_to_array($3, ',')))
           AND ($4 = '' OR a.owner_id = $4)
           AND ($5 = '' OR ($5 = 'at_risk' AND EXISTS (
             SELECT 1 FROM public.aura_finance_customer_invoices ri
             WHERE ri.tenant_id = $1 AND ri.status NOT IN ('cancelled','paid') AND ri.due_date < CURRENT_DATE
               AND (ri.account_id::text = a.id::text OR (ri.account_id IS NULL AND ri.customer_name = a.name))
           )))
       ), page_accounts AS (
         SELECT * FROM filtered ORDER BY created_at DESC, id DESC LIMIT $6 OFFSET $7
       ), opp AS (
         SELECT account_id::text AS id,
                COUNT(*) FILTER (WHERE stage NOT IN ('won','lost'))::int AS active_deals,
                COALESCE(SUM(value) FILTER (WHERE stage NOT IN ('won','lost')), 0)::numeric AS pipeline_value
         FROM public.aura_crm_opportunities o JOIN page_accounts p ON p.id = o.account_id::text
         WHERE o.tenant_id = $1 GROUP BY o.account_id
       ), tenders AS (
         SELECT account_id::text AS id,
                COUNT(*) FILTER (WHERE t.status IN ('draft','submitted'))::int AS open_tenders
         FROM public.aura_tendering_tenders t JOIN page_accounts p ON p.id = t.account_id::text
         WHERE t.tenant_id = $1 GROUP BY t.account_id
       ), quotes AS (
         SELECT account_id::text AS id, COUNT(*)::int AS quotations
         FROM public.aura_crm_quotations q JOIN page_accounts p ON p.id = q.account_id::text
         WHERE q.tenant_id = $1 GROUP BY q.account_id
       ), contracts AS (
         SELECT account_id::text AS id,
                COUNT(*)::int AS contracts,
                COUNT(*) FILTER (WHERE c.status = 'active')::int AS active_contracts,
                COALESCE(SUM(c.value) FILTER (WHERE c.status <> 'cancelled'), 0)::numeric AS contracted_value
         FROM public.aura_contracts_contracts c JOIN page_accounts p ON p.id = c.account_id::text
         WHERE c.tenant_id = $1 GROUP BY c.account_id
       ), projects AS (
         SELECT account_id::text AS id,
                COUNT(*) FILTER (WHERE pr.status IN ('active','planned'))::int AS active_projects,
                COUNT(*) FILTER (WHERE pr.status = 'active')::int AS live_projects
         FROM public.aura_projects_projects pr JOIN page_accounts p ON p.id = pr.account_id::text
         WHERE pr.tenant_id = $1 GROUP BY pr.account_id
       ), invoices AS (
         SELECT p.id,
                COALESCE(SUM(i.total - i.amount_paid) FILTER (WHERE i.status <> 'cancelled'), 0)::numeric AS outstanding_ar,
                COALESCE(SUM(i.total - i.amount_paid) FILTER (WHERE i.status <> 'cancelled' AND i.status <> 'paid' AND i.due_date < CURRENT_DATE), 0)::numeric AS overdue_ar
         FROM public.aura_finance_customer_invoices i JOIN page_accounts p
           ON (p.id = i.account_id::text OR (i.account_id IS NULL AND i.customer_name = p.name))
         WHERE i.tenant_id = $1 GROUP BY p.id
       ), touches AS (
         SELECT account_id::text AS id, MAX(at) AS last_activity_at FROM (
           SELECT o.account_id::text, o.created_at AS at FROM public.aura_crm_opportunities o JOIN page_accounts p ON p.id = o.account_id::text WHERE o.tenant_id = $1
           UNION ALL SELECT t.account_id::text, t.created_at FROM public.aura_tendering_tenders t JOIN page_accounts p ON p.id = t.account_id::text WHERE t.tenant_id = $1
           UNION ALL SELECT q.account_id::text, q.created_at FROM public.aura_crm_quotations q JOIN page_accounts p ON p.id = q.account_id::text WHERE q.tenant_id = $1
           UNION ALL SELECT c.account_id::text, c.created_at FROM public.aura_contracts_contracts c JOIN page_accounts p ON p.id = c.account_id::text WHERE c.tenant_id = $1
           UNION ALL SELECT pr.account_id::text, pr.created_at FROM public.aura_projects_projects pr JOIN page_accounts p ON p.id = pr.account_id::text WHERE pr.tenant_id = $1
           UNION ALL SELECT a.related_id AS account_id, a.created_at FROM public.aura_crm_activities a JOIN page_accounts p ON p.id = a.related_id WHERE a.tenant_id = $1
         ) all_touches GROUP BY account_id
       )
       SELECT p.*, COALESCE(o.active_deals,0) AS active_deals, COALESCE(o.pipeline_value,0) AS pipeline_value,
              COALESCE(t.open_tenders,0) AS open_tenders, COALESCE(q.quotations,0) AS quotations,
              COALESCE(c.contracts,0) AS contracts, COALESCE(c.active_contracts,0) AS active_contracts,
              COALESCE(c.contracted_value,0) AS contracted_value, COALESCE(pr.active_projects,0) AS active_projects,
              COALESCE(pr.live_projects,0) AS live_projects, COALESCE(i.outstanding_ar,0) AS outstanding_ar,
              COALESCE(i.overdue_ar,0) AS overdue_ar, x.last_activity_at
       FROM page_accounts p
       LEFT JOIN opp o ON o.id = p.id LEFT JOIN tenders t ON t.id = p.id LEFT JOIN quotes q ON q.id = p.id
       LEFT JOIN contracts c ON c.id = p.id LEFT JOIN projects pr ON pr.id = p.id LEFT JOIN invoices i ON i.id = p.id
       LEFT JOIN touches x ON x.id = p.id`,
         [...base, page.limit, page.offset],
    );

    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_crm_accounts a
       WHERE a.tenant_id = $1
         AND ($2 = '' OR a.name ILIKE '%' || $2 || '%' OR a.industry ILIKE '%' || $2 || '%' OR a.email ILIKE '%' || $2 || '%' OR a.phone ILIKE '%' || $2 || '%')
         AND ($3 = '' OR a.status = ANY(string_to_array($3, ','))) AND ($4 = '' OR a.owner_id = $4)
         AND ($5 = '' OR ($5 = 'at_risk' AND EXISTS (
           SELECT 1 FROM public.aura_finance_customer_invoices ri
           WHERE ri.tenant_id = $1 AND ri.status NOT IN ('cancelled','paid') AND ri.due_date < CURRENT_DATE
             AND (ri.account_id::text = a.id::text OR (ri.account_id IS NULL AND ri.customer_name = a.name))
         )))`, base,
    );
    const summaryRes = await this.pool.query<Record<string, unknown>>(
      `WITH filtered AS (
         SELECT a.id::text AS id, a.name, a.status, a.owner_id FROM public.aura_crm_accounts a
         WHERE a.tenant_id = $1
           AND ($2 = '' OR a.name ILIKE '%' || $2 || '%' OR a.industry ILIKE '%' || $2 || '%' OR a.email ILIKE '%' || $2 || '%' OR a.phone ILIKE '%' || $2 || '%')
           AND ($3 = '' OR a.status = ANY(string_to_array($3, ','))) AND ($4 = '' OR a.owner_id = $4)
           AND ($5 = '' OR ($5 = 'at_risk' AND EXISTS (
             SELECT 1 FROM public.aura_finance_customer_invoices ri
             WHERE ri.tenant_id = $1 AND ri.status NOT IN ('cancelled','paid') AND ri.due_date < CURRENT_DATE
               AND (ri.account_id::text = a.id::text OR (ri.account_id IS NULL AND ri.customer_name = a.name))
           )))
       ), opp AS (
         SELECT account_id::text AS id,
                COUNT(*) FILTER (WHERE stage NOT IN ('won','lost'))::int AS active_deals,
                COALESCE(SUM(value) FILTER (WHERE stage NOT IN ('won','lost')),0)::numeric AS pipeline
         FROM public.aura_crm_opportunities WHERE tenant_id = $1 GROUP BY account_id
       ), contracts AS (
         SELECT account_id::text AS id,
                COALESCE(SUM(value) FILTER (WHERE status <> 'cancelled'),0)::numeric AS contracted_value
         FROM public.aura_contracts_contracts
         WHERE tenant_id = $1 GROUP BY account_id
       ), invoices AS (
         SELECT f.id,
                COALESCE(SUM(i.total-i.amount_paid) FILTER (WHERE i.status <> 'cancelled'),0)::numeric AS outstanding,
                COALESCE(SUM(i.total-i.amount_paid) FILTER (WHERE i.status <> 'cancelled' AND i.status <> 'paid' AND i.due_date < CURRENT_DATE),0)::numeric AS overdue
         FROM public.aura_finance_customer_invoices i JOIN filtered f
           ON (f.id = i.account_id::text OR (i.account_id IS NULL AND i.customer_name = f.name))
         WHERE i.tenant_id = $1 GROUP BY f.id
       )
       SELECT COUNT(*)::int AS total_accounts,
              COUNT(*) FILTER (WHERE f.status IN ('active_customer','strategic'))::int AS active_customers,
              COUNT(*) FILTER (WHERE f.status = 'strategic')::int AS strategic_accounts,
              COUNT(*) FILTER (WHERE f.status IN ('prospect','qualified'))::int AS prospects,
              COALESCE(SUM(o.active_deals),0)::int AS active_deals,
              COALESCE(SUM(o.pipeline),0)::numeric AS total_pipeline,
              COALESCE(SUM(c.contracted_value),0)::numeric AS contracted_value,
              COALESCE(SUM(i.outstanding),0)::numeric AS outstanding_ar,
              COUNT(*) FILTER (WHERE COALESCE(i.overdue,0) > 0)::int AS at_risk_accounts
       FROM filtered f LEFT JOIN opp o ON o.id = f.id LEFT JOIN contracts c ON c.id = f.id LEFT JOIN invoices i ON i.id = f.id`, base,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);
    const toNumber = (value: unknown): number => Number(value ?? 0);
    const items = pageRes.rows.map((r) => {
      const id = String(r.id);
      const stage = String(r.status);
      const owner = (r.owner_id as string | null) ?? null;
      const activeDeals = toNumber(r.active_deals);
      const activeContracts = toNumber(r.active_contracts);
      const activeProjects = toNumber(r.active_projects);
      const liveProjects = toNumber(r.live_projects);
      const overdueAR = toNumber(r.overdue_ar);
      const lastActivityAt = r.last_activity_at ? String(r.last_activity_at) : null;
      const staleBefore = new Date(Date.now() - 60 * 86400000).toISOString();
      const hasLiveBusiness = activeContracts > 0 || liveProjects > 0 || activeDeals > 0;
      const healthReasons: string[] = [];
      if (overdueAR > 0) healthReasons.push(`AED ${overdueAR} overdue receivables`);
      if (hasLiveBusiness && !owner) healthReasons.push('no account owner assigned');
      if (hasLiveBusiness && (!lastActivityAt || lastActivityAt < staleBefore)) healthReasons.push('no activity in 60 days');
      const stageMismatch = activeContracts > 0 && (stage === 'prospect' || stage === 'qualified');
      if (stageMismatch) healthReasons.push('has contracts but still marked a prospect');
      const health: 'healthy' | 'attention' | 'at_risk' = overdueAR > 0 ? 'at_risk' : healthReasons.length > 0 ? 'attention' : 'healthy';
      return {
      id, name: String(r.name), stage, partyType: (r.party_type as string | null) ?? null,
      industry: (r.industry as string | null) ?? null, ownerId: (r.owner_id as string | null) ?? null,
      phone: (r.phone as string | null) ?? null, email: (r.email as string | null) ?? null,
      source: (r.source as string | null) ?? null, paymentTerms: (r.payment_terms as string | null) ?? null,
      website: (r.website as string | null) ?? null, billingAddress: (r.billing_address as string | null) ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      activeDeals, pipelineValue: toNumber(r.pipeline_value), openTenders: toNumber(r.open_tenders),
      quotations: toNumber(r.quotations), contracts: toNumber(r.contracts), contractedValue: toNumber(r.contracted_value),
      activeProjects, outstandingAR: toNumber(r.outstanding_ar), overdueAR,
      lastActivityAt, activeContracts, liveProjects,
      health,
      healthReasons, suggestedStage: stageMismatch ? 'active_customer' : null,
      };
    });
    const s = summaryRes.rows[0] ?? {};
    return {
      items, total, limit: page.limit, offset: page.offset, hasMore: page.offset + items.length < total,
      summary: {
        totalAccounts: toNumber(s.total_accounts), activeCustomers: toNumber(s.active_customers), prospects: toNumber(s.prospects), strategicAccounts: toNumber(s.strategic_accounts),
        atRiskAccounts: toNumber(s.at_risk_accounts), totalPipeline: toNumber(s.total_pipeline), activeDeals: toNumber(s.active_deals), contractedValue: toNumber(s.contracted_value), outstandingAR: toNumber(s.outstanding_ar),
      },
    };
  }
}
