import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');

  const query = new URLSearchParams();
  if (projectId) query.append('projectId', projectId);
  if (status) query.append('status', status);

  try {
    const res = await fetch(`${apiBase()}/api/v1/subcontracts?${query.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Subcontracts API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: unknown;
    projectName?: unknown;
    title?: unknown;
    subcontractorName?: unknown;
    value?: unknown;
    retentionPercentage?: unknown;
  };

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const subcontractorName = typeof body.subcontractorName === 'string' ? body.subcontractorName.trim() : '';

  if (!title) return Response.json({ error: 'title required' }, { status: 400 });
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 });
  if (!subcontractorName) return Response.json({ error: 'subcontractorName required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/v1/subcontracts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        projectId,
        projectName: typeof body.projectName === 'string' ? body.projectName : undefined,
        title,
        subcontractorName,
        value: typeof body.value === 'number' ? body.value : Number(body.value) || 0,
        retentionPercentage: typeof body.retentionPercentage === 'number' ? body.retentionPercentage : undefined,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Subcontracts API unreachable' }, { status: 502 });
  }
}
