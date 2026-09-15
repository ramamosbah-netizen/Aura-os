import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Read the plans, each activity carrying where its progress came from (`progress`, derived by the
// API on every read). `?projectId=` narrows to one project — callers were already sending it, and
// without it a reader taking the first row could be reading another project's plan entirely.
export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId')?.trim();
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/schedules${query}`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ([])), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

// Save a project schedule (create or replace its task list). Used by the Gantt "add task" flow,
// which reads the current tasks, appends the new one, and posts the full set.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    tasks?: unknown[];
  };
  if (!body.projectId) {
    return Response.json({ error: 'projectId required' }, { status: 400 });
  }
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/schedules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
