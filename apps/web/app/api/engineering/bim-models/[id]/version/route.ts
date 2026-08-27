import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Uploads a new version of a BIM model — bumps version + revision, keeping the registry row.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    revision?: string;
    storageKey?: string;
    fileUrl?: string;
    fileSizeBytes?: number;
    status?: string;
  };

  if (!body.revision) {
    return Response.json({ error: 'revision required' }, { status: 400 });
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/engineering/bim-models/${id}/version`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Engineering API unreachable' }, { status: 502 });
  }
}
