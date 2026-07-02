import type { Pool } from 'pg';
import type { Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import { AmcStore } from './store.interface';
import { ServiceContract } from './domain/service-contract';
import { WorkOrder } from './domain/work-order';
import { SupportTicket } from './domain/support-ticket';
import { PpmSchedule, PpmFrequency } from './domain/ppm-schedule';

// Postgres adapter for AMC — the persistence the module was missing (it was in-memory
// only). The domain entities are classes whose constructors compute createdAt/updatedAt
// (and SupportTicket's slaDueAt), so rehydration = construct, then Object.assign the
// persisted state — including read-only fields TypeScript guards at compile time but that
// Object.assign restores at runtime. `date` columns are read via ::text to avoid the
// timezone-drift hazard that bit other stores; timestamptz columns map natively.

/** Date → 'YYYY-MM-DD' (UTC), for `date` columns. */
function toDate(d: Date | undefined | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
/** Row temporal value (string from ::text, or native Date) → Date. */
function toDateObj(v: unknown): Date | undefined {
  return v == null ? undefined : new Date(v as string);
}

interface ContractRow {
  id: string; tenant_id: string; company_id: string | null; contract_number: string;
  client_name: string; asset_id: string | null; service_scope: string;
  start_date: string; end_date: string; value: string; currency: string; status: string;
  sla_response_hours: number; sla_resolution_hours: number; created_at: Date; updated_at: Date;
}
interface WorkOrderRow {
  id: string; tenant_id: string; company_id: string | null; contract_id: string | null;
  order_number: string; asset_id: string | null; description: string; priority: string;
  type: string; status: string; assigned_to: string | null; scheduled_date: string | null;
  completed_date: string | null; location_lat: string | null; location_lng: string | null;
  location_label: string | null; cost: string | null; created_at: Date; updated_at: Date;
}
interface TicketRow {
  id: string; tenant_id: string; company_id: string | null; contract_id: string | null;
  ticket_number: string; title: string; description: string; category: string; priority: string;
  status: string; reported_by: string; assigned_to: string | null;
  sla_response_hours: number; sla_resolution_hours: number;
  sla_due_at: Date | null; resolved_at: Date | null; escalation_level: number | null; created_at: Date; updated_at: Date;
}
interface PpmRow {
  id: string; tenant_id: string; company_id: string | null; contract_id: string;
  asset_id: string | null; task_description: string; frequency: string;
  start_date: string; next_due_date: string; active: boolean; visits_generated: number;
  created_at: Date; updated_at: Date;
}

const CONTRACT_COLS = `id, tenant_id, company_id, contract_number, client_name, asset_id, service_scope,
  start_date::text, end_date::text, value, currency, status, sla_response_hours, sla_resolution_hours,
  created_at, updated_at`;
const WORK_ORDER_COLS = `id, tenant_id, company_id, contract_id, order_number, asset_id, description,
  priority, type, status, assigned_to, scheduled_date::text, completed_date::text,
  location_lat, location_lng, location_label, cost, created_at, updated_at`;
const TICKET_COLS = `id, tenant_id, company_id, contract_id, ticket_number, title, description, category,
  priority, status, reported_by, assigned_to, sla_response_hours, sla_resolution_hours,
  sla_due_at, resolved_at, escalation_level, created_at, updated_at`;
const PPM_COLS = `id, tenant_id, company_id, contract_id, asset_id, task_description, frequency,
  start_date::text, next_due_date::text, active, visits_generated, created_at, updated_at`;

function rowToContract(r: ContractRow): ServiceContract {
  const c = new ServiceContract({
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id ?? undefined,
    contractNumber: r.contract_number,
    clientName: r.client_name,
    assetId: r.asset_id ?? undefined,
    serviceScope: r.service_scope,
    startDate: new Date(r.start_date),
    endDate: new Date(r.end_date),
    value: Number(r.value),
    currency: r.currency,
    status: r.status as ServiceContract['status'],
    slaResponseHours: r.sla_response_hours,
    slaResolutionHours: r.sla_resolution_hours,
  });
  Object.assign(c, { createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at) });
  return c;
}

function rowToWorkOrder(r: WorkOrderRow): WorkOrder {
  const location = r.location_lat != null && r.location_lng != null
    ? { lat: Number(r.location_lat), lng: Number(r.location_lng), label: r.location_label ?? undefined }
    : undefined;
  const wo = new WorkOrder({
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id ?? undefined,
    contractId: r.contract_id ?? undefined,
    orderNumber: r.order_number,
    assetId: r.asset_id ?? undefined,
    description: r.description,
    priority: r.priority as WorkOrder['priority'],
    type: r.type as WorkOrder['type'],
    location,
    scheduledDate: toDateObj(r.scheduled_date),
  });
  Object.assign(wo, {
    status: r.status as WorkOrder['status'],
    assignedTo: r.assigned_to ?? undefined,
    completedDate: toDateObj(r.completed_date),
    cost: r.cost == null ? undefined : Number(r.cost),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  });
  return wo;
}

function rowToTicket(r: TicketRow): SupportTicket {
  const t = new SupportTicket({
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id ?? undefined,
    contractId: r.contract_id ?? undefined,
    ticketNumber: r.ticket_number,
    title: r.title,
    description: r.description,
    category: r.category,
    priority: r.priority as SupportTicket['priority'],
    reportedBy: r.reported_by,
    slaResponseHours: r.sla_response_hours,
    slaResolutionHours: r.sla_resolution_hours,
  });
  Object.assign(t, {
    status: r.status as SupportTicket['status'],
    assignedTo: r.assigned_to ?? undefined,
    resolvedAt: toDateObj(r.resolved_at),
    slaDueAt: r.sla_due_at ? new Date(r.sla_due_at) : t.slaDueAt,
    escalationLevel: Number(r.escalation_level ?? 0),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  });
  return t;
}

function rowToPpm(r: PpmRow): PpmSchedule {
  const p = new PpmSchedule({
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id ?? undefined,
    contractId: r.contract_id,
    assetId: r.asset_id ?? undefined,
    taskDescription: r.task_description,
    frequency: r.frequency as PpmFrequency,
    startDate: new Date(r.start_date),
  });
  Object.assign(p, {
    nextDueDate: new Date(r.next_due_date),
    active: r.active,
    visitsGenerated: r.visits_generated,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  });
  return p;
}

export class PostgresAmcStore implements AmcStore {
  constructor(private readonly pool: Pool) {}

  // --- Service Contracts ---
  async saveContract(c: ServiceContract): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_amc_service_contracts
         (id, tenant_id, company_id, contract_number, client_name, asset_id, service_scope,
          start_date, end_date, value, currency, status, sla_response_hours, sla_resolution_hours,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, service_scope = EXCLUDED.service_scope,
         value = EXCLUDED.value, end_date = EXCLUDED.end_date, updated_at = EXCLUDED.updated_at`,
      [
        c.id, c.tenantId, c.companyId ?? null, c.contractNumber, c.clientName, c.assetId ?? null,
        c.serviceScope, toDate(c.startDate), toDate(c.endDate), c.value, c.currency, c.status,
        c.slaResponseHours, c.slaResolutionHours, c.createdAt, c.updatedAt,
      ],
    );
  }
  async findContract(id: string): Promise<ServiceContract | null> {
    const res = await this.pool.query<ContractRow>(
      `SELECT ${CONTRACT_COLS} FROM public.aura_amc_service_contracts WHERE id = $1`, [id],
    );
    return res.rows.length ? rowToContract(res.rows[0]) : null;
  }
  async listContracts(tenantId: string): Promise<ServiceContract[]> {
    const res = await this.pool.query<ContractRow>(
      `SELECT ${CONTRACT_COLS} FROM public.aura_amc_service_contracts WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return res.rows.map(rowToContract);
  }

  // --- Work Orders ---
  async saveWorkOrder(o: WorkOrder): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_amc_work_orders
         (id, tenant_id, company_id, contract_id, order_number, asset_id, description, priority, type,
          status, assigned_to, scheduled_date, completed_date, location_lat, location_lng, location_label,
          cost, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, assigned_to = EXCLUDED.assigned_to,
         completed_date = EXCLUDED.completed_date, cost = EXCLUDED.cost, updated_at = EXCLUDED.updated_at`,
      [
        o.id, o.tenantId, o.companyId ?? null, o.contractId ?? null, o.orderNumber, o.assetId ?? null,
        o.description, o.priority, o.type, o.status, o.assignedTo ?? null, toDate(o.scheduledDate),
        toDate(o.completedDate), o.location?.lat ?? null, o.location?.lng ?? null, o.location?.label ?? null,
        o.cost ?? null, o.createdAt, o.updatedAt,
      ],
    );
  }
  async findWorkOrder(id: string): Promise<WorkOrder | null> {
    const res = await this.pool.query<WorkOrderRow>(
      `SELECT ${WORK_ORDER_COLS} FROM public.aura_amc_work_orders WHERE id = $1`, [id],
    );
    return res.rows.length ? rowToWorkOrder(res.rows[0]) : null;
  }
  async listWorkOrders(tenantId: string, contractId?: string): Promise<WorkOrder[]> {
    const params: unknown[] = [tenantId];
    let sql = `SELECT ${WORK_ORDER_COLS} FROM public.aura_amc_work_orders WHERE tenant_id = $1`;
    if (contractId) { params.push(contractId); sql += ` AND contract_id = $2`; }
    sql += ` ORDER BY created_at DESC`;
    const res = await this.pool.query<WorkOrderRow>(sql, params);
    return res.rows.map(rowToWorkOrder);
  }

  async listWorkOrdersPaged(tenantId: string, page: PageParams, contractId?: string): Promise<Page<WorkOrder>> {
    const params: unknown[] = [tenantId];
    let whereSql = `WHERE tenant_id = $1`;
    if (contractId) { params.push(contractId); whereSql += ` AND contract_id = $2`; }
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_amc_work_orders ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<WorkOrderRow>(
      `SELECT ${WORK_ORDER_COLS} FROM public.aura_amc_work_orders ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToWorkOrder), total, page);
  }

  // --- Tickets ---
  async saveTicket(t: SupportTicket): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_amc_tickets
         (id, tenant_id, company_id, contract_id, ticket_number, title, description, category, priority,
          status, reported_by, assigned_to, sla_response_hours, sla_resolution_hours, sla_due_at,
          resolved_at, escalation_level, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, assigned_to = EXCLUDED.assigned_to,
         resolved_at = EXCLUDED.resolved_at, escalation_level = EXCLUDED.escalation_level, updated_at = EXCLUDED.updated_at`,
      [
        t.id, t.tenantId, t.companyId ?? null, t.contractId ?? null, t.ticketNumber, t.title,
        t.description, t.category, t.priority, t.status, t.reportedBy, t.assignedTo ?? null,
        t.slaResponseHours, t.slaResolutionHours, t.slaDueAt, t.resolvedAt ?? null, t.escalationLevel, t.createdAt, t.updatedAt,
      ],
    );
  }
  async findTicket(id: string): Promise<SupportTicket | null> {
    const res = await this.pool.query<TicketRow>(
      `SELECT ${TICKET_COLS} FROM public.aura_amc_tickets WHERE id = $1`, [id],
    );
    return res.rows.length ? rowToTicket(res.rows[0]) : null;
  }
  async listTickets(tenantId: string, contractId?: string): Promise<SupportTicket[]> {
    const params: unknown[] = [tenantId];
    let sql = `SELECT ${TICKET_COLS} FROM public.aura_amc_tickets WHERE tenant_id = $1`;
    if (contractId) { params.push(contractId); sql += ` AND contract_id = $2`; }
    sql += ` ORDER BY created_at DESC`;
    const res = await this.pool.query<TicketRow>(sql, params);
    return res.rows.map(rowToTicket);
  }

  async listTicketsPaged(tenantId: string, page: PageParams, contractId?: string): Promise<Page<SupportTicket>> {
    const params: unknown[] = [tenantId];
    let whereSql = `WHERE tenant_id = $1`;
    if (contractId) { params.push(contractId); whereSql += ` AND contract_id = $2`; }
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_amc_tickets ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<TicketRow>(
      `SELECT ${TICKET_COLS} FROM public.aura_amc_tickets ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToTicket), total, page);
  }

  // --- PPM Schedules ---
  async savePpm(p: PpmSchedule): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_amc_ppm_schedules
         (id, tenant_id, company_id, contract_id, asset_id, task_description, frequency, start_date,
          next_due_date, active, visits_generated, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         next_due_date = EXCLUDED.next_due_date, active = EXCLUDED.active,
         visits_generated = EXCLUDED.visits_generated, updated_at = EXCLUDED.updated_at`,
      [
        p.id, p.tenantId, p.companyId ?? null, p.contractId, p.assetId ?? null, p.taskDescription,
        p.frequency, toDate(p.startDate), toDate(p.nextDueDate), p.active, p.visitsGenerated,
        p.createdAt, p.updatedAt,
      ],
    );
  }
  async findPpm(id: string): Promise<PpmSchedule | null> {
    const res = await this.pool.query<PpmRow>(
      `SELECT ${PPM_COLS} FROM public.aura_amc_ppm_schedules WHERE id = $1`, [id],
    );
    return res.rows.length ? rowToPpm(res.rows[0]) : null;
  }
  async listPpms(tenantId: string, contractId?: string): Promise<PpmSchedule[]> {
    const params: unknown[] = [tenantId];
    let sql = `SELECT ${PPM_COLS} FROM public.aura_amc_ppm_schedules WHERE tenant_id = $1`;
    if (contractId) { params.push(contractId); sql += ` AND contract_id = $2`; }
    sql += ` ORDER BY created_at DESC`;
    const res = await this.pool.query<PpmRow>(sql, params);
    return res.rows.map(rowToPpm);
  }
}
