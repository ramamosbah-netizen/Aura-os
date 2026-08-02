import { apiBase, authHeader } from '@/lib/api';

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
    const res = await fetch(`${apiBase()}/api/v1/projects/schedules`, {
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
