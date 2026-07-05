import { redirect } from 'next/navigation';

// Global search now lives inside the unified Workspace hub (keeps the query).
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<never> {
  const { q = '' } = await searchParams;
  redirect(q ? `/workspace?tab=search&q=${encodeURIComponent(q)}` : '/workspace?tab=search');
}
