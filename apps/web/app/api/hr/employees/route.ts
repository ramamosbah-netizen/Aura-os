import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    role?: string;
    department?: string;
    joinedDate?: string;
    visaExpiry?: string | null;
    permitExpiry?: string | null;
    laborCamp?: string | null;
  };

  if (!body.firstName || !body.lastName || !body.role || !body.department || !body.joinedDate) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/hr/employees`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HR API unreachable' }, { status: 502 });
  }
}

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/hr/employees`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HR API unreachable' }, { status: 502 });
  }
}
