import { apiBase, authHeader } from '@/lib/api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  try {
    const formData = await request.formData();
    
    const res = await fetch(`${apiBase()}/api/v1/tendering/tenders/${id}/boq/upload`, {
      method: 'POST',
      headers: {
        ...(await authHeader()),
      },
      body: formData,
      cache: 'no-store',
    });
    
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Tendering API unreachable' }, { status: 502 });
  }
}
