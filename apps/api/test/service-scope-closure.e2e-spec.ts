import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { AccessService, AuthService, TenantContext, ProjectResolverRegistry } from '@aura/core';
import { AccessDeniedError } from '@aura/shared';
import { EngineeringService } from '@aura/engineering';
import { DocControlService } from '@aura/doccontrol';
import { SiteService } from '@aura/site';
import { QualityService } from '@aura/quality';
import { HseService } from '@aura/hse';
import { CommissioningService } from '@aura/commissioning';
import { ProjectService, CbsService, WbsService, VariationService, CloseoutService, DelayEotService,
  ProjectRiskService, ProjectIssueService, ProjectRiskMaterialisationService, DeliveryItemMapService } from '@aura/projects';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { deliveryFixture } from './scope-delivery.fixture';
import classification from '../src/service-scope-classification.json';

// The adapter handles heterogeneous domain contracts; services, stores, transactions and the
// permission evaluator are real. No authorization is stubbed. Every actor is JWT-verified.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>;
type Invoke = (actor: string, project?: string) => Promise<Data>;
type Case = { key: string; permission: string; create?: boolean; setup: (project: string) => Promise<Invoke> };
const T = 'scope-closure-tenant';
let app: INestApplication, access: AccessService, auth: AuthService, tenant: TenantContext;
let eng: EngineeringService, doc: DocControlService, site: SiteService, quality: QualityService, hse: HseService;
let projects: ProjectService, cbs: CbsService, wbs: WbsService, variations: VariationService, closeout: CloseoutService, delays: DelayEotService;
let mine: string, other: string, foreign: string;
let serial = 0;
const cases: Case[] = [];
function data(projectId: string, extra: Data = {}): Data {
  const code = `SC-${++serial}`;
  return { tenantId: T, projectId, code, title: code, reference: code, documentNumber: code,
    description: 'Scoped proof', date: '2026-09-13', talkDate: '2026-09-13', startDate: '2026-09-13',
    question: 'Confirm detail', query: 'Confirm detail', subject: 'Scoped correspondence', direction: 'outbound',
    discipline: 'elv', submittalType: 'material', priority: 'medium', severity: 'minor',
    changeType: 'design', reason: 'Design clarification', docType: 'method_statement',
    fields: {}, modelName: code, name: code, format: 'ifc', fileUrl: 'https://example.test/model.ifc',
    instruction: 'Inspect installation', issuedBy: 'engineer', delayType: 'weather',
    materialName: 'Cable', itemId: 'cable-scope', itemName: 'Cable', quantityConsumed: 1, quantity: 1, unit: 'm', trade: 'electrician', headcount: 1, hours: 1,
    equipment: 'Lift', boqItemId: 'scope-boq', ncrNumber: code, irNumber: code,
    locationDetail: 'Zone 1', inspectionDate: '2026-09-13', location: 'Zone 1',
    points: [{ activity: 'Inspect', pointType: 'hold' }], equipmentName: 'Meter', equipmentSerial: code,
    calibrationDate: '2026-09-01', dueDate: '2027-01-01', auditNumber: code, auditType: 'internal',
    scheduledDate: '2026-09-13', auditorName: 'Auditor', checklist: [], activity: 'Installation', hazards: [],
    type: 'hot_work', validFrom: '2026-01-01', validTo: '2027-01-01', topic: 'Safety', attendeeCount: 2, conductedBy: 'Supervisor',
    action: 'Correct condition', actionRequired: 'Correct condition', sourceType: 'audit', sourceId: 'scope-source', workerName: 'Worker', workerId: code,
    inductionDate: '2026-09-01', claimNumber: serial, submittedDays: 1, amount: 10,
    workDescription: 'Installation work', ...extra };
}
function createCase(module: string, method: string, permission: string, service: () => object, extra: Data = {}, actorField = 'createdBy') {
  cases.push({ key: `${module}.${method}`, permission, create: true, setup: async (project) => async (actor, target = project) => {
    const input = data(target, { ...extra, [actorField]: actor });
    const fn = (service() as Record<string, (input: never) => Promise<Data>>)[method];
    return fn.call(service(), input as never);
  } });
}
function transition(module: string, method: string, permission: string, seed: (p: string) => Promise<Data>, act: (actor: string, row: Data) => Promise<Data>) {
  cases.push({ key: `${module}.${method}`, permission, setup: async (project) => {
    const row = await seed(project);
    return actor => act(actor, row);
  } });
}
for (const [method, permission] of [
  ['createDrawing','engineering.drawing.create'], ['createRfi','engineering.rfi.create'],
  ['createSubmittal','engineering.submittal.create'], ['createTechnicalQuery','engineering.tq.create'],
  ['createDesignChange','engineering.design_change.create'], ['createDocument','engineering.document.create'],
  ['registerBimModel','engineering.bim_model.register'],
]) createCase('engineering', method, permission, () => eng, {}, method === 'registerBimModel' ? 'uploadedBy' : 'createdBy');
for (const [method, permission] of [
  ['createTransmittal','doccontrol.transmittal.create'], ['createCorrespondence','doccontrol.correspondence.create'],
  ['createSubmittal','doccontrol.submittal.create'], ['createRegisterEntry','doccontrol.register.create'],
]) createCase('doccontrol', method, permission, () => doc);
for (const [method, permission] of [
  ['createDelayLog','site.delay.log'], ['issueSiteInstruction','site.instruction.issue'],
  ['createMaterialConsumption','site.consumption.log'], ['createLabourAllocation','site.labour.log'],
  ['createPlantUsage','site.labour.log'],
]) createCase('site', method, permission, () => site);
cases.push({ key: 'delivery-item-map.create', permission: 'projects.project.update', setup: async p => {
  const input=await deliveryFixture(app,T,p);
  return () => app.get(DeliveryItemMapService).create(input);
} });
cases.push({ key: 'site.createInstallation', permission: 'site.labour.log', create: true, setup: async p => {
  const input=await deliveryFixture(app,T,p);
  await app.get(DeliveryItemMapService).create(input);
  return (actor,target=p) => site.createInstallation(data(target,{boqItemId:input.frozenItemKey,createdBy:actor}) as never);
} });
for (const [method, permission, field] of [
  ['raiseNcr','quality.ncr.create','raisedBy'], ['requestInspection','quality.ir.request','inspectedBy'],
  ['logSnag','quality.snag.create','createdBy'], ['createItp','quality.itp.create','createdBy'],
  ['createMaterialApproval','quality.material-approval.create','createdBy'], ['recordCalibration','quality.calibration.create','createdBy'],
]) createCase('quality', method, permission, () => quality, {}, field);
for (const [method, permission] of [
  ['reportIncident','hse.incident.create'], ['requestPermit','hse.ptw.request'],
  ['recordToolboxTalk','hse.toolbox.record'], ['raiseCapa','hse.capa.raise'],
  ['createRiskAssessment','hse.risk_assessment.create'],
]) createCase('hse', method, permission, () => hse);
createCase('cbs','create','projects.project.update',() => cbs);
createCase('wbs','create','projects.project.update',() => wbs);
createCase('variation','create','projects.variation.create',() => variations, { type: 'addition' });
// Closeout has a one-per-project invariant: each successful create gets its own project below.
createCase('closeout','start','projects.closeout.create',() => closeout);
cases.push({ key: 'quality.scheduleAudit', permission: 'quality.calibration.create', create: true,
  setup: async p => async (actor, target = p) => quality.scheduleAudit(actor, data(target) as never) });
transition('engineering','assertDrawingPerm','engineering.drawing.submit', p => eng.createDrawing(data(p) as never),
  (a,r) => eng.submitDrawing(T,a,r.id));
transition('engineering','answerRfi','engineering.rfi.answer', p => eng.createRfi(data(p) as never),
  (a,r) => eng.answerRfi(T,a,r.id,'Confirmed'));
transition('engineering','updateSubmittalStatus','engineering.submittal.update_status', p => eng.createSubmittal(data(p) as never),
  (a,r) => eng.updateSubmittalStatus(T,a,r.id,'submitted'));
transition('engineering','respondTechnicalQuery','engineering.tq.respond', p => eng.createTechnicalQuery(data(p) as never),
  (a,r) => eng.respondTechnicalQuery(T,a,r.id,'Confirmed'));
transition('engineering','decideDesignChange','engineering.design_change.decide', p => eng.createDesignChange(data(p) as never),
  (a,r) => eng.decideDesignChange(T,a,r.id,'approved'));
transition('engineering','transitionDocument','engineering.document.transition', p => eng.createDocument(data(p) as never),
  (a,r) => eng.transitionDocument(T,a,r.id,'submitted'));
transition('doccontrol','transitionTransmittal','doccontrol.transmittal.send', p => doc.createTransmittal(data(p) as never),
  (a,r) => doc.sendTransmittal(T,a,r.id));
transition('doccontrol','acknowledgeTransmittal','doccontrol.transmittal.acknowledge', async p => {
  const r = await doc.createTransmittal(data(p) as never); return doc.sendTransmittal(T,null,r.id);
}, (a,r) => doc.acknowledgeTransmittal(T,a,r.id));
transition('doccontrol','closeCorrespondence','doccontrol.correspondence.close', p => doc.createCorrespondence(data(p) as never),
  (a,r) => doc.closeCorrespondence(T,a,r.id));
transition('doccontrol','assertDocPerm','doccontrol.document.submit', async p => {
  const entry = await doc.createRegisterEntry(data(p) as never);
  return (await doc.listDocumentRevisions(T,entry.id))[0];
}, (a,r) => doc.submitDocument(T,a,r.id));
transition('site','assertReportPerm','site.daily_report.submit', p => site.createDailyReport(data(p) as never),
  (a,r) => site.submitDailyReport(T,a,r.id));
transition('site','resolveDelayLog','site.delay.resolve', p => site.createDelayLog(data(p) as never),
  (a,r) => site.resolveDelayLog(T,a,r.id));
transition('quality','assertNcrPerm','quality.ncr.plan', p => quality.raiseNcr(data(p) as never),
  (a,r) => quality.planNcrAction(T,a,r.id, { rootCause: 'Cause', correctiveAction: 'Repair', responsibleParty: 'Team', targetDate: '2026-10-01' } as never));
transition('quality','startInspection','quality.ir.approve', p => quality.requestInspection(data(p) as never),
  (a,r) => quality.startInspection(T,a,r.id));
transition('quality','resolveInspection','quality.ir.approve', p => quality.requestInspection(data(p) as never),
  (a,r) => quality.resolveInspection(T,a,r.id,'approved'));
transition('quality','resolveSnag','quality.snag.resolve', p => quality.logSnag(data(p) as never),
  (a,r) => quality.resolveSnag(T,a,r.id,'resolved'));
transition('hse','assertIncidentPermission','hse.incident.close', p => hse.reportIncident(data(p) as never),
  (a,r) => hse.investigateIncident(T,a,r.id));
async function permit(p: string) {
  const ra = await hse.createRiskAssessment(data(p) as never);
  await hse.approveRiskAssessment(T,ra.id);
  return hse.requestPermit(data(p,{riskAssessmentId:ra.id}) as never);
}
transition('hse','approvePermit','hse.ptw.approve', permit, (a,r) => hse.approvePermit(T,a,r.id));
transition('hse','assertPermitPermission','hse.ptw.approve', permit, (a,r) => hse.rejectPermit(T,a,r.id,'Unsafe'));
transition('hse','completeCapa','hse.capa.complete', p => hse.raiseCapa(data(p) as never),
  (a,r) => hse.completeCapa(T,a,r.id));
transition('variation','changeStatus','projects.variation.submit', p => variations.create(data(p,{type:'addition'}) as never),
  (a,r) => variations.changeStatus(r.id,'submitted',a));
transition('wbs','updateProgress','projects.project.update', p => wbs.create(data(p,{boqItemId:null}) as never),
  (a,r) => wbs.updateProgress(r.id,20,undefined,a));
transition('wbs','approveOpeningBaseline','projects.project.update', async p => {
  await wbs.create(data(p,{boqItemId:null,plannedValue:100}) as never); return { id:p };
}, (a,r) => wbs.approveOpeningBaseline(r.id,a));
transition('delay-eot','assertProjectAccess','projects.project.update', p => delays.createEotClaim(data(p) as never),
  (a,r) => delays.submitEotClaim(r.id,a));

async function newProject(tenantId = T) {
  return tenant.run({tenantId,companyId:null,actorId:null,correlationId:'scope-fixture'}, () => projects.create({tenantId,title:`Scope ${++serial}`}));
}
async function asActor<T>(actorId: string, action: () => Promise<T>): Promise<T> {
  const context = await auth.contextFromHeader(`Bearer ${auth.mint({sub:actorId,tenantId:T})}`);
  expect(context?.actorId).toBe(actorId);
  return tenant.run(context!, action);
}
function grants(permission: string, project: string) {
  const roleId=`role-${++serial}`;
  access.registerRole({id:roleId,name:roleId,permissions:[permission]});
  const actors={member:`member-${serial}`, outsider:`outsider-${serial}`, wrong:`wrong-${serial}`, org:`org-${serial}`};
  access.grant({userId:actors.member,roleId,scope:{kind:'resource',resourceType:'project',resourceId:project}});
  access.grant({userId:actors.outsider,roleId,scope:{kind:'resource',resourceType:'project',resourceId:other}});
  access.grant({userId:actors.wrong,roleId:'wrong-function',scope:{kind:'resource',resourceType:'project',resourceId:project}});
  access.grant({userId:actors.org,roleId,scope:{kind:'org',level:'tenant',id:T}});
  return actors;
}
describe('service scope closure — JWT ON, real application services and stores', () => {
  beforeAll(async () => {
    app = await NestFactory.create(AppModule,{logger:false});
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidUnknownValues:false}));
    app.useGlobalFilters(new AllExceptionsFilter());
    access=app.get(AccessService); auth=app.get(AuthService); tenant=app.get(TenantContext);
    app.use(async (req: {headers:{authorization?:string}}, res: {status:(n:number)=>{end:()=>void}}, next:()=>void) => {
      const ctx=await auth.contextFromHeader(req.headers.authorization);
      if(!ctx) { res.status(401).end(); return; }
      tenant.run(ctx, next);
    });
    await app.init();
    expect(auth.enabled).toBe(true);
    eng=app.get(EngineeringService); doc=app.get(DocControlService); site=app.get(SiteService);
    quality=app.get(QualityService); hse=app.get(HseService); projects=app.get(ProjectService);
    cbs=app.get(CbsService); wbs=app.get(WbsService); variations=app.get(VariationService);
    closeout=app.get(CloseoutService); delays=app.get(DelayEotService);
    mine=(await newProject()).id; other=(await newProject()).id; foreign=(await newProject('foreign-tenant')).id;
    access.registerRole({id:'wrong-function',name:'Member without function',permissions:['unrelated.entity.read']});
  });
  afterAll(async () => { await app?.close(); });

  it('covers every one of the 59 classified service assertions', () => {
    const expected=classification.filter(r=>r.key.includes('.service.ts#')).map(r=>r.evidence).sort();
    const covered=[...cases.map(c=>c.key),'safety training is worker competence'].sort();
    expect(covered).toHaveLength(59);
    expect(covered).toEqual(expected);
    expect(app.get(ProjectResolverRegistry).registeredSubjects()).toEqual([
      'commissioning/handovers/om-items','commissioning/handovers/spares','commissioning/handovers/training',
    ]);
  });

  for(const c of cases) it(`${c.key}: right scope+function, wrong scope, wrong function, governed org`, async () => {
    // Fresh project per case keeps one-per-project domain constraints real and independent.
    const p=(await newProject()).id;
    const actors=grants(c.permission,p);
    const run=await tenant.run({tenantId:T,companyId:null,actorId:null,correlationId:'fixture'},()=>c.setup(p));
    for(const actor of [actors.outsider,actors.wrong]) {
      await expect(asActor(actor,()=>run(actor))).rejects.toBeInstanceOf(AccessDeniedError);
    }
    if(c.create) {
      for(const invalid of ['missing-project',foreign]) await expect(asActor(actors.org,()=>run(actors.org,invalid))).rejects.toThrow(/not found/);
    }
    const observed: string[]=[];
    const original=access.assert.bind(access);
    const spy=vi.spyOn(access,'assert').mockImplementation((actor,target)=>{
      original(actor,target);
      observed.push(actor);
      expect(target.resource).toEqual({type:'project',id:p});
    });
    try {
      const result=await asActor(actors.member,()=>run(actors.member));
      expect(result).toBeTruthy(); expect(observed).toContain(actors.member);
      // A fresh aggregate (and sometimes project) is necessary for a second successful transition.
    } finally { spy.mockRestore(); }
    const orgProject=(await newProject()).id;
    const orgRun=await tenant.run({tenantId:T,companyId:null,actorId:null,correlationId:'fixture'},()=>c.setup(orgProject));
    expect(await asActor(actors.org,()=>orgRun(actors.org))).toBeTruthy();
  });

  it('safety training is worker competence: project membership does not confer tenant-wide recording',async()=>{
    const a=grants('hse.training.record',mine);
    await expect(asActor(a.member,()=>hse.recordSafetyTraining(data(mine,{createdBy:a.member}) as never))).rejects.toBeInstanceOf(AccessDeniedError);
    const r=await asActor(a.org,()=>hse.recordSafetyTraining(data(mine,{createdBy:a.org}) as never));
    expect(r.workerId).toBeTruthy(); expect(r).not.toHaveProperty('projectId');
  });
  it('optional-project calibration and audit retain the organization branch',async()=>{
    const a=grants('quality.calibration.create',mine);
    await expect(asActor(a.member,()=>quality.recordCalibration(data(null as never,{createdBy:a.member}) as never))).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await asActor(a.org,()=>quality.recordCalibration(data(null as never,{createdBy:a.org}) as never))).toMatchObject({projectId:null});
    await expect(asActor(a.member,()=>quality.scheduleAudit(a.member,data(null as never) as never))).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await asActor(a.org,()=>quality.scheduleAudit(a.org,data(null as never) as never))).toMatchObject({projectId:null});
  });
  it('shared Projects helper: risk and issue creates/updates remain scoped and functional',async()=>{
    for(const [service,method,permission] of [
      [app.get(ProjectRiskService),'raise','projects.risk.create'],
      [app.get(ProjectIssueService),'raise','projects.issue.create'],
    ] as const) {
      const a=grants(permission,mine);
      const invoke=(actor:string)=>(service as unknown as Record<string,(input:never)=>Promise<Data>>)[method](data(mine,{actorId:actor,likelihood:'medium',impact:'medium',area:'OTHER',severity:'MEDIUM'}) as never);
      await expect(asActor(a.outsider,()=>invoke(a.outsider))).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(asActor(a.wrong,()=>invoke(a.wrong))).rejects.toBeInstanceOf(AccessDeniedError);
      expect(await asActor(a.member,()=>invoke(a.member))).toMatchObject({projectId:mine});
      expect(await asActor(a.org,()=>invoke(a.org))).toMatchObject({projectId:mine});
      const row=await asActor(a.member,()=>invoke(a.member));
      const updatePermission=permission.replace('.create','.update');
      const u=grants(updatePermission,mine);
      for(const actor of [u.outsider,u.wrong]) await expect(asActor(actor,()=>service.update(row.id,{title:'Changed'},actor))).rejects.toBeInstanceOf(AccessDeniedError);
      expect(await asActor(u.member,()=>service.update(row.id,{title:'Member change'},u.member))).toMatchObject({projectId:mine,title:'Member change'});
      expect(await asActor(u.org,()=>service.update(row.id,{title:'Org change'},u.org))).toMatchObject({projectId:mine,title:'Org change'});
    }
  });
  it('risk materialisation derives its project from the risk and requires BOTH functions',async()=>{
    const risks=app.get(ProjectRiskService), materialise=app.get(ProjectRiskMaterialisationService);
    const a=grants('projects.risk.update',mine);
    access.registerRole({id:'issue-create-only',name:'Issue creator',permissions:['projects.issue.create']});
    const issueOnly=`issue-only-${serial}`;
    access.grant({userId:issueOnly,roleId:'issue-create-only',scope:{kind:'resource',resourceType:'project',resourceId:mine}});
    const risk=await tenant.run({tenantId:T,companyId:null,actorId:null,correlationId:'fixture'},()=>risks.raise(data(mine,{likelihood:'medium',impact:'medium',area:'OTHER'}) as never));
    for(const actor of [a.member,issueOnly,a.outsider]) await expect(asActor(actor,()=>materialise.materialise(risk.id,{actorId:actor}))).rejects.toBeInstanceOf(AccessDeniedError);
    access.grant({userId:a.member,roleId:'issue-create-only',scope:{kind:'resource',resourceType:'project',resourceId:mine}});
    const result=await asActor(a.member,()=>materialise.materialise(risk.id,{actorId:a.member}));
    expect(result.risk.status).toBe('MATERIALISED'); expect(result.issue.projectId).toBe(mine);
  });
  it('baseline approval remains authorized on idempotent replay and WBS parents cannot spoof ownership',async()=>{
    const p=(await newProject()).id; const a=grants('projects.project.update',p);
    const node=await tenant.run({tenantId:T,companyId:null,actorId:null,correlationId:'fixture'},()=>wbs.create(data(p,{plannedValue:100,boqItemId:null}) as never));
    await asActor(a.member,()=>wbs.approveOpeningBaseline(p,a.member));
    for(const actor of [a.outsider,a.wrong]) await expect(asActor(actor,()=>wbs.approveOpeningBaseline(p,actor))).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(asActor(a.org,()=>wbs.create(data(other,{parentId:node.id,createdBy:a.org}) as never))).rejects.toThrow(/parent .* not found/);
  });
  it('HTTP cannot move drawing authorization by URL/query/body or impersonate its actor',async()=>{
    const a=grants('engineering.*',mine);
    const http=request(app.getHttpServer());
    const token=auth.mint({sub:a.member,tenantId:T});
    const theirs=await tenant.run({tenantId:T,companyId:null,actorId:null,correlationId:'fixture'},()=>eng.createDrawing(data(other) as never));
    await http.post(`/api/v1/engineering/drawings/${theirs.id}/submit?projectId=${mine}`)
      .set('Authorization',`Bearer ${token}`).send({projectId:mine,createdBy:a.org}).expect(403);
    await http.post(`/api/v1/engineering/drawings?projectId=${mine}`)
      .set('Authorization',`Bearer ${token}`).send(data(other,{createdBy:a.org})).expect(403);
    await http.post('/api/v1/engineering/drawings').send(data(mine)).expect(401);
  });

  for(const prefix of ['om-items','spares','training']) it(`Commissioning ${prefix}: canonical child/parent scope, function and org through HTTP`,async()=>{
    const a=grants('commissioning.*',mine);
    const http=request(app.getHttpServer());
    const header=(actor:string)=>`Bearer ${auth.mint({sub:actor,tenantId:T})}`;
    const record=await tenant.run({tenantId:T,companyId:null,actorId:null,correlationId:'fixture'},()=>
      app.get(CommissioningService).register(data(mine,{system:'cctv'}) as never));
    const root=`/api/v1/commissioning/handovers/${prefix}`;
    const body={commissioningId:record.id,projectId:mine,title:'Client operation',deliverable:'om_manual',description:'Spare kit',quantityRequired:1};
    for(const actor of [a.outsider,a.wrong]) await http.post(root).set('Authorization',header(actor)).send(body).expect(403);
    const created=await http.post(root).set('Authorization',header(a.member)).send(body).expect(201);
    const action=prefix==='training'?'complete':'required';
    const change=prefix==='training'?{attendees:'Client operator',trainer:'Trainer',demonstrationCompleted:true}:{required:false,notes:'Not applicable to this system'};
    for(const actor of [a.outsider,a.wrong]) await http.put(`${root}/${created.body.id}/${action}?projectId=${other}`)
      .set('Authorization',header(actor)).send({...change,projectId:other,commissioningId:'spoof'}).expect(403);
    await http.put(`${root}/${created.body.id}/${action}`).set('Authorization',header(a.member)).send(change).expect(200);
    const orgCreated=await http.post(root).set('Authorization',header(a.org)).send({...body,title:'Org second',deliverable:'datasheets',description:'Org spare kit'}).expect(201);
    await http.put(`${root}/${orgCreated.body.id}/${action}`).set('Authorization',header(a.org)).send(change).expect(200);
    // Collection reads still take a requested project; they do not pretend to address a child.
    const list=await http.get(`${root}?projectId=${mine}`).set('Authorization',header(a.member)).expect(200);
    expect(list.body.some((r:Data)=>r.id===created.body.id)).toBe(true);
  });
  it('Commissioning creates reject missing/foreign projects and project-only client training remains allowed',async()=>{
    const a=grants('commissioning.*',mine); const http=request(app.getHttpServer());
    const header=(actor:string)=>`Bearer ${auth.mint({sub:actor,tenantId:T})}`;
    for(const projectId of ['missing-project',foreign]) for(const route of ['records','handovers','handovers/training']) {
      await http.post(`/api/v1/commissioning/${route}`).set('Authorization',header(a.org))
        .send(data(projectId,{system:'cctv'})).expect(404);
    }
    await http.post('/api/v1/commissioning/handovers/training').set('Authorization',header(a.member))
      .send({projectId:mine,title:'Whole-project operator training'}).expect(201);
  });
});
