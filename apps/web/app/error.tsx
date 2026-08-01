'use client';

import ErrorState from '@/components/ui/error-state';

// Root error boundary — catches render/data errors from any page that has no
// closer error.tsx. The user keeps the app shell and can retry or navigate away.
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState {...props} />;
}
