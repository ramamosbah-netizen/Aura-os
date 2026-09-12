import type { Pool } from 'pg';
import type { Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { CommissioningStore } from './store.interface';
import type { CommissioningRecord, CommissioningStatus, ElvSystem } from './domain/commissioning-record';
import type { CommissioningTestItem } from './domain/commissioning-test-item';
import type { CommissioningTestRun } from './domain/commissioning-test-run';
import type { CommissioningItpLink } from './domain/commissioning-itp-link';
import type { OmItem, OmDeliverable, OmItemState } from './domain/om-package';
import type { TrainingSession, TrainingState } from './domain/client-training';
import type { PunchItem } from './domain/punch-item';
import type { HandoverPackage, HandoverStatus, HandoverChecklist } from './domain/handover';

// Postgres adapter for Commissioning. The domain is a plain interface (no class rehydration),
// so mapping is a straight row → object. `date` columns are read via ::text to avoid the
// timezone-drift hazard; timestamptz columns are stored/read as ISO strings.

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  project_id: string;
  project_name: string | null;
  code: string;
  title: string;
  system: string;
  location: string | null;
  status: string;
  points_total: number;
  points_passed: number;
  test_date: string | null;
  remarks: string | null;
  commissioned_at: string | null;
  commissioned_by: string | null;
  witnessed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// SELECT list: date read via ::text to avoid timezone drift.
const COLS = `id, tenant_id, company_id, project_id, project_name, code, title, system, location,
  status, points_total, points_passed, test_date::text, remarks,
  commissioned_at, commissioned_by, witnessed_by, created_by, created_at, updated_at`;
// INSERT list: same columns, no casts (a cast is invalid in a column list).
const INSERT_COLS = `id, tenant_id, company_id, project_id, project_name, code, title, system, location,
  status, points_total, points_passed, test_date, remarks,
  commissioned_at, commissioned_by, witnessed_by, created_by, created_at, updated_at`;

function toRecord(r: Row): CommissioningRecord {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    projectId: r.project_id,
    projectName: r.project_name,
    code: r.code,
    title: r.title,
    system: r.system as ElvSystem,
    location: r.location,
    status: r.status as CommissioningStatus,
    pointsTotal: Number(r.points_total),
    pointsPassed: Number(r.points_passed),
    testDate: r.test_date,
    remarks: r.remarks,
    commissionedAt: r.commissioned_at,
    commissionedBy: r.commissioned_by,
    witnessedBy: r.witnessed_by,
    createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
  };
}

export class PostgresCommissioningStore implements CommissioningStore {
  constructor(private readonly pool: Pool) {}

  async save(rec: CommissioningRecord): Promise<void> {
    await this.pool.query(
      `insert into public.aura_commissioning_records (${INSERT_COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       on conflict (id) do update set
         project_name = excluded.project_name,
         title = excluded.title,
         system = excluded.system,
         location = excluded.location,
         status = excluded.status,
         points_total = excluded.points_total,
         points_passed = excluded.points_passed,
         test_date = excluded.test_date,
         remarks = excluded.remarks,
         commissioned_at = excluded.commissioned_at,
         commissioned_by = excluded.commissioned_by,
         witnessed_by = excluded.witnessed_by,
         updated_at = excluded.updated_at`,
      [
        rec.id, rec.tenantId, rec.companyId, rec.projectId, rec.projectName, rec.code, rec.title,
        rec.system, rec.location, rec.status, rec.pointsTotal, rec.pointsPassed, rec.testDate,
        rec.remarks, rec.commissionedAt, rec.commissionedBy, rec.witnessedBy, rec.createdBy,
        rec.createdAt, rec.updatedAt,
      ],
    );
  }

  async find(id: string, tenantId: string): Promise<CommissioningRecord | null> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_commissioning_records where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return res.rows[0] ? toRecord(res.rows[0]) : null;
  }

  async list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]> {
    const res = projectId
      ? await this.pool.query<Row>(
          `select ${COLS} from public.aura_commissioning_records
           where tenant_id = $1 and project_id = $2 order by created_at desc limit 500`,
          [tenantId, projectId],
        )
      : await this.pool.query<Row>(
          `select ${COLS} from public.aura_commissioning_records
           where tenant_id = $1 order by created_at desc limit 500`,
          [tenantId],
        );
    return res.rows.map(toRecord);
  }

  async listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>> {
    const where = projectId ? 'where tenant_id = $1 and project_id = $2' : 'where tenant_id = $1';
    const params = projectId ? [tenantId, projectId] : [tenantId];
    const countRes = await this.pool.query<{ count: string }>(
      `select count(*)::text as count from public.aura_commissioning_records ${where}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_commissioning_records ${where}
       order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.limit, page.offset],
    );
    return makePage(res.rows.map(toRecord), total, page);
  }

  // ── O&M deliverables and client training (TC-GATE-5) ───────────────────────

  async saveOmItem(i: OmItem): Promise<void> {
    // No ON CONFLICT on the natural key: the unique (commissioning_id, deliverable) constraint is
    // what stops one system carrying two "O&M manual" rows, and swallowing it would make
    // "is the pack complete" quietly unanswerable.
    await this.pool.query(
      `insert into public.aura_handover_om_items
        (id, tenant_id, company_id, project_id, commissioning_id, deliverable, required, state, document_id, notes,
         submitted_at, submitted_by, reviewed_at, reviewed_by, accepted_at, accepted_by, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       on conflict (id) do update set
         required = excluded.required, state = excluded.state, document_id = excluded.document_id, notes = excluded.notes,
         submitted_at = excluded.submitted_at, submitted_by = excluded.submitted_by,
         reviewed_at = excluded.reviewed_at, reviewed_by = excluded.reviewed_by,
         accepted_at = excluded.accepted_at, accepted_by = excluded.accepted_by, updated_at = excluded.updated_at`,
      [i.id, i.tenantId, i.companyId, i.projectId, i.commissioningId, i.deliverable, i.required, i.state, i.documentId, i.notes,
       i.submittedAt, i.submittedBy, i.reviewedAt, i.reviewedBy, i.acceptedAt, i.acceptedBy, i.createdBy, i.createdAt, i.updatedAt],
    );
  }
  async findOmItem(id: string, tenantId: string): Promise<OmItem | null> {
    const res = await this.pool.query('select * from public.aura_handover_om_items where id = $1 and tenant_id = $2', [id, tenantId]);
    return res.rowCount === 0 ? null : toOmItem(res.rows[0]);
  }
  async listOmItems(tenantId: string, projectId?: string): Promise<OmItem[]> {
    const res = await this.pool.query(
      `select * from public.aura_handover_om_items
        where tenant_id = $1 and ($2::text is null or project_id = $2)
        order by created_at asc`,
      [tenantId, projectId ?? null],
    );
    return res.rows.map(toOmItem);
  }

  async saveTrainingSession(s: TrainingSession): Promise<void> {
    await this.pool.query(
      `insert into public.aura_handover_training_sessions
        (id, tenant_id, company_id, project_id, commissioning_id, title, topics, trainer, session_date, duration_minutes,
         attendees, demonstration_completed, state, acknowledged_by, acknowledged_at, material_document_id, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       on conflict (id) do update set
         title = excluded.title, topics = excluded.topics, trainer = excluded.trainer,
         session_date = excluded.session_date, duration_minutes = excluded.duration_minutes,
         attendees = excluded.attendees, demonstration_completed = excluded.demonstration_completed,
         state = excluded.state, acknowledged_by = excluded.acknowledged_by, acknowledged_at = excluded.acknowledged_at,
         material_document_id = excluded.material_document_id, updated_at = excluded.updated_at`,
      [s.id, s.tenantId, s.companyId, s.projectId, s.commissioningId, s.title, s.topics, s.trainer, s.sessionDate, s.durationMinutes,
       s.attendees, s.demonstrationCompleted, s.state, s.acknowledgedBy, s.acknowledgedAt, s.materialDocumentId, s.createdBy, s.createdAt, s.updatedAt],
    );
  }
  async findTrainingSession(id: string, tenantId: string): Promise<TrainingSession | null> {
    const res = await this.pool.query('select * from public.aura_handover_training_sessions where id = $1 and tenant_id = $2', [id, tenantId]);
    return res.rowCount === 0 ? null : toTraining(res.rows[0]);
  }
  async listTrainingSessions(tenantId: string, projectId?: string): Promise<TrainingSession[]> {
    const res = await this.pool.query(
      `select *, session_date::text as session_date_text from public.aura_handover_training_sessions
        where tenant_id = $1 and ($2::text is null or project_id = $2)
        order by created_at asc`,
      [tenantId, projectId ?? null],
    );
    return res.rows.map(toTraining);
  }

  // ── Handover packages ──────────────────────────────────────────────────────

  async saveHandover(p: HandoverPackage): Promise<void> {
    await this.pool.query(
      `insert into public.aura_handover_packages
         (id, tenant_id, company_id, project_id, project_name, code, title, status, checklist,
          submitted_at, accepted_at, client_representative, warranty_start_date, warranty_months,
          remarks, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       on conflict (id) do update set
         project_name = excluded.project_name,
         title = excluded.title,
         status = excluded.status,
         checklist = excluded.checklist,
         submitted_at = excluded.submitted_at,
         accepted_at = excluded.accepted_at,
         client_representative = excluded.client_representative,
         warranty_start_date = excluded.warranty_start_date,
         warranty_months = excluded.warranty_months,
         remarks = excluded.remarks,
         updated_at = excluded.updated_at`,
      [
        p.id, p.tenantId, p.companyId, p.projectId, p.projectName, p.code, p.title, p.status,
        JSON.stringify(p.checklist), p.submittedAt, p.acceptedAt, p.clientRepresentative,
        p.warrantyStartDate, p.warrantyMonths, p.remarks, p.createdBy, p.createdAt, p.updatedAt,
      ],
    );
  }

  async findHandover(id: string, tenantId: string): Promise<HandoverPackage | null> {
    const res = await this.pool.query<HandoverRow>(
      `select ${HANDOVER_COLS} from public.aura_handover_packages where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return res.rows[0] ? toHandover(res.rows[0]) : null;
  }

  async listHandovers(tenantId: string, projectId?: string): Promise<HandoverPackage[]> {
    const res = projectId
      ? await this.pool.query<HandoverRow>(
          `select ${HANDOVER_COLS} from public.aura_handover_packages
           where tenant_id = $1 and project_id = $2 order by created_at desc limit 500`,
          [tenantId, projectId],
        )
      : await this.pool.query<HandoverRow>(
          `select ${HANDOVER_COLS} from public.aura_handover_packages
           where tenant_id = $1 order by created_at desc limit 500`,
          [tenantId],
        );
    return res.rows.map(toHandover);
  }

  // ── Test-sheet items ─────────────────────────────────────────────────────────

  async saveTestItem(i: CommissioningTestItem): Promise<void> {
    await this.pool.query(
      `insert into public.aura_commissioning_test_items
        (id, tenant_id, company_id, commissioning_id, project_id, point_no, description, expected, actual, result, remarks, tested_by, tested_at, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (id) do update set actual = excluded.actual, result = excluded.result, remarks = excluded.remarks, tested_by = excluded.tested_by, tested_at = excluded.tested_at`,
      [i.id, i.tenantId, i.companyId, i.commissioningId, i.projectId, i.pointNo, i.description, i.expected, i.actual, i.result, i.remarks, i.testedBy, i.testedAt, i.createdAt],
    );
  }
  async findTestItem(id: string, tenantId: string): Promise<CommissioningTestItem | null> {
    const res = await this.pool.query(`select * from public.aura_commissioning_test_items where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : toTestItem(res.rows[0]);
  }

  // ── Test runs (append-only; the table grants no UPDATE or DELETE — migration 0296) ────────────

  async appendTestRun(r: CommissioningTestRun): Promise<void> {
    // Plain insert, no ON CONFLICT: the (test_item_id, run_no) unique constraint is the concurrency
    // guard, and swallowing its violation would let a second writer's run vanish silently.
    await this.pool.query(
      `insert into public.aura_commissioning_test_runs
        (id, tenant_id, company_id, test_item_id, commissioning_id, project_id, run_no, result, actual, remarks, tested_by, tested_at, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [r.id, r.tenantId, r.companyId, r.testItemId, r.commissioningId, r.projectId, r.runNo, r.result, r.actual, r.remarks, r.testedBy, r.testedAt, r.createdAt],
    );
  }
  async listTestRunsForItem(testItemId: string, tenantId: string): Promise<CommissioningTestRun[]> {
    const res = await this.pool.query(
      `select * from public.aura_commissioning_test_runs where test_item_id = $1 and tenant_id = $2 order by run_no asc`,
      [testItemId, tenantId],
    );
    return res.rows.map(toTestRun);
  }
  async listTestRuns(commissioningId: string, tenantId: string): Promise<CommissioningTestRun[]> {
    const res = await this.pool.query(
      `select * from public.aura_commissioning_test_runs where commissioning_id = $1 and tenant_id = $2 order by test_item_id asc, run_no asc`,
      [commissioningId, tenantId],
    );
    return res.rows.map(toTestRun);
  }
  async listTestItems(commissioningId: string, tenantId: string): Promise<CommissioningTestItem[]> {
    const res = await this.pool.query(`select * from public.aura_commissioning_test_items where commissioning_id = $1 and tenant_id = $2 order by created_at asc`, [commissioningId, tenantId]);
    return res.rows.map(toTestItem);
  }

  // ── Punch list ───────────────────────────────────────────────────────────────

  async savePunchItem(i: PunchItem): Promise<void> {
    await this.pool.query(
      `insert into public.aura_commissioning_punch_items
        (id, tenant_id, company_id, commissioning_id, project_id, description, severity, location, status, raised_by, resolution, closed_by, closed_at, test_item_id, source_run_id, escalation_requested_at, escalated_by, quality_ncr_id, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       on conflict (id) do update set status = excluded.status, resolution = excluded.resolution,
         closed_by = excluded.closed_by, closed_at = excluded.closed_at,
         escalation_requested_at = excluded.escalation_requested_at, escalated_by = excluded.escalated_by,
         quality_ncr_id = excluded.quality_ncr_id, updated_at = excluded.updated_at`,
      [i.id, i.tenantId, i.companyId, i.commissioningId, i.projectId, i.description, i.severity, i.location, i.status, i.raisedBy, i.resolution, i.closedBy, i.closedAt, i.testItemId, i.sourceRunId, i.escalationRequestedAt, i.escalatedBy, i.qualityNcrId, i.createdAt, i.updatedAt],
    );
  }
  async findPunchItem(id: string, tenantId: string): Promise<PunchItem | null> {
    const res = await this.pool.query(`select * from public.aura_commissioning_punch_items where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : toPunch(res.rows[0]);
  }
  async listPunchItems(commissioningId: string, tenantId: string): Promise<PunchItem[]> {
    const res = await this.pool.query(`select * from public.aura_commissioning_punch_items where commissioning_id = $1 and tenant_id = $2 order by created_at asc`, [commissioningId, tenantId]);
    return res.rows.map(toPunch);
  }

  // ── Workspace-wide reads (one query each, not one per record) ─────────────────────────────────

  async listTestItemsForProject(tenantId: string, projectId?: string): Promise<CommissioningTestItem[]> {
    const res = await this.pool.query(
      `select * from public.aura_commissioning_test_items
        where tenant_id = $1 and ($2::text is null or project_id = $2)
        order by created_at asc`,
      [tenantId, projectId ?? null],
    );
    return res.rows.map(toTestItem);
  }
  async listTestRunsForProject(tenantId: string, projectId?: string): Promise<CommissioningTestRun[]> {
    const res = await this.pool.query(
      `select * from public.aura_commissioning_test_runs
        where tenant_id = $1 and ($2::text is null or project_id = $2)
        order by test_item_id asc, run_no asc`,
      [tenantId, projectId ?? null],
    );
    return res.rows.map(toTestRun);
  }
  // ── ITP links (TC-GATE-3) ─────────────────────────────────────────────────────────────────────

  async saveItpLink(l: CommissioningItpLink): Promise<void> {
    // No ON CONFLICT DO NOTHING: the unique constraint is the guard against linking one requirement
    // twice, and swallowing it would tell the user their second link took when it did not.
    await this.pool.query(
      `insert into public.aura_commissioning_itp_links
        (id, tenant_id, company_id, commissioning_id, project_id, itp_id, point_index, test_item_id, linked_by, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (commissioning_id, itp_id, point_index) do update set test_item_id = excluded.test_item_id`,
      [l.id, l.tenantId, l.companyId, l.commissioningId, l.projectId, l.itpId, l.pointIndex, l.testItemId, l.linkedBy, l.createdAt],
    );
  }
  async deleteItpLink(id: string, tenantId: string): Promise<void> {
    await this.pool.query('delete from public.aura_commissioning_itp_links where id = $1 and tenant_id = $2', [id, tenantId]);
  }
  async listItpLinks(commissioningId: string, tenantId: string): Promise<CommissioningItpLink[]> {
    const res = await this.pool.query(
      'select * from public.aura_commissioning_itp_links where commissioning_id = $1 and tenant_id = $2 order by created_at asc',
      [commissioningId, tenantId],
    );
    return res.rows.map(toItpLink);
  }
  async listItpLinksForProject(tenantId: string, projectId?: string): Promise<CommissioningItpLink[]> {
    const res = await this.pool.query(
      `select * from public.aura_commissioning_itp_links
        where tenant_id = $1 and ($2::text is null or project_id = $2)
        order by created_at asc`,
      [tenantId, projectId ?? null],
    );
    return res.rows.map(toItpLink);
  }

  async listPunchItemsForProject(tenantId: string, projectId?: string): Promise<PunchItem[]> {
    const res = await this.pool.query(
      `select * from public.aura_commissioning_punch_items
        where tenant_id = $1 and ($2::text is null or project_id = $2)
        order by created_at asc`,
      [tenantId, projectId ?? null],
    );
    return res.rows.map(toPunch);
  }
}

const tsIso = (v: unknown): string | null => (v == null ? null : typeof v === 'string' ? v : new Date(v as string).toISOString());

function toTestRun(r: Record<string, unknown>): CommissioningTestRun {
  return {
    id: r.id as string, tenantId: r.tenant_id as string, companyId: (r.company_id as string) ?? null,
    testItemId: r.test_item_id as string, commissioningId: r.commissioning_id as string, projectId: r.project_id as string,
    runNo: Number(r.run_no), result: r.result as CommissioningTestRun['result'],
    actual: (r.actual as string) ?? null, remarks: (r.remarks as string) ?? null,
    testedBy: (r.tested_by as string) ?? null,
    testedAt: tsIso(r.tested_at) as string, createdAt: tsIso(r.created_at) as string,
  };
}

function toTestItem(r: Record<string, unknown>): CommissioningTestItem {
  return {
    id: r.id as string, tenantId: r.tenant_id as string, companyId: (r.company_id as string) ?? null,
    commissioningId: r.commissioning_id as string, projectId: r.project_id as string,
    pointNo: r.point_no as string, description: r.description as string, expected: (r.expected as string) ?? null,
    actual: (r.actual as string) ?? null, result: r.result as CommissioningTestItem['result'], remarks: (r.remarks as string) ?? null,
    testedBy: (r.tested_by as string) ?? null, testedAt: tsIso(r.tested_at), createdAt: tsIso(r.created_at) as string,
  };
}

function toOmItem(r: Record<string, unknown>): OmItem {
  return {
    id: r.id as string, tenantId: r.tenant_id as string, companyId: (r.company_id as string) ?? null,
    projectId: r.project_id as string, commissioningId: r.commissioning_id as string,
    deliverable: r.deliverable as OmDeliverable, required: Boolean(r.required), state: r.state as OmItemState,
    documentId: (r.document_id as string) ?? null, notes: (r.notes as string) ?? null,
    submittedAt: tsIso(r.submitted_at), submittedBy: (r.submitted_by as string) ?? null,
    reviewedAt: tsIso(r.reviewed_at), reviewedBy: (r.reviewed_by as string) ?? null,
    acceptedAt: tsIso(r.accepted_at), acceptedBy: (r.accepted_by as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
    createdAt: tsIso(r.created_at) as string, updatedAt: tsIso(r.updated_at) as string,
  };
}

function toTraining(r: Record<string, unknown>): TrainingSession {
  return {
    id: r.id as string, tenantId: r.tenant_id as string, companyId: (r.company_id as string) ?? null,
    projectId: r.project_id as string, commissioningId: (r.commissioning_id as string) ?? null,
    title: r.title as string, topics: (r.topics as string) ?? null, trainer: (r.trainer as string) ?? null,
    // date read as text: a plain date must not acquire a timezone on the way out.
    sessionDate: (r.session_date_text as string) ?? (typeof r.session_date === 'string' ? r.session_date : null),
    durationMinutes: r.duration_minutes == null ? null : Number(r.duration_minutes),
    attendees: (r.attendees as string) ?? null,
    demonstrationCompleted: Boolean(r.demonstration_completed),
    state: r.state as TrainingState,
    acknowledgedBy: (r.acknowledged_by as string) ?? null, acknowledgedAt: tsIso(r.acknowledged_at),
    materialDocumentId: (r.material_document_id as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
    createdAt: tsIso(r.created_at) as string, updatedAt: tsIso(r.updated_at) as string,
  };
}

function toItpLink(r: Record<string, unknown>): CommissioningItpLink {
  return {
    id: r.id as string, tenantId: r.tenant_id as string, companyId: (r.company_id as string) ?? null,
    commissioningId: r.commissioning_id as string, projectId: r.project_id as string,
    itpId: r.itp_id as string,
    pointIndex: r.point_index == null ? null : Number(r.point_index),
    testItemId: (r.test_item_id as string) ?? null,
    linkedBy: (r.linked_by as string) ?? null,
    createdAt: tsIso(r.created_at) as string,
  };
}

function toPunch(r: Record<string, unknown>): PunchItem {
  return {
    id: r.id as string, tenantId: r.tenant_id as string, companyId: (r.company_id as string) ?? null,
    commissioningId: r.commissioning_id as string, projectId: r.project_id as string,
    description: r.description as string, severity: r.severity as PunchItem['severity'], location: (r.location as string) ?? null,
    status: r.status as PunchItem['status'], raisedBy: (r.raised_by as string) ?? null, resolution: (r.resolution as string) ?? null,
    closedBy: (r.closed_by as string) ?? null, closedAt: tsIso(r.closed_at),
    testItemId: (r.test_item_id as string) ?? null, sourceRunId: (r.source_run_id as string) ?? null,
    escalationRequestedAt: tsIso(r.escalation_requested_at), escalatedBy: (r.escalated_by as string) ?? null,
    qualityNcrId: (r.quality_ncr_id as string) ?? null,
    createdAt: tsIso(r.created_at) as string, updatedAt: tsIso(r.updated_at) as string,
  };
}

interface HandoverRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  project_id: string;
  project_name: string | null;
  code: string;
  title: string;
  status: string;
  checklist: HandoverChecklist | string;
  submitted_at: string | null;
  accepted_at: string | null;
  client_representative: string | null;
  warranty_start_date: string | null;
  warranty_months: number | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const HANDOVER_COLS = `id, tenant_id, company_id, project_id, project_name, code, title, status,
  checklist, submitted_at, accepted_at, client_representative, warranty_start_date::text,
  warranty_months, remarks, created_by, created_at, updated_at`;

function toHandover(r: HandoverRow): HandoverPackage {
  const checklist = (typeof r.checklist === 'string' ? JSON.parse(r.checklist) : r.checklist) as HandoverChecklist;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    projectId: r.project_id,
    projectName: r.project_name,
    code: r.code,
    title: r.title,
    status: r.status as HandoverStatus,
    checklist: {
      omManuals: !!checklist?.omManuals,
      asBuilts: !!checklist?.asBuilts,
      testCertificates: !!checklist?.testCertificates,
      warrantyDocs: !!checklist?.warrantyDocs,
      training: !!checklist?.training,
      spares: !!checklist?.spares,
    },
    submittedAt: r.submitted_at,
    acceptedAt: r.accepted_at,
    clientRepresentative: r.client_representative,
    warrantyStartDate: r.warranty_start_date,
    warrantyMonths: r.warranty_months == null ? null : Number(r.warranty_months),
    remarks: r.remarks,
    createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
  };
}
