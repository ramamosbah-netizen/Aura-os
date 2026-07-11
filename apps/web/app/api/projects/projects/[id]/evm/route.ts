import { apiBase, authHeader } from '@/lib/api';

// BFF: project EVM metrics (planned/earned/actual, SPI/CPI).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/projects/${id}/evm`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
