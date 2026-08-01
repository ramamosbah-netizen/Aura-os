import PageLoading from '@/components/ui/page-loading';

// Root loading boundary — the fallback for any navigation whose segment has no
// closer loading.tsx. Keeps the app shell (sidebar/topbar) mounted and fills the
// <main> region with a cockpit-shaped skeleton instead of blanking it.
export default function Loading() {
  return <PageLoading label="Loading…" />;
}
