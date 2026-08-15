// data-error — the load-failure taxonomy the UI branches on (audit gap G-05).
//
// Extracted from lib/api.ts because that module imports `next/headers` (server-only), which
// poisons any CLIENT component that only wants the error *type/description* — e.g. the composed
// <DataState> wrapper, which is inherently client (it takes a live `loading` flag). Pure data +
// pure functions, safe in both server and client bundles. lib/api.ts re-exports these, so every
// existing `@/lib/api` import is unchanged.

export type DataErrorKind = 'unauthorized' | 'forbidden' | 'not-found' | 'server' | 'unreachable';

export interface DataError {
  kind: DataErrorKind;
  /** HTTP status, or 0 when the request never reached the API. */
  status: number;
}

export type DataResult<T> = { ok: true; data: T } | { ok: false; error: DataError };

/** Map an HTTP status onto the kind the UI branches on. */
export function classifyStatus(status: number): DataErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  return 'server';
}

/** What to tell the user, and what they can do about it. */
export function describeDataError(error: DataError): { title: string; description: string } {
  switch (error.kind) {
    case 'unauthorized':
      return {
        title: 'Your session has expired',
        description: 'Sign in again to see this data. Nothing has been lost.',
      };
    case 'forbidden':
      return {
        title: "You don't have access to this",
        description:
          'Your role does not include permission to view these records. They may exist — ask an administrator if you need access.',
      };
    case 'not-found':
      return { title: 'Not found', description: 'This record no longer exists, or the link is wrong.' };
    case 'unreachable':
      return {
        title: 'Could not reach the server',
        description: 'This is a connection problem, not an empty list. Retry in a moment.',
      };
    case 'server':
    default:
      return {
        title: 'Something went wrong loading this',
        description: `The server returned an error (${error.status}). This is not an empty list — retry, and report it if it persists.`,
      };
  }
}
