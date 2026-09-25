import { expect, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * TEST FIXTURE — the approved checklist a system is commissioned against (TC-08 / TC-09).
 *
 * Since TC-08/TC-09 nothing is commissioned on points nobody approved: a record must be bound to the
 * current approved revision of its project's checklist for its canonical system, and PASS is decided
 * on that revision's mandatory points. Specs that exercise what comes AFTER commissioning — handover,
 * dossier, closeout — therefore need an approved checklist first, and get it here, the governed way:
 *
 *   a QA/QC engineer writes and publishes a template, adopts it into the project and submits it;
 *   a SECOND QA/QC engineer approves it — the preparer may not.
 *
 * Every point is declared by the calling spec. Nothing here proposes a point for any system.
 */

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;
export const QAQC = process.env.E2E_QAQC_USERNAME ?? 'u-e2e-qaqc';
export const QAQC_APPROVER = process.env.E2E_QAQC2_USERNAME ?? 'u-e2e-qaqc2';

export interface ChecklistPoint { code: string; activity: string; acceptanceCriteria: string; mandatory?: boolean; method?: string }
export interface ApprovedChecklist { itpId: string; reference: string; revision: number }

type Req = APIRequestContext;
const tokens = new Map<string, string>();

export async function tokenFor(request: Req, username: string): Promise<string> {
  const cached = tokens.get(username);
  if (cached) return cached;
  const res = await request.post(`${V1}/auth/login`, { data: { username, password: process.env.E2E_PASSWORD ?? 'e2e-password' } });
  expect(res.ok(), `${username} must be able to sign in — ${await res.text()}`).toBe(true);
  const token = ((await res.json()) as { token?: string }).token ?? '';
  expect(token, `${username} must receive a token`).not.toBe('');
  tokens.set(username, token);
  return token;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Itp { id: string; projectId: string; kind?: string; system: string | null; status: string; revision: number; reference: string; points: Array<{ code?: string }> }

/** Both QA/QC people on the project — granted by the admin, before either of them acts. */
export async function putQualityOnProject(request: Req, projectId: string): Promise<void> {
  for (const userId of [QAQC, QAQC_APPROVER]) {
    const m = await request.post(`${V1}/projects/${projectId}/members`, { headers: apiAuthHeaders(), data: { userId, roleId: 'r-qa-qc' } });
    expect([200, 201, 409].includes(m.status()), `putting ${userId} on the project: ${await m.text()}`).toBe(true);
  }
}

/**
 * The approved checklist for (project, system) carrying exactly `points`. Reused when the project
 * already has one with those codes; otherwise the next revision is prepared and approved.
 */
export async function approvedChecklist(request: Req, projectId: string, system: string, points: ChecklistPoint[]): Promise<ApprovedChecklist> {
  await putQualityOnProject(request, projectId);
  const preparer = bearer(await tokenFor(request, QAQC));
  const approver = bearer(await tokenFor(request, QAQC_APPROVER));

  const listed = await request.get(`${V1}/quality/itps?projectId=${encodeURIComponent(projectId)}`, { headers: preparer });
  expect(listed.ok(), `reading the project's checklists: ${await listed.text()}`).toBe(true);
  const current = ((await listed.json()) as Itp[])
    .find((i) => i.projectId === projectId && i.kind === 'system_commissioning' && i.system === system && i.status === 'approved');
  const codes = (list: Array<{ code?: string }>) => list.map((p) => p.code).sort().join('|');
  if (current && codes(current.points) === codes(points)) {
    return { itpId: current.id, reference: current.reference, revision: current.revision };
  }

  let draft: Itp;
  if (current) {
    const revised = await request.post(`${V1}/quality/itps/${current.id}/revise`, { headers: preparer, data: {} });
    expect(revised.status(), `revising the checklist: ${await revised.text()}`).toBe(201);
    draft = (await revised.json()) as Itp;
    const adapted = await request.put(`${V1}/quality/itps/${draft.id}/checklist`, { headers: preparer, data: { points } });
    expect(adapted.ok(), `adapting the revision: ${await adapted.text()}`).toBe(true);
  } else {
    const template = await request.post(`${V1}/quality/itp-templates`, {
      headers: preparer, data: { system, title: `${system} commissioning checklist (e2e)`, points },
    });
    expect(template.status(), `writing the template: ${await template.text()}`).toBe(201);
    const { id: templateId } = (await template.json()) as { id: string };
    const published = await request.post(`${V1}/quality/itp-templates/${templateId}/publish`, { headers: preparer, data: {} });
    expect(published.ok(), `publishing the template: ${await published.text()}`).toBe(true);
    const prepared = await request.post(`${V1}/quality/itps/system`, { headers: preparer, data: { projectId, templateId } });
    expect(prepared.status(), `adopting the template into the project: ${await prepared.text()}`).toBe(201);
    draft = (await prepared.json()) as Itp;
  }

  const submitted = await request.post(`${V1}/quality/itps/${draft.id}/submit`, { headers: preparer, data: {} });
  expect(submitted.ok(), `submitting the revision: ${await submitted.text()}`).toBe(true);
  const approved = await request.post(`${V1}/quality/itps/${draft.id}/approve`, { headers: approver, data: {} });
  expect(approved.ok(), `approving the revision (a second QA/QC person): ${await approved.text()}`).toBe(true);
  const itp = (await approved.json()) as Itp;
  return { itpId: itp.id, reference: itp.reference, revision: itp.revision };
}

/**
 * A commissioning record created FROM the approved checklist — the ordinary path. Returns the record
 * and its points keyed by code, so a spec executes exactly the points Quality approved.
 */
export async function systemFromChecklist(
  request: Req,
  input: { projectId: string; code: string; title: string; system: string; location?: string; points: ChecklistPoint[] },
  headers: Record<string, string> = apiAuthHeaders(),
): Promise<{ id: string; code: string; point: (code: string) => { id: string; pointNo: string } }> {
  const checklist = await approvedChecklist(request, input.projectId, input.system, input.points);
  const res = await request.post(`${V1}/commissioning/records`, {
    headers,
    data: { projectId: input.projectId, code: input.code, title: input.title, system: input.system, location: input.location, itpId: checklist.itpId },
  });
  expect(res.status(), `registering ${input.code} from the approved checklist: ${await res.text()}`).toBe(201);
  const record = (await res.json()) as { id: string; code: string };
  const items = (await (await request.get(`${V1}/commissioning/records/${record.id}/test-items`, { headers })).json()) as Array<{ id: string; pointNo: string }>;
  return {
    ...record,
    point: (code: string) => {
      const found = items.find((i) => i.pointNo === code);
      if (!found) throw new Error(`${input.code} has no point ${code} — the approved checklist carries ${items.map((i) => i.pointNo).join(', ')}`);
      return found;
    },
  };
}

/** Bind an already-registered record to the approved checklist, and return its points by code. */
export async function bindToChecklist(
  request: Req,
  input: { recordId: string; projectId: string; system: string; points: ChecklistPoint[] },
  headers: Record<string, string> = apiAuthHeaders(),
): Promise<(code: string) => { id: string; pointNo: string }> {
  const checklist = await approvedChecklist(request, input.projectId, input.system, input.points);
  const bound = await request.post(`${V1}/commissioning/records/${input.recordId}/checklist-binding`, { headers, data: { itpId: checklist.itpId } });
  expect(bound.status(), `binding the record to the approved checklist: ${await bound.text()}`).toBe(201);
  const items = (await (await request.get(`${V1}/commissioning/records/${input.recordId}/test-items`, { headers })).json()) as Array<{ id: string; pointNo: string }>;
  return (code: string) => {
    const found = items.find((i) => i.pointNo === code);
    if (!found) throw new Error(`no point ${code} on the bound record — it carries ${items.map((i) => i.pointNo).join(', ')}`);
    return found;
  };
}
