import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string;
    periodStart?: string;
    periodEnd?: string;
    basicSalary?: number;
    allowances?: number;
    deductions?: number;
  };

  if (
    !body.employeeId ||
    !body.periodStart ||
    !body.periodEnd ||
    body.basicSalary === undefined ||
    body.allowances === undefined ||
    body.deductions === undefined
  ) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/hr/payroll`, {
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
    const res = await fetch(`${apiBase()}/api/hr/payroll`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HR API unreachable' }, { status: 502 });
  }
}
