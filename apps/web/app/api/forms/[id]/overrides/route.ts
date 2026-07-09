import { apiBase, authHeader } from '@/lib/api';

// BFF: effective form-override patch for a schema id (Form Designer P1).
// Read by FormDrawer before rendering so users see the admin-designed form.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/forms/${encodeURIComponent(id)}/overrides`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({ fields: {} })), { status: res.status });
  } catch {
    return Response.json({ fields: {} }, { status: 200 }); // renderer degrades to the code schema
  }
}
