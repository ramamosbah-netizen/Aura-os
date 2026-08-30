import 'reflect-metadata';

// This suite is intentionally opt-in and requires DATABASE_URL from the caller. It uses a
// namespaced tenant so it never exercises or deletes business data belonging to a real tenant.
process.env.AUTH_JWT_SECRET = 'sales-mutation-release-proof-secret';
process.env.AUTH_REQUIRED = 'true';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AccessService, AuthService, TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const RUN_ID = randomUUID().replace(/-/g, '').slice(0, 12);
const TENANT = `sales-proof-${RUN_ID}`;
const OTHER_TENANT = `sales-proof-other-${RUN_ID}`;
const MAKER = `sales-proof-maker-${RUN_ID}`;
const APPROVER = `sales-proof-approver-${RUN_ID}`;
const VIEWER = `sales-proof-viewer-${RUN_ID}`;
const ROLE = `sales-proof-role-${RUN_ID}`;

describe('Sales mutation release proof (Supabase PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let auth: AuthService;
  let leadId: string;
  let opportunityId: string;
  let quotationId: string;
  let baselineId: string;
  let tenderId: string;

  const tokenFor = (sub: string, tenantId = TENANT): string => auth.mint({ sub, tenantId, companyId: null });
  const as = (sub: string, tenantId = TENANT) => ({ Authorization: `Bearer ${tokenFor(sub, tenantId)}` });
  const ownerQuery = async <T extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> => {
    const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error('owner database URL is required for audit assertions');
    const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0?\.1/.test(url) ? false : { rejectUnauthorized: false } });
    await client.connect();
    try { return (await client.query<T>(text, values)).rows; } finally { await client.end(); }
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the Sales mutation release proof');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());

    auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    app.use(async (req: any, res: any, next: () => void) => {
      const ctx = await auth.contextFromHeader(req.headers?.authorization);
      if (!ctx) {
        res.statusCode = 401;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ statusCode: 401, error: 'Unauthorized', message: 'authentication required' }));
        return;
      }
      tenant.run(ctx, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());

    access.registerRole({ id: ROLE, name: 'Sales mutation proof', permissions: ['*'] });
    for (const user of [MAKER, APPROVER]) {
      access.grant({ userId: user, roleId: ROLE, scope: { kind: 'org', level: 'tenant', id: TENANT } });
    }
    // The approver also has authority in the control tenant used by the negative isolation check.
    access.grant({ userId: APPROVER, roleId: ROLE, scope: { kind: 'org', level: 'tenant', id: OTHER_TENANT } });
  });

  afterAll(async () => {
    await app?.close();
    // Cleanup is bounded to this run's two generated tenant identifiers. Audit rows are deliberately
    // retained as immutable evidence. Business rows are deleted child-first where the tables exist;
    // a failed optional delete is ignored so cleanup never broadens its scope.
    const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) return;
    const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
    await client.connect();
    const tables = [
      'aura_document_requirements', 'aura_tendering_estimate_sources', 'aura_tendering_rate_buildups',
      'aura_tendering_boq_items', 'aura_tendering_boqs', 'aura_tendering_submissions', 'aura_tendering_bid_scores',
      'aura_tendering_clarifications', 'aura_tendering_outcomes', 'aura_contracts_contracts',
      'aura_crm_negotiation_entries', 'aura_crm_commercial_baselines',
      'aura_crm_pricing_sheets', 'aura_crm_quotations', 'aura_crm_estimate_build_ups',
      'aura_crm_estimate_revisions', 'aura_crm_estimation_basis_revisions', 'aura_crm_pre_award_packages',
      'aura_crm_scope_assist_proposals', 'aura_crm_solution_scopes', 'aura_tendering_tenders',
      'aura_crm_opportunities', 'aura_crm_lead_qualification_decisions', 'aura_crm_leads',
      'aura_crm_account_relationships', 'aura_crm_installed_base', 'aura_crm_contacts', 'aura_crm_accounts',
    ];
    try {
      for (const table of tables) {
        await client.query(`delete from public.${table} where tenant_id = any($1::text[])`, [[TENANT, OTHER_TENANT]]).catch(() => undefined);
      }
      await client.query('delete from public.aura_access_grants where user_id = any($1::text[])', [[MAKER, APPROVER, VIEWER]]).catch(() => undefined);
      await client.query('delete from public.aura_access_roles where id = $1', [ROLE]).catch(() => undefined);
    } finally {
      await client.end();
    }
  });

  it('proves canonical Lead capture → qualify → convert with idempotent replay and tenant isolation', async () => {
    const created = await http.post('/api/v1/crm/leads').set(as(MAKER)).send({
      name: `Release proof lead ${RUN_ID}`,
      companyName: `Release proof company ${RUN_ID}`,
      email: `${RUN_ID}@example.invalid`,
      source: 'referral',
      status: 'qualified',
      estimatedValue: 125000,
    }).expect(201);
    leadId = created.body.id;
    expect(created.body.tenantId).toBe(TENANT);

    const converted = await http.post(`/api/v1/crm/leads/${leadId}/convert`).set(as(MAKER)).send({
      createNewAccount: true,
      title: `Release proof opportunity ${RUN_ID}`,
      value: 125000,
    }).expect(201);
    opportunityId = converted.body.opportunity.id;
    expect(converted.body.opportunity.leadId).toBe(leadId);

    const replay = await http.post(`/api/v1/crm/leads/${leadId}/convert`).set(as(MAKER)).send({}).expect(201);
    expect(replay.body.opportunity.id).toBe(opportunityId);

    const lead = await http.get(`/api/v1/crm/leads/${leadId}`).set(as(MAKER)).expect(200);
    expect(lead.body.status).toBe('converted');
    expect(lead.body.convertedOpportunityId).toBe(opportunityId);
    const leadAudit = await ownerQuery<{ count: string }>(
      `select count(*)::text as count from public.aura_events where tenant_id=$1 and aggregate_id=$2`, [TENANT, leadId],
    );
    expect(Number(leadAudit[0]?.count ?? 0)).toBeGreaterThan(0);

    const foreignRead = await http.get(`/api/v1/crm/leads/${leadId}`).set(as(APPROVER, OTHER_TENANT));
    expect([403, 404]).toContain(foreignRead.status);
    const foreignList = await http.get('/api/v1/crm/leads').set(as(APPROVER, OTHER_TENANT)).expect(200);
    expect(foreignList.body.some((row: { id: string }) => row.id === leadId)).toBe(false);
  });

  it('proves governed quotation readiness, SoD, frozen baseline and issued-revision immutability', async () => {
    const accountId = (await http.get(`/api/v1/crm/opportunities/${opportunityId}`).set(as(MAKER)).expect(200)).body.accountId;
    const created = await http.post('/api/v1/crm/quotations').set(as(MAKER)).send({
      customerName: `Release proof customer ${RUN_ID}`,
      accountId,
      sourceOpportunityId: opportunityId,
      issueDate: '2026-08-30',
      lines: [{ description: 'Release-proof ELV package', quantity: 1, unitPrice: 100000 }],
    }).expect(201);
    quotationId = created.body.id;
    expect(created.body.approvalReadinessMode).toBe('governed');

    // Missing checklist is a governance denial, not an exemption.
    const blocked = await http.patch(`/api/v1/crm/quotations/${quotationId}/status`).set(as(APPROVER)).send({ action: 'approve' });
    expect(blocked.status).toBe(409);
    expect(String(blocked.body.message)).toMatch(/readiness|checklist/i);
    const noPermission = await http.get('/api/v1/crm/leads').set(as(VIEWER));
    expect(noPermission.status).toBe(403);

    await http.post('/api/v1/document-requirements/seed').set(as(MAKER)).send({ entityType: 'crm.quotation', entityId: quotationId }).expect(201);
    const requirements = (await http.get(`/api/v1/document-requirements?entityType=crm.quotation&entityId=${quotationId}`).set(as(MAKER)).expect(200)).body.requirements as Array<{ id: string; type: string; requiredCount: number }>;
    for (const requirement of requirements) {
      for (let i = 0; i < requirement.requiredCount; i++) {
        await http.post(`/api/v1/document-requirements/${requirement.id}/evidence`).set(as(MAKER)).send({
          type: requirement.type === 'VENDOR_QUOTE' ? 'EXTERNAL_REFERENCE' : 'DOCUMENT_ID',
          reference: `sales-proof-${RUN_ID}-${requirement.type}-${i}`,
        }).expect(201);
      }
    }

    await http.patch(`/api/v1/crm/quotations/${quotationId}/status`).set(as(MAKER)).send({ action: 'submit_review' }).expect(200);
    const approved = await http.patch(`/api/v1/crm/quotations/${quotationId}/status`).set(as(APPROVER)).send({ action: 'approve' }).expect(200);
    expect(approved.body.status).toBe('approved');
    const baseline = await http.get(`/api/v1/crm/quotations/${quotationId}/baseline`).set(as(MAKER)).expect(200);
    baselineId = baseline.body.id;
    expect(baselineId).toBeTruthy();
    expect(baseline.body.quotationId).toBe(quotationId);

    await http.patch(`/api/v1/crm/quotations/${quotationId}/status`).set(as(APPROVER)).send({ action: 'send' }).expect(200);
    const postIssueMutation = await http.patch(`/api/v1/crm/quotations/${quotationId}/terms`).set(as(APPROVER)).send({ terms: 'must not mutate issued quote' });
    expect([400, 409]).toContain(postIssueMutation.status);

    const revised = await http.post(`/api/v1/crm/quotations/${quotationId}/revise`).set(as(MAKER)).send({}).expect(201);
    expect(revised.body.id).not.toBe(quotationId);
    expect(revised.body.revision).toBeGreaterThan(approved.body.revision);
    const original = await http.get(`/api/v1/crm/quotations/${quotationId}`).set(as(MAKER)).expect(200);
    expect(original.body.status).toBe('revised');
    const baselineAgain = await http.get(`/api/v1/crm/quotations/${quotationId}/baseline`).set(as(MAKER)).expect(200);
    expect(baselineAgain.body.id).toBe(baselineId);
    const quoteAudit = await ownerQuery<{ count: string }>(
      `select count(*)::text as count from public.aura_events where tenant_id=$1 and aggregate_id=$2`, [TENANT, quotationId],
    );
    expect(Number(quoteAudit[0]?.count ?? 0)).toBeGreaterThan(0);
  });

  it('proves Tender → priced BOQ → quotation baseline → submission → award contract lineage', async () => {
    const accountId = (await http.get(`/api/v1/crm/opportunities/${opportunityId}`).set(as(MAKER)).expect(200)).body.accountId;
    const tenderOpp = (await http.post('/api/v1/crm/opportunities').set(as(MAKER)).send({
      title: `Release proof tender opportunity ${RUN_ID}`,
      value: 250000,
      accountId,
      executionType: 'tender',
    }).expect(201)).body;

    // Start as a draft and exercise the real Bid/No-Bid + submission gates. The submission fact is
    // persisted by the submit command, not inferred from the status label.
    const tender = (await http.post('/api/v1/tendering/tenders').set(as(MAKER)).send({
      title: `Release proof tender ${RUN_ID}`,
      value: 250000,
      accountId,
      sourceOpportunityId: tenderOpp.id,
      status: 'draft',
    }).expect(201)).body;
    tenderId = tender.id;
    expect(tender.sourceOpportunityId).toBe(tenderOpp.id);

    const boqView = (await http.get(`/api/v1/tendering/tenders/${tenderId}/boq`).set(as(MAKER)).expect(200)).body;
    const item = await http.post(`/api/v1/tendering/tenders/${tenderId}/boq/items`).set(as(MAKER)).send({
      boqId: boqView.boq.id,
      itemCode: '1.1',
      description: 'Tender release-proof ELV package',
      unit: 'LS',
      quantity: 1,
      rate: 300000,
    }).expect(201);

    const buildUp = await http.post('/api/v1/tendering/estimates').set(as(MAKER)).send({
      boqItemId: item.body.id,
      components: [{ costType: 'material', description: 'Release-proof equipment', quantity: 1, unitCost: 180000 }],
      overheadPercent: 5,
      profitPercent: 10,
      applyToBoq: true,
    }).expect(201);
    expect(Number(buildUp.body.sellingRate)).toBeGreaterThan(0);
    const estimate = (await http.get(`/api/v1/tendering/estimates/summary?tenderId=${tenderId}`).set(as(MAKER)).expect(200)).body;
    expect(estimate.tenderId).toBe(tenderId);
    expect(estimate.boqId).toBe(boqView.boq.id);
    expect(estimate.estimatedItemCount).toBe(1);

    const bidScore = (await http.post('/api/v1/tendering/bid-scores').set(as(MAKER)).send({
      tenderId,
      criteria: [{ name: 'Strategic fit', weight: 1, score: 95 }],
      notes: `release-proof bid decision ${RUN_ID}`,
    }).expect(201)).body;
    expect(bidScore.recommendation).toBe('go');
    const submitted = (await http.post(`/api/v1/tendering/tenders/${tenderId}/submit`).set(as(MAKER)).send({
      method: 'portal',
      portal: 'release-proof',
      reference: `SUB-${RUN_ID}`,
      addendaAcknowledged: 'yes',
    }).expect(201)).body;
    expect(submitted.tender.status).toBe('submitted');
    expect(submitted.submission.tenderId).toBe(tenderId);

    const quote = (await http.post(`/api/v1/tendering/tenders/${tenderId}/quotation`).set(as(MAKER)).send({}).expect(201)).body;
    expect(quote.sourceTenderId).toBe(tenderId);
    expect(quote.sourceOpportunityId ?? null).toBeNull();

    // New tender-generated quotations are governed exactly like direct quotations.
    await http.post('/api/v1/document-requirements/seed').set(as(MAKER)).send({ entityType: 'crm.quotation', entityId: quote.id }).expect(201);
    const reqs = (await http.get(`/api/v1/document-requirements?entityType=crm.quotation&entityId=${quote.id}`).set(as(MAKER)).expect(200)).body.requirements as Array<{ id: string; type: string; requiredCount: number }>;
    for (const requirement of reqs) {
      for (let i = 0; i < requirement.requiredCount; i++) {
        await http.post(`/api/v1/document-requirements/${requirement.id}/evidence`).set(as(MAKER)).send({
          type: requirement.type === 'VENDOR_QUOTE' ? 'EXTERNAL_REFERENCE' : 'DOCUMENT_ID',
          reference: `sales-proof-${RUN_ID}-tender-${requirement.type}-${i}`,
        }).expect(201);
      }
    }
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).set(as(MAKER)).send({ action: 'submit_review' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).set(as(APPROVER)).send({ action: 'approve' }).expect(200);
    const baseline = (await http.get(`/api/v1/crm/quotations/${quote.id}/baseline`).set(as(MAKER)).expect(200)).body;
    expect(baseline.quotationId).toBe(quote.id);

    // The tender award pins this exact baseline. A later quote/estimate change cannot be selected
    // by the award reactor because the commercialBasis is captured once on the tender.
    const awarded = await http.post(`/api/v1/tendering/tenders/${tenderId}/award`).set(as(APPROVER)).send({
      awardedValue: 310000,
      currency: 'AED',
      awardedAt: '2026-08-30T12:00:00.000Z',
      awardReference: `LOA-${RUN_ID}`,
    }).expect(201);
    expect(awarded.body.status).toBe('won');
    expect(awarded.body.commercialBasis?.baselineId).toBe(baseline.id);
    expect(awarded.body.commercialBasis?.quotationId).toBe(quote.id);

    let contracts: any[] = [];
    for (let i = 0; i < 20 && contracts.length === 0; i++) {
      contracts = (await http.get(`/api/v1/contracts/contracts?tenderId=${tenderId}`).set(as(MAKER)).expect(200)).body;
      if (contracts.length === 0) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(contracts).toHaveLength(1);
    expect(contracts[0].tenderId).toBe(tenderId);
    expect(contracts[0].commercialBaselineId).toBe(baseline.id);
    expect(contracts[0].value).toBe(baseline.total);

    // The legacy estimate write surface is not a back door around the committed quotation freeze.
    await http.post('/api/v1/tendering/estimates').set(as(MAKER)).send({
      boqItemId: item.body.id,
      components: [{ costType: 'material', description: 'post-freeze mutation', quantity: 1, unitCost: 1 }],
      applyToBoq: true,
    }).expect(409);

    // Replaying the same award is a no-op and never creates a second contract.
    await http.post(`/api/v1/tendering/tenders/${tenderId}/award`).set(as(APPROVER)).send({
      awardedValue: 310000,
      currency: 'AED',
      awardedAt: '2026-08-30T12:00:00.000Z',
      awardReference: `LOA-${RUN_ID}`,
    }).expect(201);
    const replayContracts = (await http.get(`/api/v1/contracts/contracts?tenderId=${tenderId}`).set(as(MAKER)).expect(200)).body;
    expect(replayContracts).toHaveLength(1);

    // A tender update after award may change descriptive fields, but it cannot rewrite the pinned
    // commercial basis. This is the negative control for live-tender reads after award.
    await http.patch(`/api/v1/tendering/tenders/${tenderId}`).set(as(MAKER)).send({ value: 999999 }).expect(200);
    const afterUpdate = (await http.get(`/api/v1/tendering/tenders/${tenderId}`).set(as(MAKER)).expect(200)).body;
    expect(afterUpdate.commercialBasis.baselineId).toBe(baseline.id);
    expect(afterUpdate.commercialBasis.quotationId).toBe(quote.id);
    expect((await http.get(`/api/v1/contracts/contracts/${contracts[0].id}`).set(as(MAKER)).expect(200)).body.value).toBe(baseline.total);

    const tenderAudit = await ownerQuery<{ count: string }>(
      `select count(*)::text as count from public.aura_events where tenant_id=$1 and aggregate_id=$2`, [TENANT, tenderId],
    );
    expect(Number(tenderAudit[0]?.count ?? 0)).toBeGreaterThan(0);
  }, 120_000);

  it('proves accepted Direct quotation → exact frozen baseline → idempotent contract linkage', async () => {
    const accountId = (await http.get(`/api/v1/crm/opportunities/${opportunityId}`).set(as(MAKER)).expect(200)).body.accountId;
    const directOpp = (await http.post('/api/v1/crm/opportunities').set(as(MAKER)).send({
      title: `Release proof direct contract ${RUN_ID}`,
      value: 175000,
      accountId,
      executionType: 'direct_sale',
    }).expect(201)).body;
    const quote = (await http.post('/api/v1/crm/quotations').set(as(MAKER)).send({
      customerName: `Release proof direct customer ${RUN_ID}`,
      accountId,
      sourceOpportunityId: directOpp.id,
      subject: `Release proof direct subject ${RUN_ID}`,
      issueDate: '2026-08-30',
      lines: [{ description: 'Direct release-proof scope', quantity: 1, unitPrice: 175000 }],
    }).expect(201)).body;
    expect(quote.sourceOpportunityId).toBe(directOpp.id);

    await http.post('/api/v1/document-requirements/seed').set(as(MAKER)).send({ entityType: 'crm.quotation', entityId: quote.id }).expect(201);
    const reqs = (await http.get(`/api/v1/document-requirements?entityType=crm.quotation&entityId=${quote.id}`).set(as(MAKER)).expect(200)).body.requirements as Array<{ id: string; type: string; requiredCount: number }>;
    for (const requirement of reqs) {
      for (let i = 0; i < requirement.requiredCount; i++) {
        await http.post(`/api/v1/document-requirements/${requirement.id}/evidence`).set(as(MAKER)).send({
          type: requirement.type === 'VENDOR_QUOTE' ? 'EXTERNAL_REFERENCE' : 'DOCUMENT_ID',
          reference: `sales-proof-${RUN_ID}-direct-contract-${requirement.type}-${i}`,
        }).expect(201);
      }
    }
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).set(as(MAKER)).send({ action: 'submit_review' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).set(as(APPROVER)).send({ action: 'approve' }).expect(200);
    const baseline = (await http.get(`/api/v1/crm/quotations/${quote.id}/baseline`).set(as(MAKER)).expect(200)).body;
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).set(as(APPROVER)).send({ action: 'send' }).expect(200);
    const accepted = (await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).set(as(APPROVER)).send({ action: 'accept' }).expect(200)).body;
    expect(accepted.status).toBe('accepted');

    const contract = (await http.post(`/api/v1/crm/quotations/${quote.id}/convert-to-contract`).set(as(APPROVER)).send({}).expect(201)).body;
    expect(contract.commercialBaselineId).toBe(baseline.id);
    expect(contract.value).toBe(baseline.total);
    expect(contract.accountId).toBe(accountId);
    expect(contract.title).toBe(`Release proof direct subject ${RUN_ID}`);

    // Conversion is keyed by the accepted quotation identity: a replay cannot create another
    // contract or point the quotation at a different commercial basis.
    const replay = await http.post(`/api/v1/crm/quotations/${quote.id}/convert-to-contract`).set(as(APPROVER)).send({}).expect(201);
    expect(replay.body.id).toBe(contract.id);
    const linked = (await http.get(`/api/v1/crm/quotations/${quote.id}`).set(as(MAKER)).expect(200)).body;
    expect(linked.convertedContractId).toBe(contract.id);

    const contractRows = (await http.get(`/api/v1/contracts/contracts?accountId=${accountId}`).set(as(MAKER)).expect(200)).body as Array<{ id: string; commercialBaselineId: string | null }>;
    expect(contractRows.filter((row) => row.id === contract.id)).toHaveLength(1);
    expect(contractRows.find((row) => row.id === contract.id)?.commercialBaselineId).toBe(baseline.id);
  });
});
